# Open threads

Everything unresolved, in one place. Decisions live in the [ADRs](adr/README.md)
and measurements in [findings.md](findings.md); this is the list of what is
still to do or still to decide. When an item is done, delete it here and record
the outcome in the ADR it belongs to.

*Last checked against the code 2026-09-30.*

## Agreed, not yet built

| | What | Where it was decided | What is needed |
|---|---|---|---|
| 1 | **Shadow mode.** A toggle that keeps asking the model where it would go while you drive, so the panel can show when it disagrees with you. Off by default. | Agreed in the design interview; defined in the [glossary](glossary.md#shadow-mode) | Building. The runner holds one controller, so this needs a second request loop whose answers are shown but never applied. It should send the current board, not a projected one, since nothing acts on the answer. |
| 2 | **Latency as a spread, not one number** — "usually 400 ms, occasionally 3 s" matters more to real-time play than a median. | [ADR-0009](adr/0009-metrics-and-run-record.md) | Building. A compact typical / slow / worst line in the decision panel, from the latencies the runner already keeps. |

## Needs a decision

| | Question | Where it came from | Recommendation |
|---|---|---|---|
| 3 | **Build or remove the arcade speed-up** (`speedEscalation`). The flag is declared but nothing reads it. | [ADR-0003](adr/0003-rules-board-and-hunger.md) | Remove it. It is dead configuration that implies a feature, and 1000 ms has been set as the slowest tick. |
| 4 | **Should the game rules be adjustable in the UI?** Board size, starting length and the hunger limit are configurable in code only. | [ADR-0003](adr/0003-rules-board-and-hunger.md) | Open. A small settings panel, or leave them in code. |

## Deferred

| | What | Where | What would unblock it |
|---|---|---|---|
| 5 | **Per-option probabilities for chat models.** Decision models now give them ([ADR-0014](adr/0014-decision-models-via-systemone.md)); chat models still do not. Ollama documents a `logprobs` option that might. | [ADR-0012](adr/0012-single-prompt-matching-jev.md), alternatives | Checking that `logprobs` works with constrained decoding and gives usable per-option figures. Less pressing now that the fast model worth watching is a decision model. |
| 6 | **Saving runs to disk.** The run record is kept in memory, shaped so writing it out is simple. | [ADR-0009](adr/0009-metrics-and-run-record.md) | A reason to keep runs: comparing sessions, or the replay idea below. |
| 7 | **Continuous integration**, and with it a real claim of Deno and Bun support. | [ADR-0010](adr/0010-stack-pins-and-runtime.md) | A git remote. The repository has none. |

## Waiting on something outside the project

| | What | Where | Waiting on |
|---|---|---|---|
| 8 | **The JEV provider itself.** | [ADR-0012](adr/0012-single-prompt-matching-jev.md), [ADR-0014](adr/0014-decision-models-via-systemone.md) | Access to JEV's API. The decision controller already sends the SystemOne request shape, which JEV's reference implementation uses; that it matches JEV's API is not yet verified. |

## Ideas noted in passing

Not commitments; recorded so they are not lost.

- **Two boards side by side**, racing two controllers on the same seed. Needs
  the single global game session unpicked into a factory
  ([ADR-0005](adr/0005-engine-ui-boundary.md)).
- **A replay scrubber**, stepping back through a finished game from its run
  record ([ADR-0009](adr/0009-metrics-and-run-record.md)).
