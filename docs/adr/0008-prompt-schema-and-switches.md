# ADR-0008: Prompt, schema and experiment switches

- **Status:** Accepted
- **Date:** 2026-09-21
- **Amended:** 2026-09-21, after the prompt-variation study. The representation
  default was reversed; see below.

## Context

How much the harness does for the model *is* the experiment. Fixing it silently
answers the question the project exists to ask. Measurements in
[findings.md](../findings.md) §1-3.

## Decision

Prompts and schemas live in editable JSON under `src/prompts/`, referenced from
`providers.json` per provider, with per-model overrides.

```jsonc
{
  "system": "You control a snake on a grid...\nNorth means DECREASING row index...",
  "user": "{{board}}",
  "schema": {
    "type": "object",
    "properties": {
      "direction": { "type": "string" },   // enum injected per turn by the engine
      "why":       { "type": "string" }
    },
    "required": ["direction"]
  },
  "options": { "temperature": 0, "num_predict": 48 }
}
```

`{{board}}` is the only template placeholder. The engine writes
`properties.direction.enum` each turn and removes `why` when that toggle is off.

### Three experiment switches, per run and recorded

| Switch | Values | Default |
|---|---|---|
| Assistance level | 0 board only · 1 + legal moves · 2 + immediate safety · 3 + reachable space · 4 + planner-selected candidate | **0** |
| Representation | **coordinates** · grid · both | **coordinates** |
| History | on · off | **off** |

### Representation: coordinates, not a grid, and never both

Originally defaulted to *both*. The study reversed it:

| Variant (10 cases) | `gemma4:e2b` | `llama3:latest` | `qwen3.8:27b-mlx` |
|---|---|---|---|
| ASCII grid | 3/10 | 2/10 | 9/10 |
| **Coordinates** | **9/10** | 2/10 | **9/10** |

Coordinates are best-or-tied-best for every model, fastest for the largest
(638ms against 1159ms), and cost the small models nothing.

**Showing both is actively harmful.** It is the worst variant measured and the
only one that degrades the strongest model, taking it from 5/5 to 2/5.

**Body segments must be listed ordered head-to-tail.** An ASCII grid carries no
segment ordering, so a coordinate summary built from an unordered set makes the
no-reversal rule unstatable. `GameView` already holds the snake head-first;
the prompt builder must preserve that and say so.

### Fixed prompt and request rules

- **`think: false` always.** Thinking is a per-request model feature returned in
  `message.thinking`, distinct from the `why` field in our schema. Both cost
  latency; both are off on the tick call.
- **`why` is a single call, toggleable, default on**, capped by
  `options.num_predict` rather than schema `maxLength`, which may not survive
  grammar conversion.
- **The `direction` enum is always the legal moves**, at every assistance level,
  so a reverse cannot be returned.
- **The prompt must not claim the offered directions are safe.** Our enum is
  *legal* moves, not *safe* ones, so at levels 0-1 it legitimately contains
  fatal directions. A benchmark harness that promised otherwise was making a
  false statement on 4 of 10 cases.
- **The axis convention is always stated explicitly.** Left unstated, a model
  guesses inconsistently between calls, and a systematic north/south inversion
  looks exactly like bad reasoning in the statistics.
- **Nothing varying may appear in `system`.** Prefix caching is a strict match
  from token 0.

## Alternatives considered

**Hardcoding the assistance level.** Rejected: that is the experiment.

**Level 4**, the reference implementation's shape, where a planner offers the
model exactly one candidate. Available as a level, not a default — it measures
whether a model will ratify a pathfinder, not whether it can play.

**Representation = both.** Adopted, then rejected on measurement. See above.

**Screen directions** (`up`/`right`/`down`/`left` instead of compass names).
Tested and rejected as useless: renaming `east` to `right` relocated the
directional attractor to `right` and changed scores by exactly zero. The
compass mapping was never the problem. Adopt only if it reads better in code.

**Axis labels on the grid.** Tested; no effect (2/5 to 2/5).

**A separate non-blocking explain call** so the tick could stay at
direction-only speed while the panel still got rich reasoning. Rejected in
favour of a single call with a toggle: simpler, and the explanation then always
corresponds exactly to the move made rather than to a position that has passed.

**An all-four-direction enum**, counting reverses as a distinct failure, so that
rule comprehension is tested too. A genuine fork; rejected to keep rule-recall
out of the error rate.

**Prompt keyed strictly per provider.** Refined to per-provider default with
per-model override.

**Building the prompt in code.** Rejected: the point of the file is that it can
be opened and read.

## Consequences

- **`think` defaults to ON and costs 83x** — 8282ms against 101ms on
  `gemma4:e2b`, where omitting the parameter is byte-for-byte identical to
  `think: true`. Sending `false` explicitly is not optional.
- **The `why` toggle is a three-way trade: speed, insight and accuracy.** It
  takes `gemma4:e2b` from 2/5 to 4/5 on the original cases — it functions as a
  miniature chain of thought, not merely a panel feature. Its cost is strongly
  model-specific: 2.04x on `llama3:latest`, 8.48x on `qwen3.8:27b-mlx`, 11.16x
  on `gemma4:e2b`. The 6.5x figure originally recorded here came from a model
  since excluded and is not representative.
- **Structured decoding guarantees shape, never correctness.** A measured
  example returned a valid, in-enum `south` where the stated coordinate system
  made `north` correct. A game-level validity check is required independently
  of schema validation.
- **Prefix caching is worth protecting, but does not currently apply.** The
  50-80x figures were measured on multi-thousand-token prefixes. Caching turns
  on somewhere between 314 and 614 tokens, and this project's request is ~367,
  so it gets no reuse — `cached 0/367` on every tick of a real game. The rule
  (nothing varying at the head) still costs nothing and starts paying the
  moment the prompt grows past ~512 tokens, which is a reason not to
  over-compress the system prompt.
- The switches turned an argument into a measurement once already. That is the
  argument for keeping them.
