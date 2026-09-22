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

### Caching does not engage below about 512 tokens

Measured 2026-09-21 against `gemma4:e2b`, fixed system prompt, varying user
message:

| prompt tokens | cached | |
|---|---|---|
| 134 | 0 | 0% |
| 314 | 0 | 0% |
| 614 | 607 | **99%** |
| 1314 | 1307 | 99% |
| 2714 | 2707 | 100% |

The turn-on sits between 314 and 614 tokens, consistent with a 512-token batch
boundary. The earlier 50-80x figures were all measured with multi-thousand
token prefixes and do **not** generalise to short prompts.

**Consequence for this project:** the current system prompt is ~340 tokens and
the whole request ~367, so it falls just below the threshold and gets no reuse
at all — confirmed live, `cached 0/367` on every tick of a real game. Crossing
512 tokens would return roughly 150ms per tick, which against a ~430ms call is
a third of the budget. That is a reason not to over-compress the system
prompt, not a reason to pad it with filler.

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

Ollama is reachable directly from a browser page at `http://localhost:5173`
on stock configuration. **`fm serve` is not** — see the correction below.

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

### Correction: `fm serve` blocks every browser, not just foreign origins

The measurements above were taken with curl, which never sends
`Sec-Fetch-Site`. Browsers always do on a cross-origin fetch, and `fm serve`
checks it. Re-measured 2026-09-21, same `Origin: http://localhost:5173`:

| `Sec-Fetch-Site` | result |
|---|---|
| (absent, as curl sends) | 200 |
| `none` | 200 |
| `same-origin` | 200 |
| `same-site` | **403** Cross-site requests are not allowed |
| `cross-site` | **403** |

`same-site` is rejected too, so pointing the page at `localhost` instead of
`127.0.0.1` would not help. From a browser, the only accepted value is
`same-origin`, which a page on port 5173 can never produce for a server on
port 1976. The first real attempt from the UI failed with exactly this 403.

The fix is a same-origin dev-server proxy (`/fm` -> `127.0.0.1:1976`). The
browser's request then carries `same-origin`, which is accepted even alongside
the page's `Origin` header. Verified through the proxy: 200.

## 8. First live game, 2026-09-21

`gemma4:e2b`, assistance level 0, coordinates, `why` on. Eight ticks from seed
61005, head starting at (6,6) with food at (4,7):

```
# 0 head (6,6) food (4,7) -> north 4604ms   why: "Moving north brings the head closer to the food."
# 1 head (6,5) food (4,7) -> north  399ms
...
# 6 head (6,0) food (4,7) -> north  432ms
outcome: crashed  food 0  steps 7
```

The food was one row **south** and two columns west. The model drove north
into the wall for seven consecutive moves, and its stated reason was a plain
falsehood about the geometry. The prompt states the axis convention
explicitly; it did not help.

This is the directional attractor from §3 reproduced in a live loop — here
fixed on `north` rather than `east`, which suggests the attractor is not a
fixed token but something about how the position is presented. Latency is
healthy (~430ms warm, 4.6s cold including model load), so the loop itself
performs; what fails is comprehension.

## 9. Cold start, and why the first game died

Measured 2026-09-21 on `gemma4:e2b`, after an explicit unload:

| | total | of which load |
|---|---|---|
| cold call | **2204 ms** | **2088 ms** |
| after an empty-prompt preload | 108 ms | 23 ms |

A cold model costs over two seconds, almost entirely weight loading. With
continue-straight on a deadline miss, that is fatal in the literal sense: the
first live run in the UI scored **0% controller share — 6 timed out, 1 arrived
stale — and the snake was dead in 7 ticks**, having driven straight into the
wall before a single answer arrived.

`POST /api/generate` with a model and no prompt loads the weights and returns
at once, so selecting a model now preloads it. The same run afterwards:
**57% controller share**, load down to 19 ms.

Requests also send `keep_alive: "30m"`, since Ollama's 5 minute default would
evict the model during any pause long enough to read the panel.

## 10. Assistance levels, live

"Every model just goes straight and dies" was reported from the UI. Measured:
`gemma4:e2b` at slow speed answered **every** tick — 100% controller share,
zero timeouts — and still crashed on tick 7 with its own last answer being
`north`. It was not failing to answer; it was choosing the wall.

Then across all five assistance levels, three seeds each, 60-tick cap,
coordinates, no `why`:

| level | adds | result per seed (outcome @ tick, food) |
|---|---|---|
| 0 | board only | crashed @7, 0 · crashed @7, 0 · crashed @7, 0 |
| 1 | + legal moves | crashed @7, 0 · crashed @7, 0 · crashed @7, 0 |
| 2 | + immediately safe moves | crashed @49, 1 · **alive @60**, 0 · **alive @60**, 1 |
| 3 | + reachable open space | crashed @13, 0 · crashed @13, 0 · crashed @13, 0 |
| 4 | + planner's recommendation | **alive @60, 6** · **alive @60, 6** · **alive @60, 5** |

