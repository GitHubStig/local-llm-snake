# Measurements

Evidence the [ADRs](adr/) cite. Decisions and measurements date differently, so
they live apart: an ADR says what we chose and why, this file says what was
observed.

The first measurements were taken **2026-09-21** on macOS 27.0 (arm64), Ollama
0.34.2, Node 24.19.0, Vite 8.3.0; later sections state their own Ollama
version. Model calls used `stream: false`, `temperature: 0`, `seed: 42`,
structured output via a `format` JSON schema, with the model already resident
unless stated. Single sample per cell at temperature 0 — deterministic, but
without confidence intervals.

Until 2026-10-07 the Fast tick was 150 ms and Turbo 60 ms; they are now 200 ms
and 100 ms (ADR-0001). Every Fast or Turbo result in this file before §19 was
measured at the old ticks.

---

## Current standings

Each model's latest result, gathered from the numbered sections below, which
hold the detail and the conditions. They were not measured together: Ollama
upgrades have changed the games of an unchanged model file (0.40.0 in §19,
0.40.5 in §21), the decision request has changed twice (the tight wording in §19, hunger
in §20), and five games cannot rank close results. Read rows from different
versions as rough company, not a ranking.

### Judgement, no clock

`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds throughout.
Decision models are under their best strategy (§20); the others they were
measured under are in the last column. The code reference picks the obvious
move from the same facts.

| model | tag measured | food | alive | differs from code | median | other strategies | Ollama or date | source |
|---|---|---|---|---|---|---|---|---|
| code reference | — | 106 | 5/5 | — | — | — | — | §13 |
| tev1 4b | bf16, greedy | 107 | 5/5 | 33% | 172 ms | balanced 100, 5/5; safe 83, 5/5 | 0.40.5 | §21, §20 |
| nimble 9b (v1) | bf16, balanced | 106 | 5/5 | — | 305 ms | greedy 98, 4/5; safe 88, 3/5 | 0.40.4 | §20 |
| nimble-v3 9b | nvfp4, greedy | 110 | 5/5 | — | 334 ms | bf16 106, 4/5, 313 ms; balanced 45; safe 21 | 0.40.4 | §20 |
| kev 27b | nvfp4, greedy | 107 | 4/5 | 14% | 1,020 ms | balanced 101, 5/5; safe 82, 5/5 | 0.40.4 | §20 |
| kev 9b | bf16, greedy | 87 | 3/5 | — | 304 ms | balanced 77, 5/5; safe 39, 4/5 | 0.40.4 | §20 |
| kev 4b | bf16, greedy | 72 | 5/5 | — | — | balanced 29; safe 17 | 0.40.4 | §20 |
| clef-flash 9b | mxfp8, full request | 81 | 3/5 | 35% | 399 ms | bf16 65, 1/5, 326 ms | 0.40.0 | §19 |
| clef 27b | Q4_K_M, full request | 70 | 3/5 | 52% | 1,792 ms | — | 0.35.1 | §18 |
| tev1 0.8b | mxfp8, greedy | 33 | 5/5 | — | 43 ms | — | 0.40.4 | §20 |
| kev 0.8b | mxfp8, greedy | 25 | 3/5 | — | 43 ms | — | 0.40.4 | §20 |
| d1 3b | Q8_0, greedy | 7 | 0/5 | 94% | 153 ms | balanced 4; safe 4 | 0.40.5 | §21 |
| laya 421m | fp16 | 6 | 1/5 | — | — | the same games under every request | 0.40.4 | §20 |
| strands-decider 2b | every format | 1 | 0/5 | 99% | — | the same under every request | 0.40.4 | §20 |
| laya 322m | fp16 | 1 | 0/5 | — | — | — | 0.40.4 | §20 |
| *chat models* | | | | | | | | |
| gemma4:31b | | 115 | 5/5 | 12% | 1,293 ms | | 2026-09-23 | §13 |
| qwen3.8:27b | | 111 | 5/5 | 22% | 1,110 ms | | 2026-09-23 | §13 |
| gemma-4-26B-A4B heretic | Q4_K_M | 105 | 5/5 | 20% | 553 ms | | 0.35.0 | §17 |
| muse-glimmer:30b | | 100 | 4/5 | 3% | 1,223 ms | | 2026-09-23 | §13 |
| llama3:latest | | 7 | 2/5 | 74% | 318 ms | | 2026-09-23 | §13 |
| gemma4:e2b | | 4 | 0/5 | 98% | 232 ms | | 2026-09-23 | §13 |
| Apple Foundation Models | `fm serve` | 1 | 0/5 | 59% | 545 ms | | — | §13 |

A dash under *differs from code* means the section records no figure for that
run. Medians under about 40 ms are mostly cache hits while a starving snake
circles (§16, §20), not reading speed.

### Real time

`scripts/realtime.ts`, 3 seeds, 150-tick cap, at the fastest speed each model
was found to keep up with, projection on. No model measured since §19 has been
run in real time yet: nimble-v3, kev and d1 have no row.

| model | tag measured | speed | food | alive | on time | Ollama or date | source |
|---|---|---|---|---|---|---|---|
| tev1 4b | bf16, tight request | Fast (200 ms) | 47 | 3/3 | 100% | 0.40.0 | §19 |
| nimble 9b (v1) | bf16, full request | Normal (400 ms) | 50 | 3/3 | 100% | 0.40.0 | §19 |
| clef-flash 9b | bf16, full request | Normal | 28 | 3/3 | 100% | 0.40.0 | §19 |
| gemma-4-26B-A4B heretic | Q4_K_M | Slow (1,000 ms) | 50 | 3/3 | 100% | 0.35.0 | §17 |
| muse-glimmer:30b | | Slow | 23 | 1/3 | 95% | 2026-09-23 | §14 |
| qwen3.8:27b | | Slow | 16 | 0/3 | 92% | 2026-09-23 | §14 |
| gemma4:31b | | Slow | 13 | 0/3 | 87% | 2026-09-23 | §14 |
| clef 27b | Q4_K_M | Slow | 6 | 0/3 | 98% | 0.35.1 | §18 |
| llama3:latest | | Normal | 6 | 2/3 | 100% | 2026-09-23 | §14 |
| Apple Foundation Models | `fm serve` | Normal | 1 | 0/3 | 90% | — | §14 |

No model keeps up with Turbo (100 ms). tev1 4b at bf16 is the fastest that
plays well, at about 150–170 ms.

---

## 1. The `think` parameter — thinking is ON by default

`gemma4:e2b`, direction-only schema: omitting `think` is byte-for-byte
identical to `think: true`, **8282 ms and 935 generated tokens, against
101 ms and 7 with `think: false`. The default is on, and it costs 83x.**
`think: false` works alongside a `format` schema: thinking goes to
`message.thinking`, and `message.content` stays clean, parseable JSON.

## 2. Per-tick latency, N=7, warm, ~420-450 token prompt

Median wall clock, including ~10-20 ms HTTP overhead:

| model | direction only | + `why` field | ratio |
|---|---|---|---|
| `gemma4:e2b` (`think:false`) | **94.2 ms** | 1051.6 ms | 11.16x |
| `qwen3-vl:4b` (`think:false`) | 134.9 ms | **never terminates** | — |
| `llama3:latest` | 162.6 ms | 331.7 ms | 2.04x |
| `qwen3.8:27b-mlx` (`think:false`) | 426.4 ms | 3616.0 ms | 8.48x |
| `hermes3:latest` (excluded) | 124 ms | 808 ms | 6.5x |

The ratio is set by the number of generated tokens; throughput is flat. **The
cost of asking for a justification is model-specific, 2x to 11x** — the 6.5x
first cited came from hermes3 and is not representative.

## 3. Prompt variation study — is it the model or the prompt?

Seven prompt variants over ten machine-checked positions: five original cases
and five fresh ones designed so that only one has `east` as its answer.

| Variant | `gemma4:e2b` | `llama3:latest` | `qwen3.8:27b-mlx` |
|---|---|---|---|
| Baseline (grid, compass) | 3/10 | 2/10 | 9/10 |
| **Coordinates only** | **9/10** | 2/10 | **9/10** |

- **`gemma4:e2b` was being failed by the prompt.** Its weakness was parsing the
  ASCII grid, not spatial reasoning, and the rescue held on the five cases it
  was never tuned against.
- **`llama3:latest` is a capability limit:** 2/10 on all seven variants. Across
  57 trials it never emitted `west` or `left`, though they were correct in 12.
  This directional attractor survived every enum ordering and the switch to
  screen words, so it is neither position bias nor vocabulary.
- **Showing the grid and coordinates together is actively harmful**, and the
  only variant that degraded the strongest model, from 5/5 to 2/5 on the
  original cases.

**Food-seeking overrides survival.** A position with exactly one survivable
move, the food pointing elsewhere, was missed by all three models on every
variant; on one rotation `qwen3.8:27b` chose a body cell because it pointed at
the food. The largest model's 9/10 is specific to food-adjacent positions.

## 4. Prefix caching

**The cache is a strict prefix match from token 0.** With a multi-thousand
token static prefix, warm calls were 50-80x faster than cold; prepending four
tokens collapsed the cached count from 7229 to 4. `prompt_eval_count` still
reports the full prompt, so caching shows only in `prompt_eval_cached_count`.
`fm serve` reports `cached_tokens: 0` on every response.

**On `gemma4:e2b`, caching turns on between 314 and 614 tokens**, consistent
with a 512-token batch boundary: 0% of a 314-token prompt was cached, 99% of a
614-token one. *Corrected 2026-09-23:* the threshold is model-specific.
`muse-glimmer:30b` cached 252 of 424 prompt tokens, essentially the static
system prompt.

**Consequence:** the system prompt must stay identical across ticks to be
reused at all. At ~367 tokens our chat request got no reuse on `gemma4:e2b`
(`cached 0/367` every tick); crossing 512 would save roughly 150 ms a tick.
That is a reason not to over-compress the system prompt, not to pad it.

## 5. Model-specific defects

- **`qwen3-vl:4b` — `message.content` is always empty.** With `think: false`
  and a schema, the JSON arrives in `message.thinking`. It ignores
  `think: false` without a schema, and with a free-form string field it loops
  at temperature 0 and never closes the brace (over 600 s uncapped).
- **`llama3:latest` silently truncates and drops the middle.** Above its window
  it returns **200 OK with a confidently wrong answer**: a ~17k or ~33k prefix
  reported `prompt_eval_count` 4108. A code at the start of the prompt
  survived (`num_keep` protects the opening tokens); the same code in the
  middle came back wrong. The effective ceiling was 4108, not the advertised
  8192.

## 6. Structured output

Constrained decoding is real on every model tested: with a nonsense enum
`["zzq","wobble"]` all returned an in-enum value. `llama3:latest` reporting no
`tools` capability does not affect it: `tools` concerns the chat template,
`format` is a grammar applied in the sampler. Schema enforcement guarantees
**shape, never correctness** — one model returned a valid `south` where the
stated axes made `north` correct.

## 7. Provider reachability

Ollama 0.34.2 is reachable from a browser page on `localhost:5173` on stock
configuration; its default origin list also allows `localhost` on any port and
scheme, though its FAQ says otherwise, and does not allow `[::1]`.

**`fm serve` is not reachable from any browser page.** Its origin list is
hardcoded, and it also checks `Sec-Fetch-Site`, which browsers always send on a
cross-origin fetch: `same-site` and `cross-site` both get 403, and only
`same-origin` is accepted. The first measurements used curl, which sends no
such header, and wrongly found it reachable. The fix is a same-origin
dev-server proxy (`/fm` -> `127.0.0.1:1976`), verified at 200.

`fm serve` latency: median 396 ms on a matched snake-tick call (303-935 ms).
`fm respond` as a subprocess costs 685-1423 ms, ~500-700 ms of it startup.

## 9. Cold start, and why the first game died

A cold `gemma4:e2b` call took **2204 ms, 2088 ms of it loading weights**; after
an empty-prompt preload, 108 ms. The first live run in the UI scored **0%
controller share and the snake was dead in 7 ticks**, driving straight into the
wall before an answer arrived. With the preload on model selection, the same
run reached **57%**. *(Since 2026-10-07 the keep-alive is one minute, and
resuming waits for the model to reload: ADR-0007.)*

*Added 2026-10-03.* Since Ollama 0.35.1, `/api/generate` answers decision-only
models with HTTP 400, so the empty-prompt preload did nothing for them. A
minimal `/v1/systemone` request loads them instead: clef-flash 1,857 ms cold,
then 202 ms; tev1 994 ms, then 151 ms. Play now waits for the preload
(ADR-0007, amendment); a cold tev1 took about 1 s to load after Play.

## 10. Assistance levels, live

`gemma4:e2b` answered every tick and still crashed on tick 7: it was choosing
the wall, not failing to answer. Across the five assistance levels, three seeds
each, 60-tick cap, with one shared prompt:

| level | adds | result per seed (outcome @ tick, food) |
|---|---|---|
| 0 | board only | crashed @7, 0 · crashed @7, 0 · crashed @7, 0 |
| 1 | + legal moves | crashed @7, 0 · crashed @7, 0 · crashed @7, 0 |
| 2 | + immediately safe moves | crashed @49, 1 · **alive @60**, 0 · **alive @60**, 1 |
| 3 | + reachable open space | crashed @13, 0 · crashed @13, 0 · crashed @13, 0 |
| 4 | + planner's recommendation | **alive @60, 6** · **alive @60, 6** · **alive @60, 5** |

At levels 0 and 1 the model is not reading the board. Level 2 is the survival
threshold. Level 3 is worse than level 2: unexplained space counts hurt. Level
4 plays well, but that is the planner playing. The start makes level 0 hard:
heading north with the body south, south is never a legal first move.

## 11. Making level 0 work: it was the prompt

`gemma4:e2b`, level 0, five seeds, 60-tick cap, `scripts/eval-prompt.ts`:

| variant | food | alive | median |
|---|---|---|---|
| A · baseline | 2 | 0/5 | 251 ms |
| B · drop the `Heading:` line | 4 | 0/5 | 259 ms |
| **C · B + the food's offset in words** | **23** | **2/5** | **221 ms** |
| D · C + a scratchpad schema | 19 | 2/5 | 1050 ms |
| E · C, all in one user message | 16 | 0/5 | 263 ms |

- **The `Heading: north` line was the attractor:** with it the model died on
  tick 7 on every seed.
- **One line fixed it.** *"The food at (6,6) is 1 west and 4 south of the
  head."* took food from 4 to 23 at no latency cost. It restates coordinates
  the model already has, in the words it must answer with, so it was judged
  representation rather than help and sits in level 0.
- **A scratchpad schema** survives more steadily but eats less and is 5x
  slower. **Merging system and user** into one message was worse on every
  measure. C reproduced byte for byte on a rerun.

## 12. One prompt per level

Each assistance level got its own prompt file, explaining the help it gives.
`gemma4:e2b`, five seeds, 60-tick cap, `why` off:

| level | food | alive |
|---|---|---|
| 0 · board + food offset | 24 | 2/5 |
| 1 · + legal moves | 9 | 0/5 |
| 2 · + safe moves | 25 | 5/5 |
| 3 · + open space | 13 | 5/5 |
| 4 · + recommendation | 29 | 5/5 |

- **Level 3 is fixed:** its own prompt says a space figure below your length is
  a trap, and it now survives every game, where under the shared prompt it
  crashed on tick 13 on every seed. Knowing about traps makes it cautious; it
  eats half what level 2 does.
- **Level 1 is worse than level 0:** listing the legal moves repeats the enum.

### `why` belongs after the answer, not before

| level | food, `why` off | food, `why` first |
|---|---|---|
| 0 | 20 | 8 |
| 2 | 27 | 11 |
| 3 | 13 | 4 |
| 4 | 29 | 29 |

Placed **first**, as reasoning, `why` cut food by more than half with survival
roughly unchanged: it made the model cautious, not better. Placed **after**
`direction`, the games are identical to `why` off on every seed — at level 0,
the same 24 food and ticks; at level 2, the same 25 — because at temperature 0
the direction is decoded from the same prefix. It costs
~150-200 ms and nothing else, and the explanation is a rationalisation written
after the fact — which is what an observation panel should show, labelled so.

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

No model tested at the time was both fast enough for Normal speed and able to
act on the facts; decision models later were (§16, §19, and the current
standings).

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

Measured 2026-09-21 across Node 24.19, Bun 1.4.2 and Deno 2.9.7. Deno and Bun
have since been dropped, after a re-measurement from a clean copy of the
repository found neither as clean as first recorded; the detail is in
[ADR-0010](adr/0010-stack-pins-and-runtime.md), amendment. On all three, build
output was byte-identical. The traps that still apply under Node:

- **Node silently false-passes foreign test files** — a stray Vitest-style file
  was reported as `✔ passing` while no assertion ever ran.
- **Tailwind 4 scans `dist/`.** Without a `.gitignore`, a second build harvested
  class names from the previous bundle and produced 7.11 kB of CSS instead of
  5.11 kB.
- **An aliased `import.meta.glob` pattern fails silently** in Vite 8: an
  unregistered alias produces a warning, exit code 0, and a literal
  `import.meta.glob(...)` left in the bundle that throws at runtime. First
  blamed on Deno, it happens on every runtime. Relative patterns avoid it.

---

## 16. Decision models: tev1 and nimble

Measured **2026-09-30** with **Ollama 0.35.0**, which added decision models and
the `/v1/systemone` endpoint (ADR-0014). Both models are Q8_0 and report the
capabilities `decision`, `tools`, `thinking` and `completion`. (Since Ollama
0.35.1 they report only `decision`: see §18.)

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
| **tev1** | 200 ×5 | 96 | **5/5** | 0% | 0% | 31% | **317 ms** |
| nimble | 200, 200, 200, 111, 200 | 99 | 4/5 | 0% | 0% | 20% | 548 ms |

Both use the facts as the large chat models in §13 do. Neither ever chose a
dead end with a way out, or passed up food it could safely eat.

*Re-measured 2026-10-07 on Ollama 0.40.0* (§19): the same Q8_0 files now give
tev1 88 food and nimble 106 food, 5/5 alive, at 602 ms. The upgrade changed
their moves, not only the MLX variants'.

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

tev1 was the first model both fast enough for Normal speed and able to act on
the facts. On MLX at bf16, nimble later was too (§19).

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

*Adopted 2026-10-07* (§19): rebuilt and re-measured on MLX at bf16, a tight
request made tev1 and nimble faster without loss of play, and it replaced the
fuller wording.

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
| **gemma-4-26B-A4B heretic** | 200 ×5 | **105** | **5/5** | 0% | 0% | 20% | **553 ms** |

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

A mixture of experts closes much of the gap between the large dense models
and a decision model: judgement like gemma4:31b's at under half its latency.

---

## 18. Clef and Clef Flash, and Ollama 0.35.1

Measured **2026-10-03** with **Ollama 0.35.1**, which added Cloudflare's Clef
decision models. Both are asked through `/v1/systemone` exactly as tev1 is
(ADR-0014). The app needed no change: it routes any model reporting `decision`.

| | base | quantization | size on disk | context |
|---|---|---|---|---|
| clef-flash | Qwen3.5 family, 9.1B | Q8_0 | 10 GB | 262,144 (`num_ctx` 16,384) |
| clef | Qwen3.5 family, 27.0B | Q4_K_M | 17 GB | 262,144 (`num_ctx` 16,384) |

Both also accept images, through an `images` field on the request. That is not
used: JEV is sent text, and a picture of the board would be information JEV
does not get (ADR-0012).

**0.35.1 changed what decision models report.** `ollama show` and `/api/tags`
now list only `decision` for tev1, nimble and both Clef models, where 0.35.0
also listed `tools`, `thinking` and `completion`. The app and the scripts check
only for `decision`, so routing is unaffected. tev1 re-measured on 0.35.1 gave
the same result as in §16: 96 food, 5/5 alive, 312 ms median.

### Judgement, no clock

`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13, §16 and
§17, asked through `/v1/systemone`:

