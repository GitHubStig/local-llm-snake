# ADR-0008: Prompt, schema and experiment switches

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

How much the harness does for the model *is* the experiment. Fixing it silently
answers the question the project exists to ask.

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
| Representation | grid · coordinates · both | **both** |
| History | on · off | **off** |

### Fixed prompt and request rules

- **`think: false` always.** Chain-of-thought is a per-request model feature
  (returned in `message.thinking`) and is distinct from the `why` field in our
  schema. Both cost latency; both are off on the tick call.
- **`why` is a single call, toggleable, default on**, capped by
  `options.num_predict` rather than schema `maxLength`, which may not survive
  grammar conversion.
- **The `direction` enum is always the legal moves**, at every assistance
  level, so a reverse cannot be returned.
- **The axis convention is always stated explicitly.** Left unstated, a model
  guesses, and guesses inconsistently between calls. A systematic north/south
  inversion looks exactly like bad reasoning in the statistics but is not.
- **Nothing varying may appear in `system`.** Prefix caching is a strict match
  from token 0.

## Alternatives considered

**Hardcoding the assistance level.** Rejected: that is the experiment.

**Level 4**, the reference implementation's shape, where code computes safe
moves and a planner offers the model exactly one candidate. Available as a
level, not a default — it measures whether a model will ratify a pathfinder,
not whether it can play.

**A separate non-blocking explain call** so the tick could stay at
direction-only speed while the panel still got rich reasoning. Recommended and
rejected in favour of a single call with a toggle, which is simpler and has a
real advantage: the explanation always corresponds exactly to the move made,
rather than to a position that may already have passed.

**An all-four-direction enum**, counting reverses as a distinct failure, so
that rule comprehension is tested too. A genuine fork; rejected to keep
rule-recall out of the error rate.

**Prompt keyed strictly per provider.** Refined to per-provider default with
per-model override, since `llama3:latest` (8k context, no `tools` capability,
older instruction style) is unlike `gemma4:e2b` (131k).

**Building the prompt in code.** Rejected: the point of the file is that it can
be opened and read.

## Consequences

- The `why` toggle is a speed/insight dial, not a cosmetic one. Measured on the
  since-excluded hermes3, adding the field took a call from 124ms to 808ms.
  Turning it on visibly reduces model share, which is itself informative.
- Structured decoding guarantees **shape, never correctness**. A measured
  example returned a valid, in-enum `south` where the stated coordinate system
  made `north` correct. A game-level validity check is required independently
  of schema validation.
- Prefix caching is worth having: a 7,243-token shared prefix cut prompt
  evaluation from 8,763ms to 112ms, a 78x reduction. Prepending four tokens at
  the head collapsed it entirely. `fm serve` shows no such caching.
