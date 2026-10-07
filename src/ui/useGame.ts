import { createGlobalState } from "@vueuse/core";
import { computed, ref, shallowRef } from "vue";

import { createGame } from "../game/engine.ts";
import { HumanController } from "../game/controllers/human.ts";
import { Runner, controllerShare, type MoveRecord, type Speed } from "../game/runner.ts";
import { DEFAULT_RULES, type Direction, type GameState } from "../game/types.ts";
import type { Controller } from "../game/controller.ts";
import { ModelController } from "../ai/controller.ts";
import { DEFAULT_SETTINGS, type PromptFile, type PromptSettings } from "../ai/prompt.ts";
import { DecisionController, type DecisionPromptFile } from "../ai/decision.ts";
import parityPrompt from "../prompts/jev-parity.json" with { type: "json" };
import decisionPrompt from "../prompts/jev-decision.json" with { type: "json" };
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
  /**
   * Set while Play waits for a cold model to load. Started cold, the snake
   * dies before the first answer lands, so the game starts once it has.
   */
  const loadingModel = ref(false);
  const loadError = ref<string | null>(null);

  const providers = useProviders();

  const isDecision = (providerId: string, modelId: string) =>
    providers.entries.value
      .find((e) => e.providerId === providerId && e.model.id === modelId)
      ?.model.capabilities.includes("decision") ?? false;

  /**
   * Whether the chosen model is a decision model (ADR-0014): it answers with
   * probabilities, never text, so it is asked through a different controller
   * and the chat-only settings do not apply to it.
   */
  const isDecisionModel = computed(() => {
    if (driver.value !== "model" || selected.value === null) return false;
    return isDecision(selected.value.providerId, selected.value.modelId);
  });

  /** The load in flight, so pressing Play during one waits for it, not a second. */
  let warmup: { key: string; promise: Promise<boolean>; pending: boolean } | null = null;

  function warm(providerId: string, modelId: string): Promise<boolean> {
    const key = `${providerId}:${modelId}`;
    if (warmup?.key === key && warmup.pending) return warmup.promise;
    const provider = providers.providers.get(providerId);
    const promise =
      provider?.warm(modelId, { decision: isDecision(providerId, modelId) }) ??
      Promise.resolve(false);
    const entry = { key, promise, pending: true };
    void promise.finally(() => (entry.pending = false));
    warmup = entry;
    return promise;
  }

  /** Bumped by anything that should cancel a start still waiting on a load. */
  let startToken = 0;

  function cancelStart() {
    startToken++;
    loadingModel.value = false;
  }

  /** Human and model are peers; takeover is a controller swap (ADR-0006). */
  function currentController(): Controller {
    if (driver.value === "human" || selected.value === null) return human;
    const { providerId, modelId } = selected.value;
    const provider = providers.providers.get(providerId);
    if (!provider) return human;

    if (provider.decide && isDecisionModel.value) {
      return new DecisionController({
        provider,
        model: modelId,
        prompt: decisionPrompt as DecisionPromptFile,
      });
    }

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
    cancelStart();
    const measured = runner.latencies;
    runner.stop();
    seed.value = nextSeed;
    runner = build(measured);
    state.value = runner.state;
    lastMove.value = null;
    lastDecision.value = null;
    running.value = false;
  }

  /**
   * With a model driving, play waits for the model to load, whether the game
   * is new or resumed: after a pause longer than the keep-alive it has been
   * unloaded (ADR-0007). Once loaded, that costs one quick request.
   */
  async function play() {
    if (state.value.outcome !== null || loadingModel.value) return;
    loadError.value = null;
    if (driver.value === "model" && selected.value) {
      const { providerId, modelId } = selected.value;
      const token = ++startToken;
      loadingModel.value = true;
      const loaded = await warm(providerId, modelId);
      if (token !== startToken) return;
      loadingModel.value = false;
      if (!loaded) {
        loadError.value = `Could not load ${modelId}.`;
        return;
      }
    }
    runner.start();
    running.value = true;
  }

  function pause() {
    cancelStart();
    runner.pause();
    running.value = false;
  }

  /** Pressed while a model loads, it cancels the start. */
  function toggle() {
    if (running.value || loadingModel.value) pause();
    else void play();
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
    cancelStart();
    driver.value = next;
    applyController();
  }

  function setModel(providerId: string, modelId: string) {
    cancelStart();
    selected.value = { providerId, modelId };
    // Preload now, so pressing Play usually finds the model already loaded.
    void warm(providerId, modelId);
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
    loadingModel,
    loadError,
    driver,
    selected,
    isDecisionModel,
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