| | ticks survived | food | alive | into dead end | passed food | differs from code | median |
|---|---|---|---|---|---|---|---|
| tev1 | 200 ×5 | 96 | 5/5 | 0% | 0% | 31% | 312 ms |
| clef-flash | 112, 160, 200, 178, 126 | 59 | 1/5 | 0% | 0% | 36% | 540 ms |
| clef | 200, 200, 191, 128, 200 | 70 | 3/5 | 0% | 0% | 52% | 1,792 ms |

- **Both play worse than tev1, and are slower.** Clef Flash survived one game
  of five (3 crashed, 1 starved) and Clef three (2 crashed).
- **They do not ignore the facts.** Neither ever chose a dead end while it had
  a way out, nor passed up food it could safely eat. They die choosing between
  options the facts rate as safe, which a single step's facts cannot warn about.
- **Clef differs from the code reference on half its moves**, more than any
  other model that reads the facts.

*Re-measured 2026-10-07 on Ollama 0.40.0* (§19): clef-flash Q8_0 repeats
these games exactly; tev1 Q8_0 now eats 88 food rather than 96. On MLX,
clef-flash answers in 405 ms and survived 3 games of 5.

### Real time

`scripts/realtime.ts`, 3 seeds, 150-tick cap, asked through `/v1/systemone`.
Clef was run at Slow only, since it is slower than even the Slow tick.

