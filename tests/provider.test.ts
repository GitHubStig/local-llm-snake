import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { looksTruncated, parseCompletion, pickText } from "../src/ai/parse.ts";
import { classify } from "../src/ai/tiers.ts";
import type { AdviceRule, ModelInfo, Timings } from "../src/ai/types.ts";

const timings = (over: Partial<Timings> = {}): Timings => ({
  wallMs: 100,
  loadMs: null,
  promptTokens: 400,
  cachedPromptTokens: 390,
  completionTokens: 7,
  ...over,
});

describe("reading the response", () => {
  test("prefers content", () => {
    assert.deepEqual(pickText('{"direction":"north"}', "noise"), {
      text: '{"direction":"north"}',
      source: "content",
    });
  });

  test("falls back to thinking when content is empty", () => {
    // qwen3-vl:4b does exactly this on every call.
    const picked = pickText("", '{"direction":"east"}');
    assert.equal(picked?.source, "thinking");
  });

  test("treats whitespace-only content as empty", () => {
    assert.equal(pickText("   \n", '{"direction":"east"}')?.source, "thinking");
  });

  test("reports nothing usable rather than guessing", () => {
    assert.equal(pickText("", ""), null);
  });

  test("throws with the offending text when the reply is not JSON", () => {
    assert.throws(
      () => parseCompletion("I think north!", "content", timings(), 400),
      /not JSON: I think north!/,
    );
  });
});

describe("silent truncation", () => {
  test("flags a prompt the model evidently did not read in full", () => {
    // llama3:latest collapses to ~4108 tokens above its window, no error.
    assert.equal(looksTruncated(120_000, 4108), true);
  });

  test("leaves an ordinary prompt alone", () => {
    assert.equal(looksTruncated(1800, 430), false);
  });

  test("says nothing when the provider reports no token count", () => {
    assert.equal(looksTruncated(120_000, null), false);
  });

  test("surfaces on the parsed result", () => {
    const result = parseCompletion(
      '{"direction":"north"}',
      "content",
      timings({ promptTokens: 4108 }),
      120_000,
    );
    assert.equal(result.truncated, true);
    assert.deepEqual(result.value, { direction: "north" });
  });
});

describe("model advice", () => {
  const rules: AdviceRule[] = [
    { capability: "image", tier: "unusable", reason: "Image generation, not chat" },
    { match: "ocr", tier: "avoid", reason: "OCR-specialised" },
    { match: ":text$", tier: "avoid", reason: "Base model" },
    { minParams: 20, tier: "slow", reason: "Likely to miss the deadline" },
  ];
  const model = (over: Partial<ModelInfo>): ModelInfo => ({
    id: "gemma4:e2b",
    parameterSize: "5.1B",
    contextLength: 131072,
    capabilities: ["completion", "vision", "tools"],
    ...over,
  });

  test("leaves a usable model alone, vision included", () => {
    // Vision capability is a superset; we simply never send images.
    assert.deepEqual(classify(model({}), rules), { tier: "ok", reason: null });
  });

  test("marks a large model slow, not unusable", () => {
    const result = classify(model({ id: "qwen3.8:27b-mlx", parameterSize: "27B" }), rules);
    assert.equal(result.tier, "slow");
  });

  test("catches OCR and base models by name", () => {
    assert.equal(classify(model({ id: "glm-ocr:latest" }), rules).tier, "avoid");
    assert.equal(classify(model({ id: "llama3:text" }), rules).tier, "avoid");
  });

  test("an image generator is unusable", () => {
    const result = classify(model({ id: "x/flux2", capabilities: ["image"] }), rules);
    assert.equal(result.tier, "unusable");
  });

  test("reports the worst matching rule when several hit", () => {
    const result = classify(model({ id: "deepseek-ocr:latest", parameterSize: "30B" }), rules);
    assert.equal(result.tier, "avoid", "avoid outranks slow");
  });

  test("handles a missing parameter size", () => {
    assert.equal(classify(model({ parameterSize: null }), rules).tier, "ok");
  });
});
