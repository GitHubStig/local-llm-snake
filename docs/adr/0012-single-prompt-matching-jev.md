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