*Corrected 2026-10-03.* The first version of this table was measured while the
scripts' preload silently failed for decision-only models (§9), so the first
game of each run began with the model cold. Only the rows run first, projection
off, changed when re-measured with a working preload; the conclusions did not.
The table shows the re-measured figures.

| | speed | projection | ticks survived | food | alive | share | on time | timed out | died waiting |
|---|---|---|---|---|---|---|---|---|---|
| clef-flash | Normal | off | 7, 130, 150 | 3 | 1/3 | 48% | 0% | 144 | 1 |
| | | on | 7, 39, 41 | 9 | 0/3 | 82% | 98% | 4 | 3 |
| clef-flash | Slow | off | 112, 150, 150 | 22 | 2/3 | 98% | 100% | 0 | 0 |
| | | on | 112, 150, 150 | 22 | 2/3 | 98% | 100% | 0 | 0 |
| clef | Slow | off | 12, 130, 16 | 2 | 0/3 | 45% | 0% | 79 | 0 |
| | | on | 67, 130, 144 | 6 | 0/3 | 93% | 98% | 6 | 1 |

- **Clef Flash is like nimble at Normal** (§16). Its ~540 ms answers are
  later than the 400 ms tick. Without projection none arrived on time, though
  it survived one game; with projection it decides more but died in every
  game, mostly waiting.
