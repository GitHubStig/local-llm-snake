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

*Corrected 2026-09-23:* this threshold was measured on `gemma4:e2b` alone, and
does not hold for every model. Playing under the parity prompt,
`muse-glimmer:30b` reported **252 of 424 prompt tokens cached** — essentially
the static system prompt, reused as intended, well below 512 tokens. The
threshold appears to be model-specific.

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

## 13. JEV parity, measured

Measured 2026-09-23 with `scripts/eval-prompt.ts`: five seeds, 200-tick cap —
long enough for the snake to grow and the reachability facts to carry
information, which at 60 ticks they do not. Moves are played synchronously,
with no clock, so this measures judgement and not real-time play.

Two new counters test whether a model acts on the facts it is handed: how often
it walks into a move marked `DEAD END` when an escapable one existed, and how
often it passes up food it could safely eat. **Differs** is how often it chose
something other than a four-line code reference picking the obvious move from
the same facts — avoid dead ends, eat if possible, otherwise close on the food.

| | ticks survived | food | longest | alive | dead end | passed food | differs | median | deaths |
|---|---|---|---|---|---|---|---|---|---|
| **code reference** | 200 ×5 | **106** | 27 | 5/5 | 0% | 0% | — | — | — |
| **gemma4:31b** | 200 ×5 | **115** | 27 | **5/5** | 0% | 0% | **12%** | 1293 ms | none |
| **qwen3.8:27b** | 200 ×5 | **111** | 27 | **5/5** | 0% | 0% | 22% | 1110 ms | none |
| **muse-glimmer:30b** | 200, 200, 200, 119, 200 | **100** | 27 | 4/5 | 0% | 0% | **3%** | 1223 ms | 1 crashed |
| gemma4:e2b | 176, 130, 130, 130, 152 | 4 | 6 | 0/5 | 0% | 0% | 98% | 232 ms | 5 starved |
| llama3:latest | 141, 174, 200, 200, 130 | 7 | 7 | 2/5 | 0% | 0% | 74% | 318 ms | 3 starved |
| Apple Foundation Models | 141, 130, 130, 130, 130 | 1 | 4 | 0/5 | 0% | 0% | 59% | 545 ms | 5 starved |
| *gemma4:e2b, ladder level 2* | 200, 200, 119, 142, 196 | *60* | — | 2/5 | — | — | — | 281 ms | — |

### The models are not alike: one reads the facts, one reads the list order

ADR-0012 predicted that with code doing the analysis, models would look alike
on accuracy. The opposite happened. Diagnosed over two games each:

| | gemma4:e2b | qwen3.8:27b |
|---|---|---|
| went straight | 99 of 111 | 49 of 119 |
| picked the option listed last | 105 of 111 | spread evenly |
| picked the option closest to the food | 50% | **100%** |

- **gemma4:e2b chooses by position, not by the facts.** It picks the
  last-listed option 95% of the time. Options are listed north, east, south,
  west, so that is usually west; once heading west, straight *is* west, and the
  habit reinforces itself. It drifts, never crashes, and starves. At 50% on
  closest-to-food with two or three options, it is at chance.
- **qwen3.8:27b reads every fact.** It always took the option closest to the
  food, never entered a dead end, and **ate more than the code reference** —
  111 against 106 — because the 22% of moves where it disagreed were sometimes
  better than the greedy rule.
- **Nobody walked into a flagged dead end, and nobody passed up adjacent food.**
  The flags are acted on when they appear; the small models' failure is in the
  ordinary choice between options that are all safe and all food-less.

### Apple's on-device model chooses close to at random

Run through `fm serve` the same day. It shows no single bias of the kind gemma
does — turns and list positions are both spread — yet it took the option
closest to the food exactly 50% of the time, which is chance. It is choosing
among the safe options almost at random. The one pattern is a lean towards
north and south, 80 of 115 moves, so it zigzags up and down the board until it
starves.

Its 59% disagreement with the code reference looks healthier than gemma's 98%,
but it is what random choice among two or three options produces. gemma
disagrees more because its bias is systematic; Apple's model disagrees less
because it has none.

