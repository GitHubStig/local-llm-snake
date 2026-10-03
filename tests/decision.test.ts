import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../src/game/analysis.ts";
import { createGame, toView } from "../src/game/engine.ts";
import type { GameState, Point } from "../src/game/types.ts";
import {
  DecisionController,
  buildDecisionRequest,
  type DecisionPromptFile,
} from "../src/ai/decision.ts";
import { fullModelName, parseDecision } from "../src/ai/ollama.ts";
import type { DecisionRequest, Provider } from "../src/ai/types.ts";
import shipped from "../src/prompts/jev-decision.json" with { type: "json" };

const prompt = shipped as DecisionPromptFile;
const pts = (...xs: [number, number][]): Point[] => xs.map(([col, row]) => ({ col, row }));

/** Head (6,6) heading north, body trailing south, one food at (3,9). */
const board = (over: Partial<GameState> = {}): GameState => ({
  ...createGame(1),
  snake: pts([6, 6], [6, 7], [6, 8]),
  food: pts([3, 9]),
  heading: "north",
  ...over,
});

describe("decision request", () => {
  const state = board();
  const req = buildDecisionRequest(prompt, toView(state), analyze(state));

  test("carries the state JEV's request carries", () => {
    assert.deepEqual(req.state.head, { row: 6, col: 6 });
    assert.deepEqual(req.state.food, { row: 9, col: 3 });
    assert.equal(req.state.heading, "north");
    assert.equal(req.state.snakeLength, 3);
    assert.deepEqual(req.state.gridSize, { rows: 12, cols: 12 });
    assert.equal(req.state.foodIsAdjacent, false);
    assert.equal(req.state.legend, prompt.legend);
    const rows = req.state.board as string[];
    assert.equal(rows.length, 12);
    assert.equal(rows[6][6], "H");
  });

  test("has one criterion per safe move, turn first, with the same facts as the chat prompt", () => {
    assert.deepEqual(Object.keys(req.criteria), ["north", "east", "west"]);
    assert.equal(
      req.criteria.west,
      "left turn; the head moves to row 6, column 5; the food is 5 steps away after " +
        "this move; 141 of 141 empty cells stay reachable; the tail can still be followed out",
    );
  });

  test("never offers a fatal move", () => {
    // Against the north wall, north would leave the grid.
    const walled = board({ snake: pts([6, 0], [6, 1], [6, 2]) });
    const r = buildDecisionRequest(prompt, toView(walled), analyze(walled));
    assert.ok(!("north" in r.criteria));
  });
});

/** A provider that answers every decision with `choice`, recording requests. */
function fakeDecider(choice: string) {
  const calls: DecisionRequest[] = [];
  const provider: Provider = {
    id: "fake",
    label: "Fake",
    health: async () => true,
    warm: async () => true,
    listModels: async () => [],
    complete: async () => {
      throw new Error("a decision model is never asked to complete text");
    },
    decide: async (request) => {
      calls.push(request);
      return {
        choice,
        probabilities: { [choice]: 0.9 },
        confidence: 0.8,
        wallMs: 40,
        inputTokens: 219,
        raw: "{}",
      };
    },
  };
  return { provider, calls };
}

const decide = (c: DecisionController, s: GameState) =>
  c.decide(toView(s), new AbortController().signal);

describe("decision controller", () => {
  test("turns the model's choice into a move, keeping its probabilities", async () => {
    const fake = fakeDecider("west");
    const c = new DecisionController({ provider: fake.provider, model: "tev1", prompt });
    const decision = await decide(c, board());
    assert.equal(decision.direction, "west");
    assert.equal(fake.calls.length, 1);
    assert.deepEqual((decision.meta as { probabilities: unknown }).probabilities, { west: 0.9 });
  });

  test("decides in code, without calling the model, when only one move is safe", async () => {
    // 3 x 3, heading east: north is the wall, west the reverse, south the body.
    const trapped: GameState = {
      ...createGame(1),
      rules: { ...createGame(1).rules, width: 3, height: 3 },
      snake: pts([1, 0], [0, 0], [0, 1], [1, 1], [2, 1], [2, 2]),
      food: [],
      heading: "east",
    };
    const fake = fakeDecider("east");
    const c = new DecisionController({ provider: fake.provider, model: "tev1", prompt });
    const decision = await decide(c, trapped);
    assert.equal(fake.calls.length, 0);
    assert.equal(decision.forced, true);
  });

  test("rejects a choice it was never offered", async () => {
    const walled = board({ snake: pts([6, 0], [6, 1], [6, 2]) });
    const fake = fakeDecider("north");
    const c = new DecisionController({ provider: fake.provider, model: "tev1", prompt });
    await assert.rejects(decide(c, walled), /not offered: north/);
  });
});

describe("reading a /v1/systemone response", () => {
  test("takes the choice, probabilities and confidence", () => {
    const raw = JSON.stringify({
      model: "tev1",
      answers: {
        move: {
          type: "choice",
          choice: "west",
          probabilities: { north: 0.38, east: 0.1, west: 0.52 },
          confidence: 0.15,
        },
      },
      usage: { input_tokens: 219, output_tokens: 1 },
    });
    const r = parseDecision(raw, 40);
    assert.equal(r.choice, "west");
    assert.equal(r.probabilities.west, 0.52);
    assert.equal(r.confidence, 0.15);
    assert.equal(r.inputTokens, 219);
    assert.equal(r.wallMs, 40);
  });

  test("fails loudly when there is no choice", () => {
    assert.throws(() => parseDecision('{"answers":{}}', 40), /no choice/);
  });
});

describe("model names", () => {
  // A bare `tev1` failed to match the listed `tev1:latest`, and the scripts
  // quietly asked it through chat instead.
  test("a bare name means its latest tag", () => {
    assert.equal(fullModelName("tev1"), "tev1:latest");
    assert.equal(fullModelName("tev1:latest"), "tev1:latest");
    assert.equal(fullModelName("gemma4:31b-mlx"), "gemma4:31b-mlx");
  });
});