- **At Slow it keeps up but chooses worse.** It made nearly every decision and
  survived two games of three with 22 food, where nimble and the Gemma 4
  heretic (§17) survived every game. Its loss at tick 112 was a choice, not
  lateness.
- **Clef is too slow for any speed.** At ~1.8 s against a 1,000 ms tick,
  projection raises its share of decisions to 93%, but it died in all three
  games.

Neither Clef model displaced tev1 on GGUF. On MLX at bf16, clef-flash keeps up
at Normal, though with little food (§19).

---

## 19. MLX variants, and Ollama 0.40.0

Measured **2026-10-07** with **Ollama 0.40.0** on an Apple M5 Pro with 48 GB,
which runs models on MLX on Apple Silicon. The library now offers MLX tags of
the decision models beside the GGUF ones; `ollama show` reports their format as
`safetensors`. Each model's `mxfp8` tag was compared with the Q8_0 GGUF copy
already installed, both 8-bit, so that any difference comes from the runtime
and not from precision.

| | GGUF tag | MLX tag | MLX size on disk |
|---|---|---|---|
| tev1 | `latest` (Q8_0) | `4b-mxfp8` | 4.4 GB |
| nimble | `latest` (Q8_0) | `9b-mxfp8` | 9.3 GB |
| clef-flash | `latest` (Q8_0) | `9b-mxfp8` | 12.4 GB |

