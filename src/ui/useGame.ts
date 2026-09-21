import { createGlobalState } from "@vueuse/core";
import { computed, ref, shallowRef } from "vue";

import { createGame } from "../game/engine.ts";
import { HumanController } from "../game/controllers/human.ts";
import { Runner, controllerShare, type MoveRecord, type Speed } from "../game/runner.ts";
import { DEFAULT_RULES, type Direction, type GameState } from "../game/types.ts";

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
  const state = shallowRef<GameState>(createGame(seed.value, DEFAULT_RULES));
  const lastMove = shallowRef<MoveRecord | null>(null);
  const running = ref(false);

  const human = new HumanController();
  let runner = build();

  function build(): Runner {
    return new Runner(createGame(seed.value, DEFAULT_RULES), {
      seed: seed.value,
      controller: human,
      speed: speed.value,
      onTick: (next, move) => {
        state.value = next;
        lastMove.value = move;
      },
      onEnd: () => {
        running.value = false;
      },
    });
  }

  function newGame(nextSeed = randomSeed()) {
    runner.stop();
    seed.value = nextSeed;
    runner = build();
    state.value = runner.state;
    lastMove.value = null;
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

  function press(direction: Direction) {
    human.press(direction);
  }

  const record = computed(() => runner.record);
  const stats = computed(() => {
    const s = state.value;
    const moves = record.value.moves.length;
    return {
      food: s.foodEaten,
      steps: s.tick,
      length: s.snake.length,
      stepsPerFood: s.foodEaten === 0 ? "--" : (s.tick / s.foodEaten).toFixed(1),
      share: moves === 0 ? 0 : Math.round(controllerShare(record.value) * 100),
    };
  });

  return {
    seed,
    speed,
    state,
    lastMove,
    running,
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
