# ADR-0009: Metrics and the run record

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Real-time ticking means the seed no longer reproduces a run (ADR-0001), and
there is no code-controller baseline (ADR-0006). Measurement has to carry more
weight as a result.

## Decision

### Metrics

Food eaten (**primary**), steps survived, steps per food, and share of moves
the model actually decided. All four displayed. **No composite score** — a
single number would hide the trade-off the project exists to observe.

Latency is shown as a **distribution, not a median**: "usually 400ms,
occasionally 3s" is a completely different proposition for a real-time loop
than a steady 800ms.

### Typed failures

Counted separately rather than folded into one model-share figure:

- **timed out** — no answer before the deadline
- **arrived stale** — answer described a board several ticks old
- **illegal on arrival** — legal when asked, a reverse by the time it landed
- **game-invalid** — schema-valid, in-enum, and still suicidal

### Live state

While a request is outstanding the panel shows it: *waiting on
`qwen3.8:27b`, 3.2s elapsed, 4 ticks missed*.

`load_duration` is displayed **separately from inference time**.

### Run record

Held in memory: seed, ruleset, switch settings, and per tick the direction, who
decided it, and the latency. Shaped so writing it to disk later is trivial.

## Alternatives considered

**Relying on the seed for replay.** Not possible under ADR-0001.

**Summary stats only, or nothing persisted.** Rejected: the record is what
makes a death inspectable and is the basis for a future replay scrubber.

**A single composite score.** Rejected as above.

**One model-share number instead of typed failures.** Rejected: with large
models in the roster, *why* a model failed to drive is the interesting datum.

## Consequences

- A slow model that never answers would otherwise be indistinguishable from a
  broken application — the snake simply runs straight into a wall. The live
  in-flight state is what makes the demonstration legible.
- Ollama holds one model resident at a time, so switching models forces an
  unload and reload. Without splitting out `load_duration`, a cold load would
  be attributed to the model and produce exactly the wrong conclusion.
- The game-invalid bucket will be populated. That is the point.