All report `decision` and are routed through `/v1/systemone` with no change to
the code. On 0.40.0 clef-flash also reports `vision`, in both formats; routing
checks only `decision`. Before each run the GPU's utilisation was checked to be
at most 5% for three seconds running.

### Judgement, no clock

`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13, §16 and
§18, one model at a time, Q8_0 then MLX:

| | ticks survived | food | alive | into dead end | passed food | differs from code | median |
|---|---|---|---|---|---|---|---|
| tev1 Q8_0 | 200 ×5 | 88 | 5/5 | 0% | 0% | 36% | 314 ms |
| tev1 MLX | 200 ×5 | 88 | 5/5 | 0% | 0% | 33% | **210 ms** |
| nimble Q8_0 | 200 ×5 | 106 | 5/5 | 0% | 0% | 23% | 602 ms |
| nimble MLX | 200 ×5 | 105 | 5/5 | 0% | 0% | 27% | **407 ms** |
| clef-flash Q8_0 | 112, 160, 200, 178, 126 | 59 | 1/5 | 0% | 0% | 36% | 533 ms |
| clef-flash MLX | 200, 200, 200, 178, 138 | 81 | 3/5 | 0% | 0% | 35% | **405 ms** |

- **MLX is about a third faster for every model**: 33% for tev1, 32% for
  nimble, 24% for clef-flash, at the same 8-bit precision.
- **It changes the moves, without a consistent direction.** tev1 and nimble
  play as well on MLX as on GGUF. clef-flash did better (81 food and 3 of 5
  alive, against 59 and 1), but five games cannot tell that from chance: once
  one move differs, the rest of the game differs too.
- **nimble and clef-flash on MLX now answer at about the Normal tick** (400 ms),
  where on GGUF they were well over it. Whether that is enough to play Normal
  speed is a question for `realtime.ts`, not yet run.
- No model chose a dead end with a way out or passed up food it could safely
  eat, in either format.

### Precision: 4-bit, 8-bit and full

The other MLX tags of the same models, measured the same way. For these runs,
and a repeat of the mxfp8 runs, every loaded model was unloaded first: the runs
above had left the previous model in memory. That had cost the mxfp8 runs only
2–10 ms at the median, with identical games, so the mxfp8 rows below are the
repeat.

| | size on disk | ticks survived | food | alive | differs from code | median |
|---|---|---|---|---|---|---|
| tev1 nvfp4 | 3.1 GB | 200 ×5 | 94 | 5/5 | 39% | 200 ms |
| tev1 mxfp8 | 4.4 GB | 200 ×5 | 88 | 5/5 | 33% | 208 ms |
| tev1 bf16 | 8.4 GB | 200 ×5 | 93 | 5/5 | 36% | **179 ms** |
| nimble nvfp4 | 6.9 GB | 200 ×5 | 104 | 5/5 | 24% | 379 ms |
| nimble mxfp8 | 9.3 GB | 200 ×5 | 105 | 5/5 | 27% | 397 ms |
| nimble bf16 | 17.9 GB | 200, 200, 194, 200, 200 | 104 | 4/5 | 26% | **326 ms** |
| clef-flash mxfp8 | 12.4 GB | 200, 200, 200, 178, 138 | 81 | 3/5 | 35% | 399 ms |
| clef-flash bf16 | 19.1 GB | 156, 160, 200, 178, 126 | 65 | 1/5 | 37% | **326 ms** |

The library has no 4-bit tag of clef-flash. No run chose a dead end with a way
out or passed up food it could safely eat.

- **Full precision is the fastest, not the slowest.** bf16 is 14–18% faster than
  mxfp8 for every model, and 4-bit gains only 4–5% over mxfp8. The lead comes
  from reading the request, as measured below.
- **Precision does not visibly change play.** tev1 and nimble stay within a few
  food in every format. clef-flash at bf16 plays much as it does on Q8_0, which
  suggests its better mxfp8 result above was chance.
- **On MLX, repeats are exact.** The repeated mxfp8 runs played the same games
  as the first, move for move.
- **With bf16, nimble and clef-flash answer well inside the 400 ms Normal tick**
  (326 ms), close to where tev1 was on GGUF. tev1 at bf16 (179 ms) is still
  slower than the 150 ms Fast tick.

### Real time

`scripts/realtime.ts`, 3 seeds, 150-tick cap, asked through `/v1/systemone`,
bf16 tags, every model unloaded and the GPU idle first. Fast is the new 200 ms
tick (ADR-0001).

| | speed | projection | ticks survived | food | alive | share | on time | timed out | died waiting |
|---|---|---|---|---|---|---|---|---|---|
| tev1 bf16 | Fast | off | 110, 150, 150 | 41 | 2/3 | 96% | 99% | 3 | 0 |
| | | on | 150, 150, 150 | 46 | 3/3 | 97% | 100% | 0 | 0 |
| nimble bf16 | Normal | off | 150, 150, 150 | 47 | 3/3 | 98% | 100% | 0 | 0 |
| | | on | 150, 150, 150 | 50 | 3/3 | 98% | 100% | 0 | 0 |
| clef-flash bf16 | Normal | off | 150, 150, 150 | 28 | 3/3 | 99% | 100% | 0 | 0 |
| | | on | 150, 150, 150 | 28 | 3/3 | 99% | 100% | 0 | 0 |

- **tev1 plays Fast.** With projection it does at 200 ms what Q8_0 did at
  Normal in §16: every game to the cap, 46 food, every answer on time. Without
  projection it lost one game, by a move it chose, not by waiting.
- **nimble plays Normal, and eats the most.** On GGUF it died in every game at
  Normal (§16). At bf16 every answer was on time and it survived all six games,
  with 50 food with projection: the most of any model at Normal in real time.
- **clef-flash survives Normal but eats little,** 28 food, about half the
  others, in keeping with its weaker judgement without a clock.

### Why full precision is faster: the cost of reading the request

A decision model only reads the request and scores the options; it generates
nothing. Quantizing the weights is known to speed up generation, which waits on
memory, but not reading a prompt (*prefill*), which is limited by arithmetic.
There, 4- and 8-bit weights must also be unpacked before use, so they can be
slower than full precision ([dev.to][q1], [Spheron][q2], and on Apple Silicon
[arXiv 2508.08531][q3]). Apple reports that on the M5, whose GPU has matrix
units for this, time to first token is compute-bound and its BF16 and 4-bit
models gained about equally (3.62× and 3.97× over the M4) ([Apple][q4]).
Nothing found applies this to decision models, which do only prefill.

To test it, `scripts/prefill-latency.ts` sent requests of four lengths to each
format through `/v1/systemone`: a near-empty request and three with filler rows
in `state`, each with a unique value so none was answered from cache (§16). Eight
repetitions per length, the order rotated, each model unloaded and the GPU idle
before it. Medians, and the cost per token from a straight-line fit:

| | ~120 tokens | ~500 | ~1,100 | ~1,900 | per 1,000 tokens |
|---|---|---|---|---|---|
| tev1 Q8_0 | 120 ms | 301 ms | 668 ms | 1,157 ms | 580 ms |
| tev1 nvfp4 | 92 ms | 191 ms | 434 ms | 759 ms | 376 ms |
| tev1 mxfp8 | 95 ms | 200 ms | 452 ms | 791 ms | 392 ms |
| tev1 bf16 | **64 ms** | **171 ms** | **395 ms** | **685 ms** | **348 ms** |
| nimble Q8_0 | 275 ms | 616 ms | 1,305 ms | 2,121 ms | 1,035 ms |
| nimble nvfp4 | 116 ms | 345 ms | 814 ms | 1,433 ms | 737 ms |
| nimble mxfp8 | 122 ms | 356 ms | 837 ms | 1,467 ms | 753 ms |
| nimble bf16 | **117 ms** | **304 ms** | **720 ms** | **1,234 ms** | **628 ms** |
| clef-flash Q8_0 | 256 ms | 513 ms | 1,191 ms | 2,125 ms | 1,057 ms |
| clef-flash mxfp8 | 116 ms | 348 ms | 824 ms | 1,423 ms | 734 ms |
| clef-flash bf16 | 127 ms | **316 ms** | **749 ms** | **1,280 ms** | **650 ms** |

The library has no 4-bit clef-flash. The longest requests stop short of tev1's
2,050-token context; a longer one was rejected with HTTP 400.

- **bf16's lead grows with the length of the request.** Each token read costs
  17% less than with mxfp8 for nimble and 11% less for tev1 and clef-flash. On
  a near-empty request nimble's MLX formats take the same time, and clef-flash
  at bf16 is slightly slower than at mxfp8, so for both the whole lead is in
  reading. tev1 at bf16 also starts about 30 ms ahead.
- **4-bit costs about as much per token as 8-bit,** though its weights are half
  the size: reading the request is not limited by memory.
- **MLX reads 1.4–1.5× faster than GGUF** at the same 8-bit precision.
- This locates the difference but cannot say what causes it inside Ollama:
  unpacking the weights, or less efficient code for the quantized formats.

Generation is a different matter. An open Ollama issue reports a bf16 MLX chat
model generating about 1 token/s on an M2 Ultra ([#18823][q5]), and advice
circulating for chat models is to avoid bf16 MLX builds for now. That concerns
generation, which decision models do not do.

[q1]: https://dev.to/ji_ai/why-int4-weight-only-quantization-doesnt-speed-up-prefill-1b45
[q2]: https://www.spheron.network/blog/myth-quantization-doesn-t-always-make-inference-faster/
[q3]: https://arxiv.org/pdf/2508.08531
[q4]: https://machinelearning.apple.com/research/exploring-llms-mlx-m5
[q5]: https://github.com/ollama/ollama/issues/18823

### A tight request, adopted

Since a decision model's latency is mostly the tokens it reads, the compact
request measured and set aside in §16 was rebuilt: shorter instructions and
legend in `jev-decision.json`, and each option's facts in fewer words
(`describeFactsCompact`). The facts are the same, number for number, which
a test checks on every option (ADR-0012). On the first board of seed 1000 the
request is 394 tokens against 489.

Measured the same way as the bf16 runs above, the same day:

| bf16, no clock | request | ticks survived | food | alive | differs from code | median |
|---|---|---|---|---|---|---|
| tev1 | full | 200 ×5 | 93 | 5/5 | 36% | 179 ms |
| | tight | 200 ×5 | 101 | 5/5 | 35% | **152 ms** |
| nimble | full | 200, 200, 194, 200, 200 | 104 | 4/5 | 26% | 326 ms |
| | tight | 200 ×5 | 105 | 5/5 | 23% | **285 ms** |

| tev1 bf16, Fast | request | projection | ticks survived | food | alive | share | on time | timed out |
|---|---|---|---|---|---|---|---|---|
| | full | off | 110, 150, 150 | 41 | 2/3 | 96% | 99% | 3 |
| | | on | 150, 150, 150 | 46 | 3/3 | 97% | 100% | 0 |
| | tight | off | 150, 150, 150 | 47 | 3/3 | 97% | 100% | 0 |
| | | on | 150, 150, 150 | 47 | 3/3 | 97% | 100% | 0 |

- **13–15% faster,** 27 ms for tev1 and 41 ms for nimble, close to the
  ~0.35 ms and ~0.63 ms per token measured above.
- **No loss of play.** On these seeds both models did slightly better, with
  more food and every game survived; five games cannot show that the tight
  request is better, only that it is not worse. On GGUF in §16 it had eaten 92
  food against 96.
- **tev1 plays Fast without projection,** every answer on time.
- tev1 at 152 ms is still well short of Turbo's 100 ms tick.

It replaced the fuller wording for the app and the scripts, which is no longer
kept as an option (ADR-0014). Every decision-model result before this
subsection used the fuller wording.

### Ollama 0.40.0 changed the GGUF results too

The Q8_0 files are the ones measured in §16 and §18, at temperature 0 on the
same seeds, yet two of the three play differently on 0.40.0:

| Q8_0 | before | Ollama 0.40.0 |
|---|---|---|
| tev1 | 96 food, 5/5, 31% differs, 312 ms (0.35.1) | 88 food, 5/5, 36% differs, 314 ms |
| nimble | 99 food, 4/5, 20% differs, 548 ms (0.35.0) | 106 food, 5/5, 23% differs, 602 ms |
| clef-flash | 59 food, 1/5, 36% differs, 540 ms (0.35.1) | the same games, 533 ms |

Results from different Ollama versions are therefore not directly comparable,
even for an unchanged model file. Comparisons in this section are all on 0.40.0.


## 20. Telling decision models about hunger, and JEV's greedy strategy

Measured **2026-10-15** with **Ollama 0.40.4** on the same M5 Pro, the GPU idle.
`scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13 onwards,
every model at bf16 through `/v1/systemone`.

