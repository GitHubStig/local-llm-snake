import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  createGame,
  hungerLimit,
  isImmediatelySafe,
  legalMoves,
  reachableSpace,
  step,
} from "../src/game/engine.ts";
import { deriveStreams, nextInt } from "../src/game/prng.ts";
import { DEFAULT_RULES, type GameState, type Ruleset } from "../src/game/types.ts";

const rules = (over: Partial<Ruleset> = {}): Ruleset => ({ ...DEFAULT_RULES, ...over });

/** A board with no food, so tests control when eating happens. */
function bare(over: Partial<GameState> = {}): GameState {
  return {
    rules: rules(),
    snake: [
      { col: 6, row: 6 },
      { col: 6, row: 7 },
      { col: 6, row: 8 },
    ],
    food: [],
    heading: "north",
    tick: 0,
    ticksSinceFood: 0,
    foodEaten: 0,
    outcome: null,
    rng: deriveStreams(1),
    ...over,
  };
}

describe("prng", () => {
  test("is deterministic for a given cursor", () => {
    const a = nextInt(deriveStreams(61005).food, 100);
    const b = nextInt(deriveStreams(61005).food, 100);
    assert.deepEqual(a, b);
  });

  test("derives independent streams so a controller cannot shift the food", () => {
    const s = deriveStreams(61005);
    assert.notEqual(s.food, s.tiebreak);
  });
});

describe("createGame", () => {
  test("starts centred, heading north, body trailing south", () => {
    const g = createGame(1);
    assert.deepEqual(g.snake[0], { col: 6, row: 6 });
    assert.deepEqual(g.snake.at(-1), { col: 6, row: 8 });
    assert.equal(g.heading, "north");
  });

  test("places the configured amount of food, never on the snake", () => {
    const g = createGame(1, rules({ foodCount: 3 }));
    assert.equal(g.food.length, 3);
    for (const f of g.food) {
      assert.ok(!g.snake.some((s) => s.col === f.col && s.row === f.row));
    }
  });

  test("the same seed yields the same board", () => {
    assert.deepEqual(createGame(61005).food, createGame(61005).food);
  });
});

describe("legalMoves", () => {
  test("excludes the reverse, leaving three", () => {
    assert.deepEqual(legalMoves(bare()), ["north", "east", "west"]);
  });

  test("offers all four at length 1, where there is no neck", () => {
    assert.equal(legalMoves(bare({ snake: [{ col: 6, row: 6 }] })).length, 4);
  });
});

describe("step", () => {
  test("moves the head and drags the tail", () => {
    const next = step(bare(), "north");
    assert.deepEqual(next.snake[0], { col: 6, row: 5 });
    assert.equal(next.snake.length, 3);
    assert.equal(next.tick, 1);
  });

  test("ignores a reverse rather than dying to it", () => {
    const next = step(bare(), "south");
    assert.equal(next.outcome, null);
    assert.deepEqual(next.snake[0], { col: 6, row: 5 });
  });

  test("crashes into a wall", () => {
    const next = step(bare({ snake: [{ col: 6, row: 0 }] }), "north");
    assert.equal(next.outcome, "crashed");
  });

  test("crashes into itself", () => {
    const coiled = bare({
      snake: [
        { col: 5, row: 5 },
        { col: 6, row: 5 },
        { col: 6, row: 6 },
        { col: 5, row: 6 },
        { col: 4, row: 6 },
      ],
      heading: "west",
    });
    assert.equal(step(coiled, "south").outcome, "crashed");
  });

  test("survives following its own tail, which vacates on the same tick", () => {
    const chasing = bare({
      snake: [
        { col: 5, row: 5 },
        { col: 6, row: 5 },
        { col: 6, row: 6 },
        { col: 5, row: 6 },
      ],
      heading: "west",
    });
    assert.equal(step(chasing, "south").outcome, null);
  });

  test("eating grows the snake and resets hunger", () => {
    const g = bare({ food: [{ col: 6, row: 5 }], ticksSinceFood: 40 });
    const next = step(g, "north");
    assert.equal(next.snake.length, 4);
    assert.equal(next.foodEaten, 1);
    assert.equal(next.ticksSinceFood, 0);
  });

  test("replaces eaten food so the count is maintained", () => {
    const next = step(bare({ food: [{ col: 6, row: 5 }] }), "north");
    assert.equal(next.food.length, 1);
    assert.notDeepEqual(next.food[0], { col: 6, row: 5 });
  });

  test("starves, and starving is not crashing", () => {
    const starving = bare({ ticksSinceFood: hungerLimit(DEFAULT_RULES, 3) - 1 });
    assert.equal(step(starving, "north").outcome, "starved");
  });

  test("a finished game ignores further steps", () => {
    const dead = bare({ outcome: "crashed" });
    assert.equal(step(dead, "north"), dead);
  });

  test("does not mutate the state it is given", () => {
    const before = bare();
    const snapshot = structuredClone(before); // Ruleset is serialisable by design
    step(before, "north");
    assert.deepEqual(before, snapshot);
  });
});

describe("opt-in analysis", () => {
  test("isImmediatelySafe rejects walls and body, accepts open floor", () => {
    const g = bare({ snake: [{ col: 0, row: 0 }], heading: "east" });
    assert.equal(isImmediatelySafe(g, "west"), false);
    assert.equal(isImmediatelySafe(g, "east"), true);
  });

  test("reachableSpace exposes a pocket that one-ply safety cannot see", () => {
    // The body walls off column 2 top to bottom, so west is a sealed 8-cell
    // pocket while east is open. Both look equally safe at one ply.
    const walled = bare({
      rules: rules({ width: 6, height: 4 }),
      snake: [
        { col: 2, row: 0 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ],
      heading: "north",
    });
    assert.equal(isImmediatelySafe(walled, "west"), true);
    assert.equal(isImmediatelySafe(walled, "east"), true);
    assert.equal(reachableSpace(walled, "west"), 8);
    assert.equal(reachableSpace(walled, "east"), 12);
  });
});
