/**
 * Plays a few ticks against a real provider, to prove the stack end to end.
 * Not a test — it needs a running Ollama. Usage: npm run ai-smoke [model]
 */
import { readFileSync } from "node:fs";

import { createGame, step, toView } from "../src/game/engine.ts";
import { ModelController } from "../src/ai/controller.ts";
import { createOllamaProvider } from "../src/ai/ollama.ts";
import { DEFAULT_SETTINGS, type PromptFile } from "../src/ai/prompt.ts";

const model = process.argv[2] ?? "llama3:latest";
const prompt = JSON.parse(readFileSync("src/prompts/jev-parity.json", "utf8")) as PromptFile;
const provider = createOllamaProvider("http://localhost:11434");

if (!(await provider.health())) {
  console.error("Ollama is not reachable on :11434");
  process.exit(1);
}
await provider.warm(model);

let state = createGame(61005);
const controller = new ModelController({
  provider,
  model,
  prompt,
  settings: DEFAULT_SETTINGS,
  maxTokens: 64,
});

console.log(`model ${model}\n`);
for (let i = 0; i < 8 && state.outcome === null; i++) {
  const view = toView(state);
  const decision = await controller.decide(view, new AbortController().signal);
  const meta = (decision.meta ?? {}) as Record<string, unknown>;
  console.log(
    `#${String(state.tick).padStart(2)} head (${view.snake[0].col},${view.snake[0].row}) ` +
      `-> ${String(decision.direction).padEnd(5)} ` +
      (decision.forced
        ? "forced by code"
        : `${String(meta.wallMs).padStart(4)}ms  out ${meta.completionTokens}`) +
      (meta.why ? `\n    why: ${meta.why}` : ""),
  );
  state = step(state, decision.direction);
}

console.log(`\noutcome: ${state.outcome ?? "alive"}  food ${state.foodEaten}  steps ${state.tick}`);
