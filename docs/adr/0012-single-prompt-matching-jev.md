# ADR-0012: A single prompt matching JEV's inputs

- **Status:** Accepted
- **Date:** 2026-09-22
- **Supersedes:** [ADR-0008](0008-prompt-schema-and-switches.md)

## Context

ADR-0008 made the amount of help given to the model the experiment: five
assistance levels, each with its own prompt. That ladder is what exposed most
of what we know about how these models fail — the `Heading:` line acting as an
attractor, the food's offset being essential rather than cosmetic, and a level
that crashed because its prompt never explained its own figures.

JEV is to be added as a third provider. JEV's reference implementation
(`sorrycc/typesafe-snake`) gives it a fixed, heavily assisted request: code
filters out every fatal move, computes exact facts about each remaining one,
and asks the model to pick. Comparing local models with JEV is only fair if
both receive the same information; otherwise any gap between them is partly a
gap in what they were told.

## Decision

**One prompt, `src/prompts/jev-parity.json`, carrying the same information JEV
is given.** The assistance levels, their five prompt files, the "help given to
the model" selector, the level-4 planner and the representation switch are
removed.

The model receives:

- **The board as a grid**, with `H` head, `o` body, `T` tail, `F` food, `.`
  empty. The legend and orientation are in the system prompt, which keeps them
  in the cacheable prefix.
- **State lines:** head and food as named row and column, heading, snake
  length, grid size, and whether the food is next to the head.
- **The rules** and a fixed goal: *stay alive and eat food*.
- **One line per option, stating exact facts** computed in
  `src/game/analysis.ts`: the turn (straight, left, right), where the head
  lands, whether it eats or how far the food is afterwards, how many empty
  cells stay reachable, and whether the move is a `DEAD END` or the tail can
  still be followed out.

**Only safe moves are offered.** The schema's `direction` enum is the safe
moves, so the model cannot name a fatal one. The system prompt therefore does
state that every option is safe — which ADR-0008 forbade only because its enum
held legal moves, some of them fatal. Here the claim is true.

**With fewer than two safe moves, code decides and the model is not called.**
Such a move is marked `forced` on the `Decision` and recorded as its own kind,
so it never counts towards controller share.

**The wording is our own.** The reference repository carries no licence, so it
is all rights reserved by default. The approach and the set of facts are
matched; the text is not copied.

Carried over from ADR-0008 unchanged: `think: false` always; `why` after
`direction` and required when asked; nothing varying in the system prompt; an
unknown template placeholder throws.

## Alternatives considered

**Keep the ladder alongside a parity level.** It is the better instrument for
asking how much help a model needs. Rejected in favour of one prompt, simpler
to reason about and to compare against JEV. Recoverable from commit `2f87eb7`.

**Parity adapted to our findings** — dropping the heading line and one of the
two board descriptions, both of which hurt small models at level 0. Rejected:
matching JEV's inputs is the reason for this decision, and those findings came
from models guessing with nothing else to go on. With exact facts per option,
the model should not be guessing at all. Untested either way.

**Strategy presets** (*safe*, *greedy*, *chaos*), as JEV's reference has.
Rejected: they change style rather than accuracy, and are not needed for a fair
comparison.

**JEV's direction labels** — up, right, down and left, where this prompt says
north, east, south and west. Tested 2026-09-23 and not adopted. The
information is identical either way, which is what parity protects. A model
that reads the facts was unaffected; the default model, llama3, did clearly
worse with JEV's labels, likely because an option can then contradict itself —
heading down, the option to the left reads `left (right turn)`
([findings.md](../findings.md) §13). The prompt file's `directionNames` makes
switching a one-line change if a future model warrants it.

**Per-option probabilities**, which JEV returns and which make its panel
readable. Ollama documents a `logprobs` option that might provide the same for
local models. Deferred until it can be verified.

## Consequences

- **Measured 2026-09-23, and the models are *not* alike.**
  ([findings.md](../findings.md) §13.) This ADR originally predicted that with
  code doing the analysis, models would look alike on accuracy and differ
  mainly in speed. They differ enormously. qwen3.8:27b reads every fact, never
  dies, and eats more than a code reference choosing from the same facts.
  gemma4:e2b ignores the facts and picks the last-listed option 95% of the time,
  drifting until it starves — 4 food in five games, against 60 under the old
  level 2. Parity is a fair benchmark, and what it reveals is whether a model
  can act on facts at all.
