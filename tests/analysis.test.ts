import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { analyze, analyzeMove, safeMoves, turnOf } from "../src/game/analysis.ts";
import { createGame } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Point, type Ruleset } from "../src/game/types.ts";

const rules = (over: Partial<Ruleset> = {}): Ruleset => ({ ...DEFAULT_RULES, ...over });
const pts = (...xs: [number, number][]): Point[] => xs.map(([col, row]) => ({ col, row }));

function game(over: Partial<GameState>): GameState {
  return { ...createGame(1), food: [], ...over };
}

describe("turns", () => {
  test("are named relative to the heading", () => {
    assert.equal(turnOf("north", "north"), "straight");
    assert.equal(turnOf("north", "east"), "right turn");
    assert.equal(turnOf("north", "west"), "left turn");
    assert.equal(turnOf("east", "south"), "right turn");
  });

  test("a reverse is named as such, for the length-1 snake that may make one", () => {
    assert.equal(turnOf("north", "south"), "turn around");
  });
});

describe("safe moves", () => {
  test("exclude the reverse and anything fatal", () => {
    // Head against the north wall: north is fatal, south is the reverse.
    const g = game({ snake: pts([6, 0], [6, 1], [6, 2]), heading: "north" });
    assert.deepEqual(safeMoves(g), ["east", "west"]);
  });
});

describe("move facts", () => {
  test("report the landing cell, food distance and room on an open board", () => {
    const g = game({ snake: pts([6, 6], [6, 7], [6, 8]), food: pts([3, 9]), heading: "north" });
    const west = analyzeMove(g, "west");

    assert.deepEqual(west.target, { col: 5, row: 6 });
    assert.equal(west.eats, false);
    assert.equal(west.foodDistance, 5);
    assert.equal(west.freeTotal, 144 - 3);
    assert.equal(west.reachable, 144 - 3, "the whole open board, the new head excluded");
    assert.equal(west.deadEnd, false);
  });

  test("notice a move that eats", () => {
    const g = game({ snake: pts([6, 6], [6, 7], [6, 8]), food: pts([6, 5]), heading: "north" });
    const north = analyzeMove(g, "north");
    assert.equal(north.eats, true);
    assert.equal(north.foodDistance, 0);
    // Eating keeps the tail, so the body after the move is one longer.
    assert.equal(north.freeTotal, 144 - 4);
  });

  test("flag a dead end that one-step safety cannot see", () => {
    // 4 x 3. West walks into the (0,0) corner, sealed by the body, with the
    // tail far away on the other side: safe for one step, lost after it.
    //   . H . F        H = head (1,0), heading north
    //   o o o T        body wraps round through the bottom row
    //   o o o o
    const g = game({
      rules: rules({ width: 4, height: 3 }),
      snake: pts([1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 1]),
      food: pts([3, 0]),
      heading: "north",
    });
    const facts = analyze(g);

    assert.deepEqual(
      facts.map((f) => f.direction),
      ["east", "west"],
    );
    const west = facts.find((f) => f.direction === "west");
    assert.equal(west?.reachable, 0);
    assert.equal(west?.canReachTail, false);
    assert.equal(west?.deadEnd, true);
    assert.equal(facts.find((f) => f.direction === "east")?.deadEnd, false);
  });

  test("do not call a pocket a dead end when the tail can be followed out", () => {
    // Column 2 walled off with the tail beside the pocket: small, but escapable.
    const g = game({
      rules: rules({ width: 5, height: 3 }),
      snake: pts([2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [3, 2], [2, 2]),
      food: pts([3, 1]),
      heading: "south",
    });
    const west = analyzeMove(g, "west");
    assert.ok(west.reachable < 8, "less room than the snake is long");
    assert.equal(west.canReachTail, true);
    assert.equal(west.deadEnd, false);
  });
});
