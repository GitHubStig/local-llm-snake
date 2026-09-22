/**
 * Plays seeded games with the shipped level prompts and reports survival,
 * food and latency — so prompt changes are judged by games, not by eye.
 * Needs a running Ollama.
 *
 * Usage: node scripts/eval-prompt.ts [model] [seeds] [maxTicks] [levels] [why] [reps]
 *   levels: comma list, default 0,1,2,3,4    why: on | off | both (default both)
 *   reps:   comma list of coordinates | grid | both, default coordinates
 * Set NO_OFFSET=1 to strip {{foodOffset}} from every template, leaving the
 * board as the only description of where the food is.
 */
import { readFileSync } from "node:fs";

import { createGame, step, toView } from "../src/game/engine.ts";
import type { GameState } from "../src/game/types.ts";
import { createOllamaProvider } from "../src/ai/ollama.ts";
import { ModelController } from "../src/ai/controller.ts";
import type { AssistanceLevel, PromptFile, Representation } from "../src/ai/prompt.ts";

const model = process.argv[2] ?? "gemma4:e2b";
const seedCount = Number(process.argv[3] ?? 5);
const maxTicks = Number(process.argv[4] ?? 60);
const levels = (process.argv[5] ?? "0,1,2,3,4").split(",").map(Number) as AssistanceLevel[];
const whyModes = { on: [true], off: [false], both: [false, true] }[process.argv[6] ?? "both"] ?? [
  false,
  true,
];

const reps = (process.argv[7] ?? "coordinates").split(",") as Representation[];

const provider = createOllamaProvider("http://localhost:11434");
await provider.warm(model);

const noOffset = process.env.NO_OFFSET === "1";

const promptFor = (level: AssistanceLevel) => {
  const file = JSON.parse(readFileSync(`src/prompts/level-${level}.json`, "utf8")) as PromptFile;
  return noOffset ? { ...file, user: file.user.replace(/\{\{foodOffset\}\}\n?/, "") } : file;
};

async function play(
  level: AssistanceLevel,
  includeWhy: boolean,
  representation: Representation,
  seed: number,
) {
  let state: GameState = createGame(seed);
  const controller = new ModelController({
    provider,
    model,
    prompt: promptFor(level),
    settings: { level, representation, includeWhy },
    maxTokens: includeWhy ? 64 : 16,
    getState: () => state,
  });
  const latencies: number[] = [];
  while (state.outcome === null && state.tick < maxTicks) {
    const view = toView(state);
    const decision = await controller.decide(view, new AbortController().signal);
    latencies.push((decision.meta as { wallMs: number }).wallMs);
    state = step(state, decision.direction);
  }
  return { state, latencies };
}

console.log(
  `model ${model}, ${seedCount} seeds, cap ${maxTicks} ticks` +
    (noOffset ? ", food offset line REMOVED" : "") +
    "\n",
);
console.log("level  why   board        ticks survived          food total  alive  median");
for (const level of levels) {
  for (const includeWhy of whyModes) {
    for (const representation of reps) {
      const runs = [];
      for (let s = 0; s < seedCount; s++)
        runs.push(await play(level, includeWhy, representation, 1000 + s * 7919));
      const all = runs.flatMap((r) => r.latencies).sort((a, b) => a - b);
      console.log(
        `  ${level}    ${includeWhy ? "on " : "off"}   ${representation.padEnd(12)} ` +
          `${runs
            .map((r) => r.state.tick)
            .join(",")
            .padEnd(22)}  ` +
          `${String(runs.reduce((n, r) => n + r.state.foodEaten, 0)).padStart(5)}      ` +
          `${runs.filter((r) => r.state.outcome === null).length}/${seedCount}    ` +
          `${all[Math.floor(all.length / 2)]}ms`,
      );
    }
  }
}