- **The heading line and the doubled board description are harmless here.**
  Removing the heading left every game identical; removing the head and food
  lines made no measurable difference.
- **"Legal but fatal" becomes near-impossible.** A fatal move is never offered,
  so it can only arise from an answer that aged in flight onto a board where it
  had become fatal. It stays a real signal, but a much rarer one.
- **The request is still below the caching threshold.** About 227 tokens of
  system prompt and roughly 200 of board and options put a typical request
  around 430 tokens, under the ~512 where Ollama's prefix cache engages.

## Amendment, 2026-10-15: hunger in the decision request

The decision request now tells the model about hunger. Its instructions add
*"Going too long without food starves the snake: it must reach food within
mustEatWithinMoves moves."*, and its state carries `mustEatWithinMoves`, the
moves left before the snake starves (ADR-0003). It is set by `hungerInState`
in `src/prompts/jev-decision.json`.

This is a recorded exception to parity, like the direction names. JEV's game
has no hunger, so its request has nothing to match; leaving it out did not
make the comparison fairer, it hid one of our game's rules from the model.
Parity protects the information a model gets about the game it is playing.

Measured with four decision models, it kept every game alive where the shipped
request lost four of twenty, and three of the four ate more
([findings.md](../findings.md) §20). The count changes every tick, so it is in
the state, never in the cached instructions. The chat prompt is unchanged.

**Strategy presets, reconsidered.** The rejection above said presets change
style rather than accuracy. §20 shows that the style matters, and differently
for each model: JEV's `greedy` preset took nimble-v3 from 63 food to 110 and
made three other models crash more. A preset is therefore to become a setting,
measured per model, rather than part of the shipped wording ([open
threads](../open-threads.md)). The goal line, *"Stay alive and eat food."*, is
the text JEV sends when its strategy is empty; JEV's client starts on `safe`.

## Amendment, 2026-10-15: strategy as a setting

Built as the reconsideration above proposed. `src/prompts/jev-decision.json`
holds named `strategies`, and the chosen one's line ends the instructions:

- `balanced`, the default: *"Goal: stay alive and eat food."* The default
  request is unchanged by this, and is the one measured in §20.
- `safe`: survive first, keep the most cells reachable, never take a dead end,
  eat only when it costs no room.
- `greedy`: reach the food in the fewest moves, unless the move is a dead end.

`safe` and `greedy` have the intent of JEV's presets of the same names, in our
own words: the reference carries no licence, so its text is not copied (see
*The wording is our own* above). §20 measured JEV's own `greedy` sentence
first, then this wording, which has the same effect.

The strategy is chosen in the decision panel, or with `STRATEGY=` in
`eval-prompt.ts` and `realtime.ts`, which print it in their header. A strategy
is fixed for a game, so the instructions stay identical across its ticks and
remain cacheable. It applies to decision models only; the chat prompt keeps
its fixed goal. JEV's `chaos` preset, which plays badly on purpose, is left
out.

A new model is measured under each strategy rather than the shipped wording
being tuned to whichever model is best today.

## Amendment, 2026-10-15: greedy is the default strategy

The default strategy is now `greedy`, not `balanced`. Of the decision models
kept after that day's measurements, nimble-v3 and kev 9b eat far more under
`greedy` (106 and 87 food against 45 and 77) and tev1 4b about the same
([findings.md](../findings.md) §20), so the app plays better out of the box.
`balanced` stays selectable, and is the goal every result before §20's
strategy table was measured with; results from the two defaults are not
directly comparable.

## Amendment, 2026-10-21: the token cap is set in code

ADR-0008 put `temperature` and `num_predict` in the prompt file's `options`,
and said `why` was capped there. No code ever read that block: temperature is
fixed at 0 by each provider, and the cap is the `maxTokens` the caller hands
the controller — 48 in the app, 16 in `realtime.ts`, and 16 or 64 in
`eval-prompt.ts` depending on `why`. The file's 64 had drifted from the app's
48 without changing anything. The block is removed from `jev-parity.json` and
`PromptFile`, so the file no longer claims to set what it does not.
