# Measurements

Evidence the [ADRs](adr/) cite. Decisions and measurements date differently, so
they live apart: an ADR says what we chose and why, this file says what was
observed.

All measurements taken **2026-09-21** on macOS 27.0 (arm64), Ollama 0.34.2,
Deno 2.9.7, Node 24.19.0, Bun 1.4.2, Vite 8.3.0. Model calls used
`stream: false`, `temperature: 0`, `seed: 42`, structured output via a `format`
JSON schema, with the model already resident unless stated. Single sample per
cell at temperature 0 — deterministic, but without confidence intervals.

---

## 1. The `think` parameter — thinking is ON by default

`gemma4:e2b`, direction-only schema:

| `think` | latency | `eval_count` | `message.thinking` |
|---|---|---|---|
| omitted | **8281.9 ms** | 935 | 2651 chars |
| `false` | **100.6 ms** | 7 | null |
| `true` | 8293.3 ms | 935 | 2651 chars |

Omitting `think` is byte-for-byte identical to `think: true`. **The default is
on, and it costs 83x.**

`think: false` works correctly alongside a `format` schema: thinking goes to
`message.thinking`, `message.content` stays clean parseable JSON. Without a
schema, content comes back fenced in ```` ```json ````.

## 2. Per-tick latency, N=7, warm, ~420-450 token prompt

Median wall clock, including ~10-20 ms HTTP overhead.

| model | direction only | + `why` field | ratio |
|---|---|---|---|
| `gemma4:e2b` (`think:false`) | **94.2 ms** | 1051.6 ms | 11.16x |
| `gemma4:e2b` (`think` omitted) | 8310.4 ms | 9029.2 ms | — |
| `qwen3-vl:4b` (`think:false`) | 134.9 ms | **never terminates** | — |
| `llama3:latest` | 162.6 ms | 331.7 ms | 2.04x |
| `qwen3.8:27b-mlx` (`think:false`) | 426.4 ms | 3616.0 ms | 8.48x |
| `hermes3:latest` (excluded) | 124 ms | 808 ms | 6.5x |

The ratio is dominated purely by generated-token count; throughput is flat.
**The cost of asking for a justification is model-specific and ranges from 2x
to 11x** — the 6.5x figure originally cited was from hermes3 and is not
representative.

`qwen3.8:27b-mlx` cold: 5370 ms, of which `load_duration` is 2363 ms. Its warm
range was exceptionally tight (425.8-426.8 ms).

## 3. Prompt variation study — is it the model or the prompt?

Seven prompt variants, five original cases plus five fresh cases designed so
only one has `east` as its answer. Every case machine-checked for
unambiguity. Scores out of 5, median latency.

### Original cases

| Variant | `gemma4:e2b` | `llama3:latest` | `qwen3.8:27b-mlx` |
|---|---|---|---|
| Baseline (grid, compass) | 2/5 · 233 ms | 1/5 · 239 ms | 5/5 · 1159 ms |
| Axis labels | 2/5 · 131 ms | 1/5 · 255 ms | 5/5 · 738 ms |
| **Coordinates only** | **5/5 · 232 ms** | 1/5 · 237 ms | **5/5 · 638 ms** |
| Both (grid + coords) | 1/5 · 161 ms | 1/5 · 362 ms | **2/5 · 1967 ms** |
| Screen directions | 2/5 · 226 ms | 1/5 · 233 ms | not run |
| Both + screen | 1/5 · 161 ms | 3/5 · 363 ms | not run |

### Combined over all ten cases

| Variant | `gemma4:e2b` | `llama3:latest` | `qwen3.8:27b-mlx` |
|---|---|---|---|
| Baseline | 3/10 | 2/10 | 9/10 |
| **Coordinates only** | **9/10** | 2/10 | **9/10** |

### Conclusions

- **`gemma4:e2b` was being failed by the prompt.** 3/10 to 9/10 on a
  representation change. Its weakness was ASCII-grid parsing, not spatial
  reasoning. The rescue holds on five cases it was never tuned against, so it
  is not overfitting.
- **`llama3:latest` is a capability limit.** 2/10 on all seven variants. Across
  **57 trials it never emitted `west` or `left` once**, though they were correct
  in 12 of them and present in the offered enum every time. Its emission
  histogram: `east` 24, `right` 15, `down` 10, `south` 6, `north` 2, `west` 0,
  `left` 0. Its apparent 3/5 on one variant is coincidence — three of those
  cases happened to want the tokens it emits.
- **The directional attractor is not enum-position bias** — it survived all four
  enum orderings, including ones where the answer was not the first element.
- **It is not the compass vocabulary either.** Renaming `east` to `right` moved
  the attractor to `right`; scores changed by zero. Screen directions buy
  nothing.
- **Showing the grid and coordinates together is actively harmful**, and is the
  only variant that degrades the strongest model (5/5 to 2/5).

### The finding nobody predicted

A position with exactly one survivable move, with the food pointing elsewhere,
was missed by **all three models on every variant**. Rotations isolate it from
the attractor:

| probe | only safe move | food direction | gemma4:e2b | llama3 | qwen3.8:27b |
|---|---|---|---|---|---|
| n2w | west | north-east | `east` X | `east` X | `east` X |
| n2m | east | north-west | `east` (attractor) | `east` (attractor) | `west` X |

On n2m `qwen3.8:27b` chose `west` — a body cell, i.e. a fatal move selected
because it pointed at the food. **Food-seeking overrides survival in every
model tested, and no prompt variant fixed it.** The 5/5 ceiling attributed to
the largest model is therefore specific to food-adjacent positions.

## 4. Prefix caching

Large static prefix, varying short suffix, five sequential calls.

| model | cold `prompt_eval_duration` | warm | cached/total | speedup |
|---|---|---|---|---|
| `llama3:latest` | 9768.3 ms | 121-122 ms | 7789/7804 | ~80x |
| `gemma4:e2b` | 3906.0 ms | 78.4-79.0 ms | 8666/8683 | ~50x |
| `qwen3-vl:4b` | 8545.8 ms | 106-195 ms | 8317/8334 | ~80x |
| `hermes3:latest` | 8762.9 ms | 111.8 ms | 7229/7243 | ~78x |

**The cache is a strict prefix match from token 0.** Prepending four tokens at
the head collapsed `cached` from 7229 to 4 and restored the full 8.8 s cost.
`prompt_eval_count` still reports the *full* prompt, so caching is only visible
via `prompt_eval_cached_count`.

`fm serve` reports `cached_tokens: 0` on every response — no evidence of
prompt caching.

## 5. Model-specific defects

**`qwen3-vl:4b` — `message.content` is always empty.** With `think: false` plus
a schema, the constrained JSON arrives in `message.thinking` instead:

```json
{"message": {"role": "assistant", "content": "", "thinking": "{\n  \"direction\": \"east\"\n}"},
 "done_reason": "stop", "eval_count": 10}
