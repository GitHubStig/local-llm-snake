# ADR-0001: Real-time tick with a deadline

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The game must accommodate controllers whose response times differ by four
orders of magnitude: a keypress is instant, a local LLM takes 120ms to several
seconds. The clock model decides the shape of the entire engine, so it cannot
be deferred.

## Decision

The game runs on a real-time tick. Each tick has a deadline; if no direction is
available when it expires, **the snake continues straight**.

Speed presets: slow 1000ms, normal 400ms, fast 150ms, turbo 60ms.

`Step` advances exactly one tick and is active only while paused.

## Alternatives considered

**Turn-based** — the tick waits for the controller to answer, so "speed" is a
minimum delay between resolved turns. This was recommended, because it makes
latency irrelevant to the outcome and so lets two controllers be compared on
genuinely equal footing. Rejected in favour of real-time, which preserves the
feel of an actual game.

**Hybrid** — turn-based for AI, real-time for humans. Rejected as two clock
models to reason about, for a benefit that the overlap mechanism in ADR-0006
delivers more cleanly.

**Fallback to a code controller on a miss** rather than continuing straight.
Rejected along with code controllers generally (ADR-0006).

## Consequences

- **Wall-clock timing becomes an input to the game.** The same seed and the
  same controller will not reproduce the same run, because latency varies. This
  is the price of real-time, and it is why the run record in ADR-0009 stores
  the actual move sequence rather than relying on the seed to replay it.
- A slow model would rarely get to drive at all under a naive implementation.
  The overlap mechanism in ADR-0006 exists specifically to make real-time
  viable for controllers slower than the tick.
- Continue-straight is a rare path rather than the common one, because overlap
  means a stored answer is almost always available. It fires on the first tick
  of a run, or when the stored answer has gone stale or illegal.
- Latency becomes a visible property of a controller rather than a hidden one,
  which suits the project's purpose: demonstrating that a larger model is not
  automatically a better one for a real-time task.
