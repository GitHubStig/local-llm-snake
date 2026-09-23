import { createGlobalState } from "@vueuse/core";
import { computed, ref, shallowRef } from "vue";

import { createGame } from "../game/engine.ts";
import { HumanController } from "../game/controllers/human.ts";
import { Runner, controllerShare, type MoveRecord, type Speed } from "../game/runner.ts";
import { DEFAULT_RULES, type Direction, type GameState } from "../game/types.ts";
import type { Controller } from "../game/controller.ts";
import { ModelController } from "../ai/controller.ts";
import { DEFAULT_SETTINGS, type PromptFile, type PromptSettings } from "../ai/prompt.ts";
import parityPrompt from "../prompts/jev-parity.json" with { type: "json" };
import { useProviders } from "./useProviders.ts";

const randomSeed = () => Math.floor(Math.random() * 100000);

/**
 * The single game session.
 *
 * `createGlobalState` rather than Pinia (ADR-0005). One constraint accepted
 * with it: two boards side by side would need this unpicked into a factory.
 */
export const useGame = createGlobalState(() => {
  const seed = ref(randomSeed());
  const speed = ref<Speed>("normal");
  /** Send the model the board as it will be when its answer lands (ADR-0013). */
  const project = ref(true);
  const state = shallowRef<GameState>(createGame(seed.value, DEFAULT_RULES));
  const lastMove = shallowRef<MoveRecord | null>(null);
  const running = ref(false);

  const human = new HumanController();

  const driver = ref<"human" | "model">("human");
  const selected = ref<{ providerId: string; modelId: string } | null>(null);
  const settings = ref<PromptSettings>({ ...DEFAULT_SETTINGS });
  const inFlightSince = ref<number | null>(null);
  /**
   * The model's most recent decision, kept until it makes another. Most ticks
   * under projection are straight-as-planned or forced, and showing the
   * decision only on the tick it was made left the panel blank most of the
   * time — and jumping as it filled and emptied.
   */
  const lastDecision = shallowRef<MoveRecord | null>(null);

  const providers = useProviders();

  /** Human and model are peers; takeover is a controller swap (ADR-0006). */
  function currentController(): Controller {
    if (driver.value === "human" || selected.value === null) return human;
    const { providerId, modelId } = selected.value;
    const provider = providers.providers.get(providerId);
    if (!provider) return human;

    return new ModelController({
      provider,
      model: modelId,
      // One prompt, matching the information JEV is given (ADR-0008).
      prompt: parityPrompt as PromptFile,
      settings: settings.value,
      maxTokens: 48,
    });
  }

  let runner = build();

  /**
   * A new game keeps the latencies measured for the same controller, so its
   * first request is already projected (ADR-0013). The window is reset whenever
   * the controller changes, so what carries over always belongs to this one.
   */
  function build(latencies?: readonly number[]): Runner {
    return new Runner(createGame(seed.value, DEFAULT_RULES), {
      latencies,
      seed: seed.value,
      controller: currentController(),
      speed: speed.value,
      project: project.value,
      onTick: (next, move) => {
        state.value = next;
        lastMove.value = move;
        if (move.decidedBy === "controller") lastDecision.value = move;
        if (move.latencyMs !== null && selected.value && driver.value === "model") {
          providers.recordLatency(
            selected.value.providerId,
            selected.value.modelId,
            move.latencyMs,
          );
        }
      },
      onInFlight: (since) => {
        inFlightSince.value = since;
      },
      onEnd: () => {
        running.value = false;
      },
    });
  }

  function newGame(nextSeed = randomSeed()) {
    const measured = runner.latencies;
    runner.stop();
    seed.value = nextSeed;
    runner = build(measured);
    state.value = runner.state;
    lastMove.value = null;
    lastDecision.value = null;
    running.value = false;
  }

  function play() {
    if (state.value.outcome !== null) return;
    runner.start();
    running.value = true;
  }

  function pause() {
    runner.pause();
    running.value = false;
  }

  function toggle() {
    if (running.value) pause();
    else play();
  }

  /** One tick, only meaningful while paused. */
  function stepOnce() {
    pause();
    runner.advance();
  }

  function setSpeed(next: Speed) {
    speed.value = next;
    runner.setSpeed(next);
  }

  function setProjection(on: boolean) {
    project.value = on;
    runner.setProjection(on);
  }

  /** Swap who is driving without disturbing the game in progress. */
  function applyController() {
    runner.setController(currentController());
  }

  function setDriver(next: "human" | "model") {
    driver.value = next;
    applyController();
  }

  function setModel(providerId: string, modelId: string) {
    selected.value = { providerId, modelId };
    // Preload now, so the first move of the game is not a 2s cold start.
    void providers.providers.get(providerId)?.warm(modelId);
    if (driver.value === "model") applyController();
  }

  function setSettings(next: Partial<PromptSettings>) {
    settings.value = { ...settings.value, ...next };
    if (driver.value === "model") applyController();
  }

  function press(direction: Direction) {
    human.press(direction);
  }

  const record = computed(() => runner.record);
  /** Recomputed per tick, which is when failure counts can change. */
  const failures = computed(() => {
    void state.value;
    return runner.record.failures;
  });
  const stats = computed(() => {
    const s = state.value;
    const moves = record.value.moves.length;
    return {
      food: s.foodEaten,
      steps: s.tick,
      length: s.snake.length,
      stepsPerFood: s.foodEaten === 0 ? "--" : (s.tick / s.foodEaten).toFixed(1),
      share: moves === 0 ? 0 : Math.round(controllerShare(record.value) * 100),
      forced: record.value.moves.filter((m) => m.decidedBy === "forced").length,
      planned: record.value.moves.filter((m) => m.decidedBy === "planned").length,
    };
  });

  return {
    seed,
    speed,
    state,
    lastMove,
    lastDecision,
    running,
    driver,
    selected,
    settings,
    project,
    setProjection,
    inFlightSince,
    failures,
    setDriver,
    setModel,
    setSettings,
    stats,
    record,
    newGame,
    play,
    pause,
    toggle,
    stepOnce,
    setSpeed,
    press,
  };
});
