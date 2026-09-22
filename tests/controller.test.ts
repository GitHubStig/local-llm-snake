import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ModelController } from "../src/ai/controller.ts";
import type { PromptFile } from "../src/ai/prompt.ts";
import type { CompletionRequest, Provider } from "../src/ai/types.ts";
import { createGame, toView } from "../src/game/engine.ts";
import type { GameState, Point } from "../src/game/types.ts";
import shippedPrompt from "../src/prompts/jev-parity.json" with { type: "json" };

const pts = (...xs: [number, number][]): Point[] => xs.map(([col, row]) => ({ col, row }));

/** A provider that answers with a fixed direction and records every call. */
function fakeProvider(answer: string) {
  const calls: CompletionRequest[] = [];
  const provider: Provider = {
    id: "fake",
    label: "Fake",
    health: async () => true,
    warm: async () => {},
    listModels: async () => [],
    complete: async (request) => {
      calls.push(request);
      return {
        value: { direction: answer },
        raw: JSON.stringify({ direction: answer }),
        source: "content",
        truncated: false,
        timings: {
          wallMs: 1,
          loadMs: null,
          promptTokens: null,
          cachedPromptTokens: null,
          completionTokens: null,
        },
      };
    },
  };
  return { provider, calls };
}

function controllerFor(state: GameState, answer: string) {
  const fake = fakeProvider(answer);
  const controller = new ModelController({
    provider: fake.provider,
    model: "fake",
    prompt: shippedPrompt as PromptFile,
    settings: { includeWhy: false },
    getState: () => state,
  });
  return { controller, calls: fake.calls };
}

const decide = (c: ModelController, state: GameState) =>
  c.decide(toView(state), new AbortController().signal);

describe("model controller", () => {
  test("asks the model when there is a real choice", async () => {
    const state = { ...createGame(1), food: pts([3, 9]) };
    const { controller, calls } = controllerFor(state, "west");
    const decision = await decide(controller, state);

    assert.equal(calls.length, 1);
    assert.equal(decision.direction, "west");
    assert.notEqual(decision.forced, true);
  });

  test("decides in code, without calling the model, when only one move is safe", async () => {
    // 3 x 3, heading east. North is the wall, west the reverse, south the body:
    //   o H .
    //   o o o
    //   . . T
    const state: GameState = {
      ...createGame(1),
      rules: { ...createGame(1).rules, width: 3, height: 3 },
      snake: pts([1, 0], [0, 0], [0, 1], [1, 1], [2, 1], [2, 2]),
      food: [],
      heading: "east",
    };
    const { controller, calls } = controllerFor(state, "east");
    const decision = await decide(controller, state);

    assert.equal(calls.length, 0, "the model is never asked");
    assert.equal(decision.direction, "east");
    assert.equal(decision.forced, true);
  });

  test("rejects a direction it was never offered", async () => {
    const state = { ...createGame(1), snake: pts([6, 0], [6, 1], [6, 2]), food: pts([3, 9]) };
    // North is the wall here, so it is not among the options.
    const { controller } = controllerFor(state, "north");
    await assert.rejects(decide(controller, state), /unusable direction: north/);
  });
});