The decision request never mentioned hunger (ADR-0003). JEV's game has none,
so its request has nothing to copy, and a model could circle safely beside the
food until it starved without having been told that this kills the snake. Two
changes were tried, alone and together:

- **A, hunger.** The instructions add *"Going too long without food starves the
  snake: it must reach food within mustEatWithinMoves moves."*, and the state
  carries `mustEatWithinMoves`, the moves left before starving.
- **B, greedy.** The goal line is replaced by JEV's own `greedy` preset, sent as
  JEV sends it: *"Player strategy: Get to the food as fast as possible. Always
  shorten the distance to the food unless that move is a dead end."* JEV's
  client starts on its `safe` preset; *"Stay alive and eat food."* is its
  fallback when the strategy is empty.

Food eaten, games survived of five, and median latency:

| bf16 | shipped request | A | B | A + B |
|---|---|---|---|---|
| tev1 4b | 95, 4/5, 157 ms | 100, **5/5**, 168 ms | 94, 3/5, 164 ms | 106, 3/5, 173 ms |
| nimble 9b | 101, 3/5, 300 ms | 106, **5/5**, 305 ms | 97, 3/5, 304 ms | 110, **5/5**, 315 ms |
| nimble-v3 9b | 63, 4/5, 291 ms | 45, **5/5**, 304 ms | 110, **5/5**, 304 ms | 104, 4/5, 314 ms |
| kev 9b | 60, 5/5, 274 ms | 77, **5/5**, 292 ms | 70, 2/5, 286 ms | 88, 1/5, 300 ms |
| all four | 319 food, 16/20 | 328, **20/20** | 371, 13/20 | **408**, 13/20 |

