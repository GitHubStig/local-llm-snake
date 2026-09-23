# ADR-0013: Latency compensation by projecting the board

- **Status:** Proposed
- **Date:** 2026-09-22

## Context

A model answers about the board it was sent, and the snake keeps moving while
it thinks. Today the runner judges an answer by its age alone: up to two ticks
old is applied, anything older is discarded and the snake carries straight on.
That fails in both directions:

- **An answer can be young and wrong.** Sent three cells from a wall, a model
  rightly says "straight". Two ticks later the snake is one cell from the wall
  and the answer is still within the age limit, so it is applied. The runner
  never checks that the move is still safe.
- **An answer can be old and useless.** A slow model's answers routinely arrive
  more than two ticks late at the faster speeds, so they are discarded, and the
  model barely drives at all. Its latency, not its judgement, decides the game.

The keyboard does not have this problem, because a keypress is made in response
to the board on screen (`live` controllers, fixed 2026-09-22).

Two properties of the existing design make a better answer possible:

1. **The path while waiting is known.** The runner opens a request only when no
   other answer is waiting to be used (ADR-0006). From that moment until the
   answer lands, every tick falls through to continue-straight.
2. **The future board is exact.** The engine is pure and the random generator
   lives inside the game state (ADR-0002), so stepping the state forward gives
   precisely the board that will exist — including where new food spawns if
   the snake eats along the way.

## Proposal

**Send the model the board as it will be when its answer takes effect, not the
board as it is now.** Code does the projecting, exactly. The model is not told
its latency or the game speed: asking it to simulate the snake forward is the
kind of board arithmetic these models have failed at every time we measured.

### The horizon

A request opened just after tick *N* whose answer takes *L* ms is consumed at
the first tick after it arrives, tick *N* + ⌈*L* / *T*⌉ for a tick interval *T*.
The move it decides is applied from the state one tick earlier. So the board to
send is the current one advanced

  *k* = max(0, ⌈*L* / *T*⌉ − 1) ticks, straight.

Worked through at Normal speed (*T* = 400 ms):

| expected latency *L* | answer consumed at | board sent (*k*) |
|---|---|---|
| 300 ms | tick *N*+1 | current (*k* = 0) |
| 700 ms | tick *N*+2 | one tick ahead |
| 1100 ms | tick *N*+3 | two ticks ahead |

*L* is not known in advance, so it is estimated from that model's measured
latencies, which are already recorded and persisted (ADR-0007). With no
samples yet, *k* = 0 — today's behaviour — until the first answers calibrate it.

### Which estimate: err late

The estimate will be wrong in both directions, and the two errors are not
equally costly:

- **Answer arrives earlier than projected** — hold it until the tick it was
  meant for. Harmless: the snake goes straight in the meantime, exactly as the
  projection assumed. The cost is only that the model reacts a tick later than
  it could have.
- **Answer arrives later than projected** — the board has moved past the one it
  describes. This is the harmful case.

So the estimate should lean high: a high percentile of measured latency, not
the median.

### When going straight is fatal

If the snake would die going straight before the answer can land, the projected
board has it already dead. Project only as far as the snake survives. If the
answer still arrives too late to save it, record the death as its own kind —
**dead before the answer arrived** — distinct from a bad decision. That is the
cleanest measurement this project could have of latency, rather than judgement,
losing a game.

### On arrival

1. Compare the current tick with the answer's **target tick**, not the tick it
   was asked on.
2. **Early:** hold it; apply at the target tick.
3. **On time or late within the cap:** re-check the move against the *current*
   board. Apply it only if it is still safe. This check is worth having even
   without projection, since today a young answer that has become fatal is
   applied.
4. **Late beyond the cap, or no longer safe:** discard it, as now.

### Where it lives

The runner owns the clock (ADR-0006), so projection belongs there: it computes
*k*, steps the state forward and passes the projected view to `decide`. The
`Controller` interface gains an optional latency estimate; live controllers
report none and are never projected.

One consequence for the model controller: it currently analyses the *live*
state through `getState()`, because a `GameView` was meant to carry facts but
no analysis. Under projection it must analyse the view it was handed, since
that is the board the decision is about. The analysis only needs the rules,
the snake, the food and the heading, which a view already carries, so
`getState()` can go.

### What stays fair against JEV

JEV's reference asks at the start of each tick about the current board and
plays whatever has arrived when the tick ends. Projection changes that timing,
but it is a runner feature applied to every non-live controller, JEV included,
so the comparison stays like for like. The information each model receives is
unchanged; only which board it describes moves.

## Measuring it

- **Projection error:** the distribution of arrival tick minus target tick per
  model. Centred slightly below zero means the estimate is calibrated and
  leaning safe; a long tail above zero means it is too optimistic.
- **Dead before the answer arrived**, as its own count.
- **Controller share with projection on and off**, per model and speed. The
  claim to test is that a slow model's share rises at the faster speeds.

The projection, the horizon arithmetic, target-tick bookkeeping, holding early
answers and the dead-before-arrival case are all pure logic, testable with the
fake clock and a controllable controller — no model needed.

## Open questions

1. **Which percentile?** Leaning high is agreed above; the 75th is a reasonable
   start, but it is a tuning question best answered by the projection-error
   measurement.
2. **Should the model be told the board is projected?** Proposed: no. From the
   model's side it is simply the board its move applies to, and an extra line
   is one more thing to misread. The decision panel should say so plainly, with
   the horizon, so a human watching is not confused.
3. **When a late answer is no longer safe, what then?** Continue-straight is
   today's fallback, but it may be fatal too. The alternative is for code to
   pick a safe move, recorded as forced — more survival, less of a clean
   measurement.
4. **On by default, or a toggle?** A toggle makes the before-and-after
   measurable from the UI; default on is the better game.
