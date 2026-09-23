# ADR-0013: Latency compensation by projecting the board

- **Status:** Accepted
- **Date:** 2026-09-22
- **Accepted:** 2026-09-23, with the decisions below

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

## Decision

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

*L* is not known in advance, so the runner estimates it from the latencies it
has itself measured for the current controller, over its last 25 answers. A
new controller starts with none, so its first requests use *k* = 0 until its
own answers calibrate the estimate. A new *game* with the same controller
inherits the previous game's latencies, so only the first game of a session
starts unprojected. (The dropdown's persisted latencies,
ADR-0007, were considered as a warm start and not used: they include moves
played with different settings, such as with `why` on.)

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

Answers are judged against their **target tick** — the tick whose board they
were chosen for — and **there is no age limit**. The old two-tick staleness
cap is removed: age was only ever a stand-in for "is this move still safe?",
which can be checked directly.

| answer arrives | what happens |
|---|---|
| early | held, and applied at its target tick |
| on time | applied |
| late, still safe | applied, however late |
| late, now unsafe | discarded; the snake goes straight |
| a reverse, at any time | discarded as illegal |

On time, the board is exactly the one the answer was chosen for, so a fatal
choice is the model's own and is still counted as *legal but fatal*. Only a late
answer is re-checked, because only then has the board moved on.

**Why early answers are held rather than applied at once:** a projected answer
is about a board that does not exist yet. Applied early, it turns the snake
from the wrong cell — into a cell nobody checked, since every fact in the
prompt describes the projected position. Holding costs nothing: the snake goes
straight meanwhile, exactly as the projection assumed. The way to react sooner
is a shorter horizon, which the rolling latency estimate provides as a model
gets faster.

**Adapting to latency is automatic.** The horizon is recomputed for every
request from the controller's last 25 measured latencies, so a faster model or
faster hardware shortens it within a few moves, with nothing to recalibrate.

### Where it lives

The runner owns the clock (ADR-0006), so projection belongs there. It measures
each answer's latency itself, computes *k*, steps the state forward and passes
the projected view to `decide`. The `Controller` interface is unchanged: the
existing `live` flag marks controllers that are never projected.

The model controller now analyses the view it was handed rather than reading
the live state through a `getState()` callback, since under projection the two
differ and the view is the board the decision is about. The analysis functions
accept any `Board` — rules, snake, food and heading — which both a view and a
full game state satisfy.

### What stays fair against JEV

JEV's reference asks at the start of each tick about the current board and
plays whatever has arrived when the tick ends. Projection changes that timing,
but it is a runner feature applied to every non-live controller, JEV included,
so the comparison stays like for like. The information each model receives is
unchanged; only which board it describes moves.

## Result

*Measured 2026-09-23* ([findings.md](../findings.md) §14). The mechanism works
— timeouts fell from 108 to 15 and 76% of answers landed exactly on their
tick — but survival did not improve. A model answering in 1.1 s at 400 ms a
tick gets one decision roughly every three ticks, and projection makes each
decision correct without making them more frequent. Share at first appeared to
*fall*, because ticks spent holding a planned answer were counted as misses;
once they were given their own category and share was measured over due
decisions only, it rose — from 46% to 92% for qwen3.8:27b at Slow — which is
also where survival clearly improved.

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

## Decisions on the questions this ADR left open

1. **Estimate:** the 75th percentile of the last 25 measured latencies. Forced
   answers are excluded, since they are instant, and so are keypresses.
2. **The model is not told** its board is projected. The decision panel shows
   how far ahead each move was planned, and whether it arrived on time.
3. **A late answer that is no longer safe** is discarded and the snake goes
   straight. Letting code pick a safe move instead was rejected: it would keep
   more snakes alive but blur what the model actually did.
4. **A toggle**, on by default: *Plan ahead for the model's latency*.

The keyboard is never projected: a keypress answers the board on screen.