The tev1 baseline was measured on 2026-10-14, on the same Ollama version, with
other work using the machine; its games are reliable, its latency less so.

- **Hunger kept every snake alive** across all four models, and three of them
  ate more. It costs 5–18 ms, from the longer request.
- **Greedy depends on the model.** nimble-v3 went from 63 food to 110, the best
  of these runs; tev1, nimble and kev crashed more. No crash came from choosing
  a dead end: greedy play enters spaces that are safe now and closed later.
- **Together they eat the most and lose the most games.**
- Five games per cell cannot rank close results; once one move differs, the
  rest of the game does too. The survival difference is the clearer signal.

The smaller decision models, measured the same way:

| | shipped request | A | B |
|---|---|---|---|
| kev 4b (bf16) | 26, 4/5 | 29, 4/5 | 56, 4/5 |
| tev1 0.8b (bf16) | 18, 3/5 | 17, 3/5 | 6, 1/5 |
| kev 0.8b (bf16) | 1, 0/5 | 3, 0/5 | 14, 1/5 |
| strands-decider 2b (bf16) | 1, 0/5 | 1, 0/5 | 1, 0/5 |
| laya 421m, `typed-decisions` and `latest` (fp16) | 6, 1/5 | 6, 1/5 | 6, 1/5 |
| laya 322m `multilingual` (fp16) | 1, 0/5 | 2, 0/5 | 1, 0/5 |

- **No wording rescues them.** Most games end in starvation, the snake
  circling on one choice. strands-decider differs from the code reference on
  99% of moves under every request.
- **laya plays the same games whatever it is told:** move for move under all
  three requests. It appears to read only the option texts.
