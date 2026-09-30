/**
 * Plays seeded games with the prompt and reports how models act on the facts
 * they are handed — judged by games, not by eye. Needs a running Ollama.
 *
 * Usage: node scripts/eval-prompt.ts [models] [seeds] [maxTicks] [why]
 *   models: comma list of Ollama models, `fm` for Apple Foundation Models via
 *           `fm serve`, and/or `code` — a reference that picks the obvious move
 *           from the same facts, with no model at all
 *   why:    on | off (default off; with why after the answer, moves are
 *           identical either way and only latency differs)
 *
 * DROP=heading,head,food strips those lines from the user template, to test
 * whether they help or hurt now that each option comes with facts.
 *
 * LABELS=jev names the directions up, right, down and left, as JEV's own
 * options are named, instead of the prompt file's names.
 *
 * Ollama models with the `decision` capability (Ollama 0.35+, e.g. tev1 and
 * nimble) are asked through /v1/systemone with jev-decision.json, as the app
 * asks them; every other model gets the chat prompt.
 */
import { readFileSync } from "node:fs";

import { analyze, type MoveFacts } from "../src/game/analysis.ts";
import { createGame, step, toView } from "../src/game/engine.ts";
import type { Direction, GameState } from "../src/game/types.ts";
import { createOllamaProvider, fullModelName } from "../src/ai/ollama.ts";
import { createOpenAIProvider } from "../src/ai/openai.ts";
import { ModelController } from "../src/ai/controller.ts";
import { DecisionController, type DecisionPromptFile } from "../src/ai/decision.ts";
import type { PromptFile } from "../src/ai/prompt.ts";

const models = (process.argv[2] ?? "tev1:latest").split(",");
const seedCount = Number(process.argv[3] ?? 5);
const maxTicks = Number(process.argv[4] ?? 200);
const includeWhy = process.argv[5] === "on";

const LINES: Record<string, RegExp> = {
  heading: /^Heading: \{\{heading\}\}\n/m,
  head: /^Head: \{\{head\}\}\n/m,
  food: /^Food: \{\{food\}\}\n/m,
};
const drop = (process.env.DROP ?? "").split(",").filter(Boolean);

const base = JSON.parse(readFileSync("src/prompts/jev-parity.json", "utf8")) as PromptFile;
const jevLabels = process.env.LABELS === "jev";
const prompt: PromptFile = {
  ...base,
  user: drop.reduce((user, line) => user.replace(LINES[line], ""), base.user),
  ...(jevLabels
    ? { directionNames: { north: "up", east: "right", south: "down", west: "left" } }
    : {}),
};

const decisionBase = JSON.parse(
  readFileSync("src/prompts/jev-decision.json", "utf8"),
) as DecisionPromptFile;
const decisionPrompt: DecisionPromptFile = {
  ...decisionBase,
  ...(jevLabels ? { directionNames: prompt.directionNames } : {}),
};

const ollama = createOllamaProvider("http://localhost:11434");
const decisionModels = new Set(
  (await ollama.listModels().catch(() => []))
    .filter((m) => m.capabilities.includes("decision"))
    .map((m) => m.id),
);
// Called from Node, not a browser, so no Sec-Fetch-Site header: fm serve
// accepts it directly and the dev-server proxy is not needed.
const fm = createOpenAIProvider("http://127.0.0.1:1976", "apple", "Apple Foundation Models");

/** `fm` is Apple's single on-device model; anything else is an Ollama model. */
const route = (model: string) =>
  model === "fm" ? { provider: fm, id: "system" } : { provider: ollama, id: model };

/** The obvious choice from the facts alone: the yardstick a model is measured against. */
function codeChoice(facts: MoveFacts[]): Direction {
  const escapable = facts.filter((f) => !f.deadEnd);
  const pool = escapable.length ? escapable : facts;
  return [...pool].sort(
    (a, b) =>
      Number(b.eats) - Number(a.eats) ||
      (a.foodDistance ?? 0) - (b.foodDistance ?? 0) ||
      b.reachable - a.reachable,
  )[0].direction;
}

