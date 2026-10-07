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
| 5 | **Let vision-capable decision models see the board as an image.** Clef and Clef Flash accept an `images` field through Ollama ([findings](findings.md) §18), and OpenAI's newly announced [Decisions API](https://developers.openai.com/api/docs/guides/decisions) takes `input_image` parts as base64 data URLs (its docs list `gpt-6-luna` as the only model; not yet tried here). A picture of the board may be read more reliably than the text grid. | [ADR-0012](adr/0012-single-prompt-matching-jev.md), [ADR-0014](adr/0014-decision-models-via-systemone.md) | Open. Sending an image gives the model information JEV does not get, so it needs a recorded exception to ADR-0012 or an opt-in prompt file outside the JEV comparison. If built: draw the image in code from the `GameView` being decided, not a screenshot, which would show the unprojected board and is unavailable to the Node scripts. A fixed palette, about 32 px cells, a thick border for the wall, joined body segments (which show the body order the text grid cannot), and a head pointing along the heading. Encode it as an indexed PNG with `CompressionStream`, which both browsers and Node provide, so no dependency is needed. The option facts and `instructions` stay text; only the board and `legend` change. Compare text only, image plus text, and image only with `eval-prompt.ts` on `clef-flash`, then check with `realtime.ts` that the image's added latency still fits the tick. |

## Deferred

| | What | Where | What would unblock it |
|---|---|---|---|
| 6 | **Per-option probabilities for chat models.** Decision models now give them ([ADR-0014](adr/0014-decision-models-via-systemone.md)); chat models still do not. Ollama documents a `logprobs` option that might. | [ADR-0012](adr/0012-single-prompt-matching-jev.md), alternatives | Checking that `logprobs` works with constrained decoding and gives usable per-option figures. Less pressing now that the fast model worth watching is a decision model. |
| 7 | **Saving runs to disk.** The run record is kept in memory, shaped so writing it out is simple. | [ADR-0009](adr/0009-metrics-and-run-record.md) | A reason to keep runs: comparing sessions, or the replay idea below. |
| 8 | **Continuous integration.** | [ADR-0010](adr/0010-stack-pins-and-runtime.md) | Nothing now: the repository has a GitHub remote. What remains is a workflow running the four checks on Node, the only supported runtime. There is no `.github/` yet. |

## Waiting on something outside the project

| | What | Where | Waiting on |
|---|---|---|---|
| 9 | **The JEV provider itself.** | [ADR-0012](adr/0012-single-prompt-matching-jev.md), [ADR-0014](adr/0014-decision-models-via-systemone.md) | Access to JEV's API. The decision controller already sends the SystemOne request shape, which JEV's reference implementation uses; that it matches JEV's API is not yet verified. |

## Ideas noted in passing

Not commitments; recorded so they are not lost.

- **Two boards side by side**, racing two controllers on the same seed. Needs
  the single global game session unpicked into a factory
  ([ADR-0005](adr/0005-engine-ui-boundary.md)).
- **A replay scrubber**, stepping back through a finished game from its run
  record ([ADR-0009](adr/0009-metrics-and-run-record.md)).