```

It also ignores `think: false` when no schema is sent, and with a free-form
string field in the schema it enters a repetition loop at temperature 0 and
never emits the closing brace — uncapped, it exceeded a 600 s timeout.

**`llama3:latest` silently truncates and drops the middle.** Above 8192 tokens
it returns **200 OK with a confidently wrong answer**, no error and no warning
field:

| prefix size | `prompt_eval_count` reported |
|---|---|
| ~8k | 7780 (intact) |
| ~17k | **4108** (truncated) |
| ~33k | **4108** (truncated) |

A canary test localises the loss: a unique code at the **start** of the prompt
was recovered correctly (`num_keep` protects the opening tokens); the same code
in the **middle** came back wrong. The effective ceiling measured 4108, not the
advertised 8192; the mechanism was reproduced but not explained.

## 6. Structured output

Constrained decoding is real on every model tested, not prompt-following. With
a nonsense enum `["zzq","wobble"]` on a question whose natural answer is
"north", all models returned an in-enum value.

`llama3:latest` reporting capabilities `["completion"]` with no `tools` does
**not** affect this. They are independent mechanisms: `tools` reflects whether
the chat *template* can render tool calls; `format` is applied as a
decoding-time grammar in the sampler.

Schema enforcement guarantees **shape, never correctness** — one model returned
a valid, in-enum `south` where the stated coordinate system made `north`
correct.

## 7. Provider reachability

Both providers are reachable directly from a browser page at
`http://localhost:5173` on stock configuration — no proxy, no backend.

