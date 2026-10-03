# ADR-0014: Decision models through Ollama's `/v1/systemone`

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Ollama 0.35 added a second kind of model: *decision* models, which choose
between described options instead of writing text. The first two in its
library are `tev1`, a 4B fine-tune of Qwen3.5 from Together AI, and `nimble`
(Bespoke-Nimble, 9B). Both report the capability `decision`.

They are called through a new endpoint, `/v1/systemone`, whose request has the
same shape as JEV's SystemOne API: a `state` object, and named `questions`,
each with `instructions` and, for a `choice` question, a map of `criteria` from
option name to description. The answer names the chosen option and gives a
probability for every option and an overall confidence.

That shape fits this project closely. The chat prompt (ADR-0012) reproduces
JEV's inputs as text; a decision model takes them in the form JEV itself does.
It also bears on two open threads: a fast model that uses the facts, and
per-option probabilities, which chat models could not give.

## Decision

**Models with the `decision` capability are asked through `/v1/systemone`, by
a separate controller, `DecisionController`** (`src/ai/decision.ts`). Every
other model keeps the chat prompt. The choice is made from the capabilities
Ollama reports, so any future decision model is routed the same way with no
configuration.

The request carries exactly the information the chat prompt does, so parity
(ADR-0012) holds:

- **`state`:** the grid as a list of rows, its legend, head, food, heading,
  snake length, grid size, and whether the food is next to the head.
- **`instructions`:** the rules and the goal, from
  `src/prompts/jev-decision.json`, editable without touching code.
- **`criteria`:** one entry per safe move, named by direction, described by the
  same exact facts as the chat prompt's option lines, from the same function
  (`describeFacts` in `src/ai/prompt.ts`).

Everything shared with the chat path stays shared: the analysis, the forced
move when fewer than two moves are safe (`forcedMove`), the direction names,
and the runner's projection (ADR-0013), which is unaware of which controller it
is driving.

The decision panel shows each option's probability and the confidence, and
under *What was sent* the options, state and instructions. Decision models give
no reason, so the *Ask why* setting does not apply to them.

## Alternatives considered

- **Calling decision models through `/api/chat`.** They have a chat template,
  but their system prompt ("Select exactly one listed option. Return only its
  letter") shows they are trained for the choice format. The endpoint also
  returns probabilities, which chat does not.
- **Reordering the request so the fixed instructions stay cached.** Measured:
  the endpoint reuses nothing unless the whole request repeats exactly, so no
  ordering helps ([findings](../findings.md) §16).
- **Dropping the board from `state` to cut latency.** It saves about 70 ms of
  ~310, but the board is part of what JEV receives.
- **A more compact request.** *Measured 2026-09-30, not adopted*
  ([findings](../findings.md) §16). Encoding `state` differently saves nothing:
  the endpoint renders it into its own text. Tighter wording of the
  instructions, legend and option facts, with the same information, cut the
  request from about 490 to 385 tokens and the median from 311 ms to 246 ms.
  It survived all five games, with 92 food against 96. The endpoint has a floor
  of about 115 ms per request, so no trimming makes Fast speed workable, and at
  Normal speed tev1 already keeps up. Worth revisiting if a second request loop
  (shadow mode) needs the headroom.

## Result

*Measured 2026-09-30* ([findings.md](../findings.md) §16).

- **tev1 is the first model tested that both keeps up at Normal speed and acts
  on the facts.** Without a clock it survived all five games with 96 food,
  against the code reference's 106, never chose a dead end when it had a way
  out, and never passed up food. In real time at Normal it made 96–98% of the
  decisions due, and all three games survived the 150-tick cap.
- **nimble chooses as well but is too slow for Normal:** 99 food without a
  clock, at about 550 ms a move. In real time at Normal it died in all three
  games, even with planning ahead.
- At Fast (150 ms a tick), neither keeps up. Projection raises tev1's share of
  decisions from 29% to 65%, but it still dies waiting.

*Corrected 2026-09-30.* The figures first recorded here (107 food for tev1, 95
for nimble at 685 ms) were measured through `/api/chat`, not `/v1/systemone`:
the measurement scripts compared the bare names `tev1` and `nimble` against
the listed `tev1:latest` and `nimble:latest`, found no match and fell back to
chat silently. The app was unaffected. The scripts now match either form and
label each result with its endpoint; findings §16 keeps both sets.

*Added 2026-10-03* ([findings.md](../findings.md) §18). Ollama 0.35.1 added
Clef and Clef Flash, Cloudflare's decision models (27B and 9B). They were
routed here with no change to the code. Both read the facts but play worse than
tev1 and are slower: Clef Flash survived 1 game of 5 at ~540 ms a move, and
Clef 3 of 5 at ~1.8 s. Neither keeps up at Normal speed. 0.35.1 also made
decision models report only the `decision` capability, which is all the
routing checks. Clef also accepts images; they are not sent, since JEV gets
text only (ADR-0012).

## Consequences

- The open thread asking for a fast, fact-reading local model is closed: tev1
  meets its bar at Normal speed. Per-option probabilities exist for decision
  models only; chat models still give none, which remains open.
- The JEV provider can reuse `DecisionController` unchanged if
  JEV's API matches the SystemOne shape, as its reference implementation
  suggests. That is not yet verified against JEV itself.
- The `decision` endpoint is new and marked experimental. Its request and
  response shapes are read by `parseDecision` in `src/ai/ollama.ts`, which
  fails loudly if an answer has no choice.
