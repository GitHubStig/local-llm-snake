/**
 * Times decision requests of increasing length, to separate the fixed cost of
 * a request from the cost of each token the model reads (findings.md §19).
 * A decision model only reads, so comparing this across formats of one model
 * (Q8_0, nvfp4, mxfp8, bf16) shows where their speeds differ. Needs a running
 * Ollama; unloads every model before each one is measured.
 *
 * Usage: node scripts/prefill-latency.ts [models] [reps]
 *   models: comma list of Ollama decision models
 *   reps:   requests per length (default 8)
 *
 * The longest request is about 1,900 tokens, under tev1's 2,050-token context.
 */
import { createOllamaProvider, listedModel } from "../src/ai/ollama.ts";
import { nextInt } from "../src/game/prng.ts";
import { quietMachine } from "./quiet.ts";

const models = (process.argv[2] ?? "tev1:latest").split(",");
const reps = Number(process.argv[3] ?? 8);
if (!(Number.isInteger(reps) && reps > 0)) {
  throw new Error(`reps must be a positive integer, got "${process.argv[3]}"`);
}

/** Filler rows in `state`; each is about 9 tokens. */
const LENGTHS = [0, 40, 110, 190];
const WORDS = "north south east west apple wall tail head empty cell row column".split(" ");

const provider = createOllamaProvider("http://localhost:11434");
const listed = await provider.listModels();
for (const model of models) {
  if (!listedModel(listed, model).capabilities.includes("decision")) {
    throw new Error(`${model} is not a decision model`);
  }
}

// Every request differs, since /v1/systemone answers an exact repeat from
// cache (findings.md §16).
let request = 0;
async function time(model: string, rows: number): Promise<{ ms: number; tokens: number }> {
  request++;
  let cursor = request;
  const notes = Array.from({ length: rows }, (_, i) => {
    const words = Array.from({ length: 5 }, () => {
      const next = nextInt(cursor, WORDS.length);
      cursor = next.cursor;
      return WORDS[next.value];
    });
    return `${i}: ${words.join(" ")}`;
  });
  const result = await provider.decide!({
    model,
    state: rows ? { tick: request, notes } : { tick: request },
    instructions: "Pick the better option.",
    criteria: { a: `option a ${request}`, b: "option b" },
  });
  if (result.inputTokens === null) throw new Error(`${model} reported no input tokens`);
  return { ms: result.wallMs, tokens: result.inputTokens };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Least-squares slope of median latency against tokens, per 1,000 tokens. */
function perThousand(points: { tokens: number; ms: number }[]): number {
  const mx = points.reduce((n, p) => n + p.tokens, 0) / points.length;
  const my = points.reduce((n, p) => n + p.ms, 0) / points.length;
  const num = points.reduce((n, p) => n + (p.tokens - mx) * (p.ms - my), 0);
  const den = points.reduce((n, p) => n + (p.tokens - mx) ** 2, 0);
  return (1000 * num) / den;
}

console.log(`${reps} requests per length, asked through /v1/systemone\n`);
console.log(
  "model                     " +
    LENGTHS.map((_, i) => `len ${i + 1}`.padStart(16)).join("") +
    "   per 1,000 tokens",
);

for (const model of models) {
  await quietMachine();
  for (let i = 0; i < 3; i++) await time(model, 10); // load and warm

  const samples = LENGTHS.map(() => [] as number[]);
  const tokens = LENGTHS.map(() => 0);
  // Rotate the order of lengths, so drift falls on all of them alike.
  for (let r = 0; r < reps; r++) {
    for (let k = 0; k < LENGTHS.length; k++) {
      const i = (k + r) % LENGTHS.length;
      const t = await time(model, LENGTHS[i]);
      samples[i].push(t.ms);
      tokens[i] = t.tokens;
    }
  }
  const points = LENGTHS.map((_, i) => ({ tokens: tokens[i], ms: median(samples[i]) }));
  console.log(
    `${model.padEnd(24)}  ` +
      points.map((p) => `${p.ms} ms @ ${p.tokens}`.padStart(16)).join("") +
      `   ${Math.round(perThousand(points))} ms`,
  );
}
await quietMachine();
