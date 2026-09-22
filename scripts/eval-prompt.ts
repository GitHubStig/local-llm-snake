/**
 * Plays seeded games with the prompt and reports survival, food, forced moves
 * and latency — so prompt changes are judged by games, not by eye. Needs a
 * running Ollama.
 *
 * Usage: node scripts/eval-prompt.ts [model] [seeds] [maxTicks] [why]
 *   why: on | off | both (default off; with why after the answer, both give
 *   identical moves and differ only in latency)
 */
import { readFileSync } from "node:fs";

import { createGame, step, toView } from "../src/game/engine.ts";
import type { GameState } from "../src/game/types.ts";
import { createOllamaProvider } from "../src/ai/ollama.ts";
import { ModelController } from "../src/ai/controller.ts";
import type { PromptFile } from "../src/ai/prompt.ts";

const model = process.argv[2] ?? "gemma4:e2b";
const seedCount = Number(process.argv[3] ?? 5);
const maxTicks = Number(process.argv[4] ?? 60);
const whyModes = { on: [true], off: [false], both: [false, true] }[process.argv[5] ?? "off"] ?? [
  false,
];

const prompt = JSON.parse(readFileSync("src/prompts/jev-parity.json", "utf8")) as PromptFile;
const provider = createOllamaProvider("http://localhost:11434");
await provider.warm(model);

async function play(includeWhy: boolean, seed: number) {
  let state: GameState = createGame(seed);
  const controller = new ModelController({
    provider,
    model,
    prompt,
    settings: { includeWhy },
    maxTokens: includeWhy ? 64 : 16,
    getState: () => state,
  });
  const latencies: number[] = [];
  let forced = 0;
  while (state.outcome === null && state.tick < maxTicks) {
    const decision = await controller.decide(toView(state), new AbortController().signal);
    if (decision.forced) forced++;
    else latencies.push((decision.meta as { wallMs: number }).wallMs);
    state = step(state, decision.direction);
  }
  return { state, latencies, forced };
}

console.log(`model ${model}, ${seedCount} seeds, cap ${maxTicks} ticks\n`);
console.log("why   ticks survived          food total  alive  forced  median");
for (const includeWhy of whyModes) {
  const runs = [];
  for (let s = 0; s < seedCount; s++) runs.push(await play(includeWhy, 1000 + s * 7919));
  const all = runs.flatMap((r) => r.latencies).sort((a, b) => a - b);
  console.log(
    `${includeWhy ? "on " : "off"}   ` +
      `${runs
        .map((r) => r.state.tick)
        .join(",")
        .padEnd(22)}  ` +
      `${String(runs.reduce((n, r) => n + r.state.foodEaten, 0)).padStart(5)}      ` +
      `${runs.filter((r) => r.state.outcome === null).length}/${seedCount}    ` +
      `${String(runs.reduce((n, r) => n + r.forced, 0)).padStart(5)}   ` +
      `${all[Math.floor(all.length / 2)] ?? "--"}ms`,
  );
}