| | Ollama 0.34.2 | `fm serve` |
|---|---|---|
| Default bind | `127.0.0.1:11434` | `127.0.0.1:1976` |
| Origin policy | default list, configurable via `OLLAMA_ORIGINS` | hardcoded `localhost` / `127.0.0.1` / `[::1]`, **no flag** |
| Enforcement | all methods | POST only; GETs open |

Ollama's FAQ is incomplete: it states only `127.0.0.1` and `0.0.0.0` are
default-allowed, but `localhost` on any port and scheme is too, as are
`app://`, `file://`, `tauri://` and `vscode-*://`. `[::1]` is **not**, despite
being loopback.

`fm serve` latency: ~210 ms minimal, ~290 ms structured, median 396 ms on a
matched snake-tick call (min 303, max 935). `fm respond` as a subprocess costs
685-1423 ms, of which ~500-700 ms is process startup.

## 8. Runtime matrix

One `package.json`, no `deno.json`, no `bunfig.toml`. 20 of 21 tasks green.

| Task | Node 24.19 | Bun 1.4.2 | Deno 2.9.7 |
|---|---|---|---|
| install / build / dev / preview | pass | pass | pass |
| `node:test` suite | pass | pass | pass |
| Vitest | pass | pass | pass |
| oxlint · prettier | pass | pass | pass |
| **`vue-tsc` typecheck** | pass | pass | **fail (rc=2)** |

Build output is **byte-identical** from all three.

| | install (cold) | install (warm) | build | test |
|---|---|---|---|---|
| Node/npm | 15.88 s | 1.72 s | 0.73 s | 0.16 s |
| Bun | 1.42 s | 0.46 s | 0.81 s | 0.02 s |
| Deno | 2.97 s | 0.06 s | 0.81 s | 0.30 s |

### Traps found

- **Deno cannot typecheck `.vue`, and fails silently.** A real `TS2322` inside
  `App.vue` returned **rc=0** from `deno check` on the importing file; `vue-tsc`
  caught it on Node and Bun.
- **`bun run` is not Bun.** It honours the `#!/usr/bin/env node` shebang on
  `node_modules/.bin/vite` and delegates to Node. `bun --bun run` is required
  to actually run under Bun. Deno does not do this.
- **Prettier and `deno fmt` disagree** on 6 of 14 files; `deno fmt` ignores
  `.vue` by default and reformats `.svg`.
- **Test invocation cannot be unified.** A bare directory breaks Node; a glob
  breaks Bun (its positional args are substring filters). `*.spec.ts` is
  discovered only by Bun.
- **Node silently false-passes foreign test files** — a stray Vitest-style file
  was reported as `✔ passing` while no assertion ever ran.
- **Tailwind 4 scans `dist/`.** Without a `.gitignore`, a second build harvested
  class names from the previous bundle and produced 7.11 kB of CSS instead of
  5.11 kB. Reproduced on every runtime.
- **`baseUrl` in `tsconfig.json` breaks `deno check`** with `TS5101` (Deno 2.9.7
  bundles TypeScript 6.0.3). `paths` works without it.

### Corrected attribution

An aliased `import.meta.glob` pattern failing **silently** was originally
attributed to Deno. It is **Vite 8 behaviour on every runtime**: an unregistered
alias produces a warning, exit code 0, and a literal `import.meta.glob(...)`
left in the bundle that throws at runtime. Reproduced identically under Node.
Relative patterns avoid it entirely.