- **kev 4b doubles its food with greedy,** as nimble-v3 did.
- Medians under about 40 ms here are mostly answers from `/v1/systemone`'s
  cache (§16): a circling snake repeats the same board, and so the same request.

Hunger is now part of the decision request (ADR-0012, amended 2026-10-15). A
strategy is a matter of style that suits some models and not others, so it
becomes a setting rather than part of the shipped wording ([open
threads](open-threads.md)).

### Strategies, in our own wording

The strategy became a setting (ADR-0012, amended 2026-10-15), with `safe` and
`greedy` reworded rather than copied from JEV. Measured the same day and the
same way, with the hunger request; `balanced` is the column A above, the
default request unchanged. Food eaten and games survived of five:

| bf16 | balanced | greedy | safe |
|---|---|---|---|
| tev1 4b | 100, 5/5 | 106, 4/5 | 83, 5/5 |
| nimble 9b | 106, 5/5 | 98, 4/5 | 88, 3/5 |
| nimble-v3 9b | 45, 5/5 | 106, 4/5 | 21, 5/5 |
| kev 4b | 29, 4/5 | 72, 5/5 | 17, 2/5 |
| kev 9b | 77, 5/5 | 87, 3/5 | 39, 4/5 |

- **Our `greedy` wording does what JEV's did.** nimble-v3 goes from 45 food to
  106, close to the 110 with JEV's sentence, and kev 4b from 29 to 72.
- **`safe` costs food for every model** and saves no games: it starves the
  ones that circle, kev 4b losing three of five that way, and nimble-v3
  disagrees with the code reference on 80% of its moves.
- **No strategy suits every model.** `balanced` is best for nimble, `greedy`
  for nimble-v3 and both kevs, and tev1 sits between them. A new model is
  therefore worth measuring under each.

### Every format, timed once with greedy

Measured 2026-10-15, the same way, under `greedy`, for every format not yet
run with a strategy. The bf16 rows are from the strategy table above. tev1 4b,
nimble and clef-flash at mxfp8 and nvfp4 were timed in §19 and not repeated.
Food eaten, games survived of five, and median latency:

| greedy | bf16 | mxfp8 | nvfp4 |
|---|---|---|---|
| nimble-v3 9b | 106, 4/5, **313 ms** | 110, 5/5, 354 ms | 110, 5/5, 334 ms |
| kev 9b | 87, 3/5, 304 ms | — | 84, 3/5, **301 ms** |
| kev 27b | — | — | 107, 4/5, 1,020 ms |
| kev 0.8b | 14, 1/5, 6 ms\* | 25, 3/5, 43 ms | — |
| tev1 0.8b | 6, 1/5, 7 ms\* | 33, 5/5, 43 ms | — |
| strands-decider 2b | 1, 0/5, 6 ms\* | 1, 0/5, 72 ms | 1, 0/5, 69 ms |

\* Mostly answers from the `/v1/systemone` cache while a starving snake
circles, not reading speed (see above). The bf16 rows for the three small
models were measured with JEV's greedy sentence, not ours.

kev 27b under the other strategies: 101, 5/5, 1,018 ms balanced; 82, 5/5,
1,023 ms safe. Its bf16 tag, 51 GB, does not fit this Mac's 48 GB.

- **bf16 is still fastest, or level, for every model** that has it: 7% ahead
  of nvfp4 and 13% of mxfp8 for nimble-v3, level with nvfp4 for kev 9b.
  §19's finding holds on 0.40.4.
- **Format does not change play much**, as in §19: nimble-v3 eats 106–110 in
  all three.
- **kev 27b judges best and is too slow to play.** It differs from the code
  reference on 14% of moves under greedy, the lowest of any model, but at
  about 1,020 ms it misses even the Slow tick (1,000 ms).
- **Greedy gets the tiny models to steer a little:** tev1 0.8b and kev 0.8b at
  mxfp8 eat 25–33 food, against 1–18 before. strands-decider does not move
  under any request.

## 21. d1, and Ollama 0.40.5

Measured **2026-10-16** with **Ollama 0.40.5** on the same M5 Pro, the GPU
idle. `scripts/eval-prompt.ts`, 5 seeds × 200 ticks, the same seeds as §13
onwards, through `/v1/systemone`.

`d1` is Liquid AI's decision model, built on LFM2.5-VL-3B: 2.7B parameters plus
a 426M vision projector, reporting `decision` and `vision`. The library offers
it only as GGUF Q8_0 (3.7 GB; `latest`, `3b` and `3b-q8_0` are one file), with
no MLX tag yet. Liquid AI reports 48.57 on Decision Index 0.2.1; that figure was
not checked here.

| | strategy | ticks survived | food | alive | into dead end | passed food | differs from code | median |
|---|---|---|---|---|---|---|---|---|
| d1 Q8_0 | greedy | 199, 130, 160, 130, 150 | 7 | 0/5 | 0% | 0% | 94% | 153 ms |
| | balanced | 176, 130, 130, 130, 150 | 4 | 0/5 | 0% | 0% | 96% | 125 ms |
| | safe | 176, 130, 130, 130, 150 | 4 | 0/5 | 0% | 0% | 97% | 154 ms |
| tev1 4b bf16 | greedy | 200 ×5 | 107 | 5/5 | 0% | 0% | 33% | 172 ms |

- **d1 does not steer towards food.** It never crashed and never chose a dead
  end, but every game ended in starvation, under every strategy. It plays like
  the small models in §20, not like tev1.
- **It is no faster than tev1 4b at bf16,** despite being smaller, though it
  runs on GGUF, which reads requests 1.4–1.5× slower than MLX (§19). An MLX
  build may be faster; whether it would play differently is open.
- **0.40.5 changed tev1's games again.** Under greedy on 0.40.4 (§20) it ate
  106 and survived 4 of 5; on 0.40.5, 107 and 5 of 5.