So parity sorts the models into three kinds: three that **read the facts**
(gemma4:31b, qwen3.8:27b and muse-glimmer:30b), one that **reads the list order** (gemma4:e2b),
and two that **do neither** (llama3, Apple).

gemma4:31b, measured later the same day, is the strongest yet: it ate the most
of anything tested and agreed with the code reference 88% of the time. Its
small sibling gemma4:e2b, the same family, picked by list position and starved
in every game — size, not family, separates the two kinds here.

muse-glimmer:30b follows the facts most closely of all, agreeing with the code
reference on 97% of moves. Its one loss is the first crash by any
fact-reading model: it never chose a flagged dead end or passed up food, so its
rare departures from the obvious move must have boxed it in gradually until no
safe move remained. None of the three failing models ever crashed;
all of them starved.

### JEV's direction labels

JEV names its options up, right, down and left; this prompt uses north, east,
south and west. The information is the same. Measured 2026-09-23 by naming the
directions JEV's way through the prompt file's `directionNames`:

| | labels | ticks survived | food | alive | differs |
|---|---|---|---|---|---|
| muse-glimmer:30b | compass | 200, 200, 200, 119, 200 | 100 | 4/5 | 3% |
| | JEV's | 200, 200, 200, 119, 200 | 103 | 4/5 | 3% |
| llama3:latest | compass | 141, 174, 200, 200, 130 | 7 | 2/5 | 74% |
| | JEV's | 141, 130, 130, 130, 130 | 1 | 0/5 | 71% |

- **A model that reads the facts is unaffected**: identical survival to the tick.
- **llama3 does worse with JEV's labels**, starving in every game. A likely
  reason: with them an option can contradict itself on one line — heading
  down, the option to the left reads `left (right turn)`, a screen word and a
  relative turn pointing opposite ways. A model leaning on surface words is
  pulled both ways. Five seeds is thin, but every game moved the same way.

### The three questions from before

1. **Does parity beat the best ladder level?** Depends entirely on the model.
   For gemma4:e2b, no: level 2 ate 60 at the same cap, parity 4. Level 2 stated
   where the food lay in direction words, which the small model can act on;
   parity gives a distance per option, which it would have to compare. For
   qwen3.8:27b, parity plays about as well as it is possible to play.
2. **Does the `Heading:` line still act as an attractor?** No. Removing it left
   every game *identical*, to the tick and the food. With a fact line per
   option, the heading no longer steers anything.
3. **Does sending the grid and the coordinates together still hurt?** Not
   measurably. Removing the head and food lines took gemma from 4 food to 8,
   which at five seeds is within noise.

### Judgement and latency now point in opposite directions

The model that plays best is the slowest: 1110 ms median against 232 ms. At
Normal speed a tick is 400 ms, so qwen3.8:27b's answers would routinely arrive
around three ticks late and, beyond the two-tick staleness limit, be thrown
away. These games were played without a clock, so its excellent judgement is
real but has never been tested in real time. That is the case ADR-0013's
projection exists for.

## 14. Projection in real time: correct answers, too few of them

Measured 2026-09-23 with `scripts/realtime.ts`, which drives the real runner
on a real clock — unlike `eval-prompt.ts`, where the game waits for every
answer. Three seeds, 150-tick cap.

| | projection | ticks survived | food | alive | share | timed out | on time | died waiting |
|---|---|---|---|---|---|---|---|---|
| qwen3.8:27b at Normal | off | 37, 130, 7 | 4 | 0/3 | 34% | 108 | 0% | 2 |
| | on | 7, 82, 16 | 5 | 0/3 | 26% | 15 | 76% | 3 |
| llama3:latest at Fast | off | 7, 8, 8 | 1 | 0/3 | 21% | 18 | 0% | 3 |
| | on | 11, 8, 8 | 1 | 0/3 | 26% | 9 | 57% | 3 |

**The mechanism works.** With projection on, timeouts fell from 108 to 15 and
three-quarters of qwen's answers landed on exactly the tick they were planned
for. A trace of one game shows the intended behaviour: sent the board for the
tick the snake would reach the wall, qwen answered `west` and it arrived with
126 ms to spare, turning the snake at the last survivable cell.

