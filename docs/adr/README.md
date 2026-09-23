# Architecture decision records

Decisions taken during the design of the snake AI playground, recorded before
any code was written. Each one states the alternatives that were actually
weighed, not just the outcome.

| # | Decision |
|---|---|
| [0001](0001-real-time-tick-with-deadline.md) | Real-time tick with a deadline |
| [0002](0002-determinism-and-seeding.md) | Determinism and seeding |
| [0003](0003-rules-board-and-hunger.md) | Rules, board and hunger |
| [0004](0004-dom-grid-rendering.md) | DOM grid rendering |
| [0005](0005-engine-ui-boundary.md) | Engine/UI boundary, and no Pinia |
| [0006](0006-controller-interface-and-overlap.md) | Controller interface and overlap |
| [0007](0007-provider-abstraction.md) | Provider abstraction and runtime discovery |
| [0008](0008-prompt-schema-and-switches.md) | ~~Prompt, schema and experiment switches~~ — superseded by 0012 |
| [0009](0009-metrics-and-run-record.md) | Metrics and the run record |
| [0010](0010-stack-pins-and-runtime.md) | Stack pins and runtime |
| [0011](0011-styling-theming-and-icons.md) | Styling, theming and icons |
| [0012](0012-single-prompt-matching-jev.md) | A single prompt matching JEV's inputs |
| [0013](0013-latency-compensation-by-projection.md) | Latency compensation by projecting the board — *proposed* |

See also the [glossary](../glossary.md) and the [measurements](../findings.md)
these decisions rest on.