- **At levels 0 and 1 the model is not reading the board.** It dies on tick 7
  on every seed — six cells north from the start into the wall — regardless of
  where the food spawned. Being told the legal moves changes nothing, which is
  expected: the schema enum already enforces them.
- **Level 2 is the survival threshold.** Told which moves are immediately
  fatal, it lives; it still rarely eats.
- **Level 3 is worse than level 2.** Adding reachable-space counts took it from
  surviving to crashing on tick 13 on all three seeds. More information hurt.
- **Level 4 plays well**, but that is the planner playing; the model ratifies.

The starting position makes level 0 unusually hard. The snake heads north with
its body trailing south, so south is never a legal first move: food spawning
below the head requires turning sideways first, and a model that concludes
"the food is south" finds south missing from the enum.

## 11. Making level 0 work: it was the prompt

Same model (`gemma4:e2b`), level 0, five seeds, 60-tick cap, direction-only
schema. Measured with `scripts/eval-prompt.ts`:

| variant | ticks survived | food | alive | median |
|---|---|---|---|---|
| A · baseline | 7, 7, 7, 7, 7 | 2 | 0/5 | 251 ms |
| B · drop the `Heading:` line | 7, 12, 10, 24, 6 | 4 | 0/5 | 259 ms |
| **C · B + the food's offset in words** | **60, 60, 20, 40, 37** | **23** | **2/5** | **221 ms** |
| D · C + a scratchpad schema | 55, 60, 43, 52, 60 | 19 | 2/5 | 1050 ms |
| E · C, all in one user message | 38, 12, 21, 29, 37 | 16 | 0/5 | 263 ms |

- **The `Heading: north` line was the attractor.** With it present the model
  died on tick 7 on every seed; removing it spread deaths from tick 6 to 24.
  At level 0 with nothing else to go on, the model was echoing the heading.
- **One line fixed it.** *"The food at (6,6) is 1 west and 4 south of the
  head."* took food eaten from 4 to 23 across five games, at no latency cost.
  The model can use direction words; it could not turn raw coordinates into one.
- **A scratchpad schema** — the model fills in each option's destination cell
  and its contents before choosing — survives more consistently (worst run 43
  ticks against C's 20) but eats less and is **5x slower**.
- **Splitting system and user helps.** Merging everything into one user message
  was worse on every measure.
- C reproduced byte for byte on a rerun: temperature 0 is deterministic here.

Verified in the UI afterwards: level 0, alive after 24 ticks with 3 food, where
it had died on tick 7 on every attempt.

**Is the food offset "help"?** It restates coordinates the model already has,
in the vocabulary it must answer with, and says nothing about which moves are
safe. That was judged to be representation rather than assistance, so it sits
in level 0. It is still a judgement call.

## 12. One prompt per level

Each assistance level now has its own prompt file, whose system prompt
explains the help that level gives. `gemma4:e2b`, five seeds, 60-tick cap,
`why` off:

| level | ticks survived | food | alive |
|---|---|---|---|
| 0 · board + food offset | 60, 25, 33, 60, 37 | 24 | 2/5 |
| 1 · + legal moves | 21, 24, 13, 7, 48 | 9 | 0/5 |
| 2 · + safe moves | 60, 60, 60, 60, 60 | 25 | 5/5 |
| 3 · + open space | 60, 60, 60, 60, 60 | 13 | 5/5 |
| 4 · + recommendation | 60, 60, 60, 60, 60 | 29 | 5/5 |

- **Level 3 is fixed.** Under the shared prompt it crashed on tick 13 on every
  seed, worse than level 2, because nothing explained what the space figures
  meant. Its own prompt says a figure below your length is a trap, and it now
  survives every game.
- **Level 1 is worse than level 0.** Listing the legal moves repeats what the
  schema enum already enforces, and the redundant line costs food and every
  survivor.
- **Level 3 survives as well as level 2 but eats half as much.** Knowing about
  traps makes it cautious.

### `why` belongs after the answer, not before

Placing `why` *before* `direction` was recommended on the strength of earlier
research, where reasoning-first lifted gemma from 2/5 to 4/5 on five isolated
positions. Over real games it did the opposite:

| level | food, `why` off | food, `why` first |
|---|---|---|
| 0 | 20 | 8 |
| 2 | 27 | 11 |
| 3 | 13 | 4 |
| 4 | 29 | 29 |

Survival was roughly unchanged; food fell by more than half. Reasoning first
made the model cautious, not better.

With `why` placed **after** `direction`, the games are **identical** to `why`
off — the same ticks on every seed, the same food, the same survivors:

| level | `why` off | `why` after |
|---|---|---|
| 0 | 60, 25, 33, 60, 37 · 24 food | 60, 25, 33, 60, 37 · 24 food |
| 2 | all 60 · 25 food | all 60 · 25 food |

At temperature 0 the direction token is decoded from exactly the same prefix
either way, so asking for an explanation can never change the move. It costs
~150-200 ms of latency and nothing else. The explanation is therefore a
rationalisation written after the fact, which is exactly what an observation
panel should show — honestly labelled.

## 13. Runtime matrix

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
