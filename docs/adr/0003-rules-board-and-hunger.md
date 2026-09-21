# ADR-0003: Rules, board and hunger

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The ruleset determines what a controller is actually being tested on. Some
rules are fixed because alternatives add nothing; others are dials that expose
different failure modes.

## Decision

Fixed, non-configurable:

- Hitting a wall kills.
- Hitting yourself kills.
- Reversing into your own neck is **not a rule** — see below.

Configurable, via a `Ruleset` object threaded through the engine as data:

| Setting | Default |
|---|---|
| `width` x `height` | 12 x 12 |
| `foodCount` | 1 |
| `growthPerFood` | 1 |
| `startingLength` | 3 |
| `hungerBase` / `hungerPerSegment` | 100 / 10 — starve after `base + length * perSegment` ticks |
| `speedEscalation` | `false` |

Terminal states are distinct and recorded separately: **crashed** (wall or
self), **starved** (hunger), **won** (snake fills the board).

### Reversing is structural, not a rule

Moving north, the neck occupies the cell immediately south of the head. On the
next tick the tail vacates its last cell, but the neck does not move away — it
becomes wherever the head just was. Reversing is therefore fatal in every
configuration, and `legalMoves(state)` returns **at most three** directions.
The exception is length 1, where there is no neck and all four are legal.

### Hunger

Failing to eat for `hungerLimit` ticks kills the snake. This exists to
eliminate a degenerate strategy: a controller that circles safely forever never
dies, so any metric rewarding survival would rank cowardice highly.

## Alternatives considered

**Speeding the game up on hunger instead of killing.** Proposed and rejected
after analysis. It does not remove the degenerate strategy — a circling snake
simply circles faster — and it couples stall pressure to latency, because
shrinking the deadline penalises only controllers that can miss one. A fast
controller would be untouched at any speed while a slow model would be killed
for being slow rather than for stalling, contaminating the exact comparison the
project exists to make. Retained as `speedEscalation`, off by default, for
arcade play rather than measurement.

**Flat or board-area hunger limit** (144 on a 12x12 board). Rejected in favour
of length-scaling, which is more forgiving as the board fills and routes get
genuinely harder.

**Wrap-around walls, interior obstacles, multiple food.** Not implemented, but
noted as the rule variants that would probe distinct capabilities — wrap tests
topological reasoning, obstacles separate pathfinding from food-seeking.

**Configurable starting length** is included because the interesting part of
snake AI is the late game, where a long snake can trap itself. Without it,
every run spends hundreds of ticks getting there.

## Amendment, 2026-09-21

`hungerLimit` was originally a function on `Ruleset`. Writing the engine tests
showed that made the ruleset non-serialisable — `structuredClone` refuses a
function — which would have broken the run record in ADR-0009 and any persisted
settings. It is now two numbers plus a `hungerLimit(rules, length)` helper, and
`Ruleset` is plain data.

## Consequences

- `legalMoves` is a rules fact, available to the harness (ADR-0006) regardless
  of what the prompt is told (ADR-0008).
- Distinguishing starved from crashed means "this controller wanders" and "this
  controller drives into walls" do not blur into one number.