**The outcome does not improve.** The same model that never died in 200 ticks
without a clock dies within tens of ticks in real time, with projection on or
off, almost always going straight into something while its next answer is on
the way.

The reason is throughput, not staleness. With one request in flight and qwen
answering in about 1.1 s, it gets one decision roughly every three ticks at
Normal speed. Projection makes each decision correct for the board it lands on;
it cannot make decisions more frequent. Between answers the snake travels about
three cells straight, and a situation that needs a turn sooner than that is
fatal. ADR-0013's claim — that a slow model's judgement would come to count in
real time — is not supported at these speeds.

Two further observations:

- **Every game starts with no latency measured**, because each game builds a
  new runner. The first request goes out unprojected and lands late, and the
  snake starts six cells from a wall heading straight at it.
- **Controller share is misleading with projection on.** Ticks spent going
  straight while holding an answer for its tick count as continue-straight, the
  same as a timeout, so share *falls*. They are part of the model's plan.

### Carried latency, planned ticks, and Slow speed

Re-measured after two changes: a new game now inherits the controller's
measured latency, so only the very first game of a session starts
unprojected; and ticks spent going straight while a decision is pending for a
later tick are counted as **planned**, with controller share taken only over
ticks where a decision was actually due.

| qwen3.8:27b | projection | ticks survived | food | share | on time | planned ticks | timed out | died waiting |
|---|---|---|---|---|---|---|---|---|
| Slow, 1000 ms | off | 16, 74, 14 | 9 | 46% | 8% | — | 49 | 0 |
| | on | **121, 45, 33** | **16** | **92%** | **92%** | 89 | 11 | 3 |
| Normal, 400 ms | off | 49, 7, 7 | 4 | 18% | 0% | — | 47 | 2 |
| | on | 14, 31, 7 | 5 | 53% | 64% | 32 | 9 | 3 |

- **At Slow, projection clearly helps.** Ticks survived nearly doubled in
  total, food went from 9 to 16, and the model made 92% of the decisions due,
  against 46% without it.
- **At Normal it still cannot keep up.** Share rises from 18% to 53% once
  planned ticks are no longer counted as misses, but survival does not improve.
- **Even at Slow, qwen does not survive 150 ticks.** It answers in about
  1.1 s against a 1 s tick, so it still gets one decision every two ticks, and
  every game still ends with the snake dying while its next answer is on the
  way. Without a clock the same model never died in 200.

### Speed and judgement are separate abilities

llama3 and Apple's on-device model, same conditions, at Normal speed:

| | projection | ticks survived | food | alive | decisions made | on time |
|---|---|---|---|---|---|---|
| llama3:latest | off | 141, 150, 91 | 6 | 1/3 | 95% | 99% |
| | on | 141, 150, 150 | 6 | 2/3 | 97% | 100% |
| Apple Foundation Models | off | 7, 130, 9 | 1 | 0/3 | 31% | 0% |
| | on | 9, 7, 7 | 1 | 0/3 | 72% | 90% |

- **llama3 keeps up.** At about 320 ms it answers inside a 400 ms tick, so
  projection has nothing to do and it makes nearly every decision on time. In
  real time it plays as it does without a clock: it survives, aimlessly, and
  eats little. Its losses are starvation, not speed.
- **Apple's model neither keeps up nor chooses.** At about 545 ms it gets a
  decision every other tick, and its choices are close to random, so five of
  six games end within nine ticks, straight into the wall the snake starts
  facing. Projection lands its answers on the right tick; an on-time random
  move does not save it.

| | fast enough for Normal | acts on the facts |
|---|---|---|
| llama3:latest | yes, ~320 ms | no |
| qwen3.8:27b | no, ~1100 ms | yes |
| gemma4:31b | no, ~1290 ms | yes |
| muse-glimmer:30b | no, ~1220 ms | yes |
| Apple Foundation Models | no, ~545 ms | no |

gemma4:31b at Slow repeats qwen's pattern: projection off, 28, 85 and 47 ticks
with 49% of decisions made; on, 121, 37 and 82 ticks with 88% made and 87% on
time. It still dies waiting, getting a decision only every other tick.

