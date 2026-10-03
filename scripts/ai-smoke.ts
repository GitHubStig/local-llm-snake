/**
 * Plays a few ticks against a real provider, to prove the stack end to end.
 * Not a test — it needs a running Ollama. Usage: npm run ai-smoke [model]
 */
import { readFileSync } from "node:fs";

import { createGame, step, toView } from "../src/game/engine.ts";
import { ModelController } from "../src/ai/controller.ts";
import { DecisionController, type DecisionPromptFile } from "../src/ai/decision.ts";
import { createOllamaProvider, listedModel } from "../src/ai/ollama.ts";
import { DEFAULT_SETTINGS, type PromptFile } from "../src/ai/prompt.ts";

const model = process.argv[2] ?? "tev1:latest";
const prompt = JSON.parse(readFileSync("src/prompts/jev-parity.json", "utf8")) as PromptFile;
const decisionPrompt = JSON.parse(
  readFileSync("src/prompts/jev-decision.json", "utf8"),
) as DecisionPromptFile;
const provider = createOllamaProvider("http://localhost:11434");

if (!(await provider.health())) {
  console.error("Ollama is not reachable on :11434");
  process.exit(1);
}
const isDecisionModel = listedModel(await provider.listModels(), model).capabilities.includes(
  "decision",
);
if (!(await provider.warm(model, { decision: isDecisionModel }))) {
  throw new Error(`could not load ${model}`);
}

let state = createGame(61005);
const controller = isDecisionModel
  ? new DecisionController({ provider, model, prompt: decisionPrompt })
  : new ModelController({ provider, model, prompt, settings: DEFAULT_SETTINGS, maxTokens: 64 });

console.log(`model ${model}, asked through ${isDecisionModel ? "/v1/systemone" : "chat"}\n`);
for (let i = 0; i < 8 && state.outcome === null; i++) {
  const view = toView(state);
  const decision = await controller.decide(view, new AbortController().signal);
  const meta = (decision.meta ?? {}) as Record<string, unknown>;
  console.log(
    `#${String(state.tick).padStart(2)} head (${view.snake[0].col},${view.snake[0].row}) ` +
      `-> ${String(decision.direction).padEnd(5)} ` +
      (decision.forced
        ? "forced by code"
        : `${String(meta.wallMs).padStart(4)}ms  ` +
          (isDecisionModel
            ? `confidence ${Number(meta.confidence).toFixed(2)}`
            : `out ${meta.completionTokens}`)) +
      (meta.why ? `\n    why: ${meta.why}` : ""),
  );
  state = step(state, decision.direction);
}

console.log(`\noutcome: ${state.outcome ?? "alive"}  food ${state.foodEaten}  steps ${state.tick}`);
