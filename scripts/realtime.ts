/**
 * Plays real-time games — the runner's own clock driving a real model — with
 * projection on and off, to see whether planning ahead lets a slow model's
 * judgement count (ADR-0013). Unlike eval-prompt.ts, latency matters here.
 * Needs a running Ollama, or `fm serve` for `fm`.
 *
 * Usage: node scripts/realtime.ts [model] [speed] [seeds] [maxTicks]
 *
 * Ollama decision models (capability `decision`) are asked through
 * /v1/systemone, as the app asks them.
 */
import { readFileSync } from "node:fs";

import { createGame } from "../src/game/engine.ts";
import { Runner, controllerShare, type RunRecord, type Speed } from "../src/game/runner.ts";
import type { GameState } from "../src/game/types.ts";
import { ModelController } from "../src/ai/controller.ts";
import { createOllamaProvider } from "../src/ai/ollama.ts";
import { createOpenAIProvider } from "../src/ai/openai.ts";
import { DecisionController, type DecisionPromptFile } from "../src/ai/decision.ts";
import type { PromptFile } from "../src/ai/prompt.ts";

const model = process.argv[2] ?? "llama3:latest";
const speed = (process.argv[3] ?? "normal") as Speed;
const seedCount = Number(process.argv[4] ?? 3);
const maxTicks = Number(process.argv[5] ?? 150);

const prompt = JSON.parse(readFileSync("src/prompts/jev-parity.json", "utf8")) as PromptFile;
const route =
  model === "fm"
    ? { provider: createOpenAIProvider("http://127.0.0.1:1976", "apple", "Apple"), id: "system" }
    : { provider: createOllamaProvider("http://localhost:11434"), id: model };

const decisionPrompt = JSON.parse(
  readFileSync("src/prompts/jev-decision.json", "utf8"),
) as DecisionPromptFile;
const isDecisionModel =
  model !== "fm" &&
  (await route.provider.listModels()).some(
    (m) => m.id === model && m.capabilities.includes("decision"),
  );

type Result = { state: GameState; record: RunRecord; latencies: readonly number[] };

/** `latencies` carry over from the previous game, as they do in the UI. */
function play(project: boolean, seed: number, latencies: readonly number[]): Promise<Result> {
  return new Promise((resolve) => {
    const controller = isDecisionModel
      ? new DecisionController({ provider: route.provider, model, prompt: decisionPrompt })
      : new ModelController({
          provider: route.provider,
          model: route.id,
          prompt,
          settings: { includeWhy: false },
          maxTokens: 16,
        });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      runner.stop();
      resolve({ state: runner.state, record: runner.record, latencies: runner.latencies });
    };
    const runner: Runner = new Runner(createGame(seed), {
      seed,
      controller,
      speed,
      project,
      latencies,
      onTick: (state) => {
        if (state.tick >= maxTicks) finish();
      },
      onEnd: finish,
    });
    runner.start();
  });
}

const median = (xs: number[]) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "--");

await route.provider.warm(route.id);
console.log(`${model} at ${speed}, ${seedCount} seeds, cap ${maxTicks} ticks, real time\n`);
console.log(
  "projection  ticks            food  alive  share    ahead  on time  " +
    "planned  late-unsafe  timed-out  died-waiting  legal-fatal",
);

for (const project of [false, true]) {
  const runs = [];
  // The first game of each mode starts cold; later ones inherit its latencies.
  let carried: readonly number[] = [];
  for (let s = 0; s < seedCount; s++) {
    const run = await play(project, 1000 + s * 7919, carried);
    carried = run.latencies;
    runs.push(run);
  }

  const moves = runs.flatMap((r) => r.record.moves.filter((m) => m.decidedBy === "controller"));
  const failure = (k: keyof RunRecord["failures"]) =>
    runs.reduce((n, r) => n + r.record.failures[k], 0);
  const share = runs.reduce((n, r) => n + controllerShare(r.record), 0) / runs.length;

  console.log(
    `${(project ? "on" : "off").padEnd(10)}  ` +
      `${runs
        .map((r) => r.state.tick)
        .join(",")
        .padEnd(15)}  ` +
      `${String(runs.reduce((n, r) => n + r.state.foodEaten, 0)).padStart(4)}  ` +
      `${runs.filter((r) => r.state.outcome === null).length}/${seedCount}    ` +
      `${`${Math.round(share * 100)}%`.padStart(4)}  ` +
      `${String(median(moves.map((m) => m.horizon))).padStart(7)}  ` +
      `${pct(moves.filter((m) => m.lateness === 0).length, moves.length).padStart(7)}  ` +
      `${String(runs.reduce((n, r) => n + r.record.moves.filter((m) => m.decidedBy === "planned").length, 0)).padStart(7)}  ` +
      `${String(failure("lateUnsafe")).padStart(11)}  ` +
      `${String(failure("timedOut")).padStart(9)}  ` +
      `${String(failure("diedWaiting")).padStart(12)}  ` +
      `${String(failure("gameInvalid")).padStart(11)}`,
  );
}