muse-glimmer:30b does best of the three large models in real time. At Slow,
projection off: 34, 64 and 50 ticks, 9 food, 55% of decisions made. On: **150**,
123 and 48 ticks, **23 food**, 92% made and 95% on time — the first large model
to survive the full 150 ticks in real time. Following the facts so closely, it
seldom needs a correction it cannot get in time; the other two games still
ended with it dying while an answer was on the way.

| at Slow, projection on | ticks survived | food | alive | decisions made | on time |
|---|---|---|---|---|---|
| muse-glimmer:30b | 150, 123, 48 | 23 | 1/3 | 92% | 95% |
| qwen3.8:27b | 121, 45, 33 | 16 | 0/3 | 92% | 92% |
| gemma4:31b | 121, 37, 82 | 13 | 0/3 | 88% | 87% |

No model tested at the time had both; tev1, a decision model, later did at
Normal speed (§16). That is the profile JEV claims — an answer in under
200 ms from a model built to choose between described options — and the bar a
JEV-like local model would have to clear.

### Two runner bugs found while measuring

- `stop()` called from inside `onTick` was ignored: the tick loop rescheduled
  itself after `onTick` returned. In the first real-time run, games that reached
  the tick cap kept running unseen, still querying Ollama *during the next
  game*, which inflated its latency and invalidated that run. The numbers above
  are from a clean re-run.
- A runner stopped from inside a tick still opened one more request as the tick
  ended. Pausing must keep asking, since that is how Step works with a model;
  stopping now does not.

## 15. Runtime matrix

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

---

## 16. Decision models: tev1 and nimble

Measured **2026-09-30** with **Ollama 0.35.0**, which added decision models and
the `/v1/systemone` endpoint (ADR-0014). Both models are Q8_0 and report the
capabilities `decision`, `tools`, `thinking` and `completion`.

| | base | size on disk | context |
|---|---|---|---|
| tev1 | Qwen3.5 4B fine-tune (Together AI), labelled experimental | 4.48 GB | 2,050 |
| nimble | Bespoke-Nimble 9B | 9.53 GB | 8,194 |