type Tally = {
  choices: number;
  /** Picked a move marked DEAD END while an escapable option existed. */
  intoDeadEnd: number;
  /** Passed up food it could have eaten without walking into a dead end. */
  passedFood: number;
  /** Differed from the code reference's choice. */
  disagreed: number;
};

async function play(model: string, seed: number) {
  let state: GameState = createGame(seed);
  const controller =
    model === "code"
      ? null
      : decisionModels.has(fullModelName(model))
        ? new DecisionController({ provider: ollama, model, prompt: decisionPrompt })
        : new ModelController({
            provider: route(model).provider,
            model: route(model).id,
            prompt,
            settings: { includeWhy },
            maxTokens: includeWhy ? 64 : 16,
          });
  const latencies: number[] = [];
  const tally: Tally = { choices: 0, intoDeadEnd: 0, passedFood: 0, disagreed: 0 };
  let forced = 0;

  while (state.outcome === null && state.tick < maxTicks) {
    const facts = analyze(state);
    let direction: Direction;

    if (facts.length < 2) {
      direction = facts[0]?.direction ?? state.heading;
      forced++;
    } else {
      if (controller) {
        const decision = await controller.decide(toView(state), new AbortController().signal);
        direction = decision.direction;
        latencies.push((decision.meta as { wallMs: number }).wallMs);
      } else {
        direction = codeChoice(facts);
      }
      const chosen = facts.find((f) => f.direction === direction)!;
      const escapable = facts.some((f) => !f.deadEnd);
      const edible = facts.some((f) => f.eats && !f.deadEnd);
      tally.choices++;
      if (chosen.deadEnd && escapable) tally.intoDeadEnd++;
      if (edible && !chosen.eats) tally.passedFood++;
      if (direction !== codeChoice(facts)) tally.disagreed++;
    }
    state = step(state, direction);
  }
  return { state, latencies, forced, tally };
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "--");

console.log(
  `${seedCount} seeds, cap ${maxTicks} ticks, why ${includeWhy ? "on" : "off"}` +
    (drop.length ? `, lines removed: ${drop.join(", ")}` : "") +
    (jevLabels ? ", JEV's labels (up/right/down/left)" : "") +
    "\n",
);
console.log(
  "model                 ticks survived              food  len  alive  " +
    "dead-end  passed-food  differs  median  deaths",
);

for (const model of models) {
  if (model !== "code") await route(model).provider.warm(route(model).id);
  const runs = [];
  for (let s = 0; s < seedCount; s++) runs.push(await play(model, 1000 + s * 7919));

  const sum = (f: (r: (typeof runs)[number]) => number) => runs.reduce((n, r) => n + f(r), 0);
  const choices = sum((r) => r.tally.choices);
  const all = runs.flatMap((r) => r.latencies).sort((a, b) => a - b);

  // Marked, so a model that silently fell back to chat cannot pass for a
  // decision model: a bare `tev1` once did, for a whole day of measurements.
  const label = decisionModels.has(fullModelName(model)) ? `${model} [decision]` : model;
  console.log(
    `${label.padEnd(20)}  ${runs
      .map((r) => r.state.tick)
      .join(",")
      .padEnd(26)}  ` +
      `${String(sum((r) => r.state.foodEaten)).padStart(4)}  ` +
      `${String(Math.max(...runs.map((r) => r.state.snake.length))).padStart(3)}  ` +
      `${runs.filter((r) => r.state.outcome === null).length}/${seedCount}    ` +
      `${pct(
        sum((r) => r.tally.intoDeadEnd),
        choices,
      ).padStart(6)}  ` +
      `${pct(
        sum((r) => r.tally.passedFood),
        choices,
      ).padStart(9)}  ` +
      `${pct(
        sum((r) => r.tally.disagreed),
        choices,
      ).padStart(7)}  ` +
      `${(all.length ? `${all[Math.floor(all.length / 2)]}ms` : "--").padEnd(6)}  ` +
      (["crashed", "starved"] as const)
        .map((o) => `${runs.filter((r) => r.state.outcome === o).length} ${o}`)
        .join(", "),
  );
}
