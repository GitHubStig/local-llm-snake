# ADR-0006: Controller interface and overlap

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

A controller answers one question per tick: which way do I turn? The interface
is the only load-bearing boundary between the game half and the AI half, so it
is the one place a wrong decision forces rework later.

## Decision

One interface. Always asynchronous.

```ts
type Decision = { direction: Direction; meta?: Record<string, unknown> }

interface Controller {
  readonly id: string
  decide(view: GameView, signal: AbortSignal): Promise<Decision>
}
```

- **Always async.** A fast controller returns an already-resolved promise. One
  code path serves everything.
- **`meta`** is an untyped bag for per-direction scores, explanations and
  timings. The panel renders it; the engine never inspects it. This is what
  keeps `src/game/` free of any knowledge of LLMs.
- **`AbortSignal`** cancels a request that has become irrelevant — game over,
  controller switched, human took over.

**Human is a controller.** Its `decide` returns a promise that resolves on the
next keypress. Not pressing anything means the promise has not resolved when
the deadline expires, so continue-straight fires — which is how classic snake
already behaves. Takeover is therefore a controller swap, not a special
mechanism. Keypresses queue one deep rather than overwriting.

**Shipped controllers: `human` and `ai`.** The `ai` controller is parameterised
by a provider (ADR-0007).

### Overlap

**One request is kept continuously in flight**, not tied to tick boundaries.
When an answer arrives it becomes the current preferred direction. Each tick
consumes the freshest stored answer, and the next request fires **on
consumption** rather than on arrival — while an unconsumed answer is held, it
already describes the current board, so asking again would only replace it
with work computed on the same state.

This was corrected during implementation. Re-requesting on *arrival* also
turns out to be unimplementable for a controller that resolves synchronously:
the request loop re-enters itself without ever yielding to a tick.

Before use, a stored answer is discarded if it would reverse onto the neck.
*Amended 2026-09-23:* it was also discarded past a two-tick staleness cap.
That cap is gone; answers are now judged against the tick they were projected
for, and a late one is applied as long as it is still safe
([ADR-0013](0013-latency-compensation-by-projection.md)).

## Alternatives considered

**A `kind: 'sync' | 'async'` discriminator** so fast controllers could be
called inline. Dropped: an instantly-resolving promise lands before the tick
ends anyway, so its staleness is always zero and the overlap loop serves both
uniformly. Removing it removed a code path.

**Sync-only `decide(view): Direction` with the model on a separate path.**
Rejected: two paths through the runner forever, and the model stops being a
peer of other controllers.

**Explanations through a side channel** (events, callbacks) with `decide`
returning a bare direction. Rejected: the runner would have to correlate
explanations back to decisions.

**Controller pushes moves instead of the runner pulling.** Rejected: inverts
control, and under a real-time tick the runner must own the clock.

**Code controllers (random, greedy, safe-greedy) shipped first**, to establish
a baseline before wiring any model. Recommended and rejected by the user: the
playground is about LLMs, not pathfinding.

**One request per tick** instead of overlap. Measured consequence at 400ms
ticks against a ~900ms model: every request misses its deadline and arrives
describing a board two ticks stale, so the model's share of moves is
approximately zero. Rejected.

## Consequences

- Adding a provider is a new `Provider`, not a new `Controller`.
- Without code controllers there is **no baseline**: metrics are absolute, not
  comparative, so "is 14 food good?" has no answer except relative to another
  model or to a human. Adding one later is straightforward — it is just another
  `Controller`.
- Acting on a slightly stale board is possible by design. The staleness cap and
  the legality re-check bound the risk; the staleness counter makes it visible.