The library page reports benchmark accuracy for tev1 (73.3% on Ollama's eval,
88.0% on Together AI's); those figures were not checked here.

### Judgement, no clock

`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13, asked
through `/v1/systemone`:

| | ticks survived | food | alive | into dead end | passed food | differs from code | median |
|---|---|---|---|---|---|---|---|
| code reference | 200 ×5 | 106 | 5/5 | 0% | 0% | — | — |
| **tev1** | 200 ×5 | 96 | **5/5** | 0% | 0% | 31% | **317 ms** |
| nimble | 200, 200, 200, 111, 200 | 99 | 4/5 | 0% | 0% | 20% | 548 ms |

Both use the facts as the large chat models in §13 do. Neither ever chose a
dead end with a way out, or passed up food it could safely eat.

### Latency: the endpoint caches only exact repeats

A single probe earlier suggested tev1 answers in about 40 ms. That was an
identical request answered from cache. Varying one part of the request at a
time:

| tev1, warm | ms |
|---|---|
| the same request again | 38–45 |
| a new game tick | 300–310 |
| only the last option's text changed | 314 |
| only the end of the instructions changed | 306 |
| only the heading in `state` changed | 310 |

Any change, wherever it is in the request, costs the full ~310 ms, so
`/v1/systemone` is not reusing a shared prefix the way `/api/chat` does (see
*prefix caching* in the glossary). In a game every tick is new, so ~310 ms is
tev1's real latency on this machine. Without the grid, a request was about
70 ms faster (294 ms against 367 ms for a first request), but the grid is part
of JEV parity.

### Real time

`scripts/realtime.ts`, 3 seeds, 150-tick cap, asked through `/v1/systemone`:

| | speed | projection | ticks survived | food | alive | share | on time | timed out | died waiting |
|---|---|---|---|---|---|---|---|---|---|
| tev1 | Normal | off | 150, 150, 150 | 46 | 3/3 | 96% | 99% | 5 | 0 |
| | | on | 150, 150, 150 | 46 | 3/3 | 98% | 100% | 0 | 0 |
| tev1 | Fast | off | 7, 28, 7 | 2 | 0/3 | 29% | 0% | 29 | 2 |
| | | on | 7, 94, 106 | 4 | 0/3 | 65% | 93% | 10 | 1 |
| nimble | Normal | off | 7, 7, 22 | 3 | 0/3 | 15% | 0% | 24 | 1 |
| | | on | 115, 35, 76 | 13 | 0/3 | 88% | 88% | 16 | 3 |

- **tev1 plays Normal speed.** It answers inside the 400 ms tick, so projection
  has nothing to do, and it survived every game while eating steadily: the
  first model in this project to do both in real time.
- **At Fast it is too slow,** as expected at ~310 ms against a 150 ms tick.
  Projection raises its share of decisions from 29% to 65%, but it still dies
  waiting.
- **nimble is too slow for Normal.** Without projection its answers arrive late
  and it dies within a few ticks; with projection it lasts longer and eats more,
  but it decides only every other tick and died in all three games.

This corrects §14's closing table, which found no model both fast enough for
Normal speed and able to act on the facts:

| | fast enough for Normal | acts on the facts |
|---|---|---|
| **tev1** | **yes, ~310 ms** | **yes** |
| nimble | no, ~550 ms | yes |
| llama3:latest | yes, ~320 ms | no |

### A more compact request: measured, not adopted

Measured **2026-09-30**, tev1, warm, requests to `/v1/systemone` directly. Each
variant was sent the same 60 positions from seeded games, in rotating order so
that background load fell on all of them alike. Some browser processes were
open during these runs.

| request | input tokens | median | p90 | same choice as current |
|---|---|---|---|---|
| current | 492 | 315 ms | 325 ms | — |
| board as one string, not a list of rows | 498 | 318 ms | 327 ms | 57/60 |
| head, food and grid size as strings | 491 | 316 ms | 324 ms | 59/60 |
| shorter option facts | 432 | 304 ms | 310 ms | 56/60 |
| shorter facts, instructions and legend ("tight") | 385 | 249 ms | 303 ms | 53/60 |

- **How `state` is encoded makes no difference.** Sending the board as one
  string rather than a JSON array of quoted rows saved no tokens: the endpoint
  appears to render `state` into its own text, so JSON punctuation never reaches
  the model.
- **Latency is a floor plus a per-token cost.** A near-empty request (one state
  field, two options) was 109 tokens and took 115 ms. Beyond that, each input
  token cost about 0.5 ms. The board and the instructions each cost about
  65 ms. No trimming can bring tev1 near Fast speed's 150 ms tick.
- **Only shorter wording helps.** The tight request states the same facts in
  fewer words. It kept the DEAD END meaning, as "too little room, tail
  unreachable".

Played with no clock, 5 seeds × 200 ticks, run back to back:

| tev1 | ticks survived | food | alive | into dead end | passed food | differs from code | median | p90 |
|---|---|---|---|---|---|---|---|---|
| current | 200 ×5 | 96 | 5/5 | 0% | 0% | 31% | 311 ms | 314 ms |
| tight | 200 ×5 | 92 | 5/5 | 0% | 0% | 38% | 246 ms | 298 ms |

The tight request is about 65 ms faster at the median, but only about 16 ms
faster at the 90th percentile. It plays about as well, though five games cannot
settle a 4-food difference. It was not adopted. At Normal speed tev1 already
answers well inside the 400 ms tick, and at Fast speed 250 ms is still too
slow. It is worth revisiting if something needs the headroom, such as a second
request loop for shadow mode.

### Correction: the first figures in this section were measured through chat

The first version of this section, committed in `40de8d8`, reported tev1 and
nimble as decision models, but the scripts had asked them through `/api/chat`
with the chat prompt. Ollama lists them as `tev1:latest` and `nimble:latest`;
the scripts were run with the bare names and compared those to the listed
names, found no match, and fell back to chat without saying so. The app was
not affected, since it uses the listed names. The scripts now accept either
form and label every result with the endpoint used.

Those chat figures are real measurements of the same models through the other
endpoint, and are kept here as such:

| through `/api/chat` | food | alive | median | Normal, projection on |
|---|---|---|---|---|
| tev1 | 107 | 4/5 | 315 ms | 3/3 alive, 49 food |
| nimble | 95 | 4/5 | 685 ms | 2/3 alive, 8 food |

Through either endpoint both models act on the facts, and tev1 keeps up at
Normal speed. The endpoints led to different moves: through `/v1/systemone`
tev1 ate less but survived all five games, and nimble answered about 140 ms
faster. Five games per endpoint are too few to call either better at choosing. The latency
probes above were always made against `/v1/systemone` directly and are not
affected.

---

## 17. A mixture-of-experts chat model: gemma-4-26B-A4B heretic

Measured **2026-09-30**, Ollama 0.35.0.
`pdurlej/gemma-4-26B-A4B-it-heretic:latest` is a community build of Gemma 4
26B-A4B: 25.2B parameters in total, but a mixture of experts that runs 8 of its
128 experts per token, about 4B parameters, at Q4_K_M (16.8 GB). *Heretic*
builds have their refusal behaviour removed. It is a chat model, asked with the
chat prompt like those in §13, and uses Ollama's built-in `gemma4` renderer and
parser, so it is formatted as Gemma expects.

### Judgement, no clock

`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13 and §16:

| | ticks survived | food | alive | into dead end | passed food | differs from code | median |
|---|---|---|---|---|---|---|---|
| code reference | 200 ×5 | 106 | 5/5 | 0% | 0% | — | — |
| gemma4:31b (§13) | 200 ×5 | 115 | 5/5 | 0% | 0% | 12% | 1293 ms |
| **gemma-4-26B-A4B heretic** | 200 ×5 | **105** | **5/5** | 0% | 0% | 20% | **553 ms** |
| tev1 (§16) | 200 ×5 | 96 | 5/5 | 0% | 0% | 31% | 317 ms |
| llama3:latest (§13) | 141, 174, 200, 200, 130 | 7 | 2/5 | 0% | 0% | 74% | 318 ms |

It reads the facts as well as the large dense models do, survives every game,
and answers in well under half the time of gemma4:31b: running only a few
billion parameters per token is what makes it faster. It is the fastest general-purpose
chat model measured here that acts on the facts, about as fast as the decision
model nimble; only tev1 is faster. But at 553 ms it is still over the
400 ms tick at Normal speed, where tev1 is under it.

### Real time

`scripts/realtime.ts`, 3 seeds, 150-tick cap:

| | speed | projection | ticks survived | food | alive | share | on time | timed out | died waiting |
|---|---|---|---|---|---|---|---|---|---|
| heretic | Normal | off | 34, 9, 18 | 5 | 0/3 | 45% | 0% | 31 | 1 |
| | | on | 150, 41, 33 | 12 | 1/3 | 96% | 99% | 3 | 2 |
| heretic | Slow | off | 150, 150, 150 | 50 | 3/3 | 98% | 100% | 0 | 0 |
| | | on | 150, 150, 150 | 50 | 3/3 | 98% | 100% | 0 | 0 |

- **At Slow it is the best chat model measured.** Answering well inside the
  1000 ms tick, it makes nearly every decision and projection has nothing to
  do. It survived every game with 50 food, where the best large model,
  muse-glimmer:30b, survived one of three with 23 food even with projection
  (§14).
- **At Normal it behaves like nimble** (§16). Its answers take longer than a
  tick, so without projection they arrive late and it dies quickly. With
  projection its share rises to 96%, but it decides only every other tick and
  still dies waiting in two of three games.

| | fast enough for Normal | fast enough for Slow | acts on the facts |
|---|---|---|---|
| tev1 | yes, ~310 ms | yes | yes |
| **gemma-4-26B-A4B heretic** | no, ~553 ms | **yes** | **yes** |
| nimble | no, ~550 ms | yes | yes |
| muse-glimmer:30b | no, ~1220 ms | no | yes |
| llama3:latest | yes, ~320 ms | yes | no |

A mixture of experts closes much of the gap between the large dense models
and a decision model: judgement like gemma4:31b's at under half its latency.
tev1 remains the only model here fast enough for Normal speed.
