# ADR-0002: Determinism and seeding

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Comparing controllers requires that they face the same situations. Food
placement is random, so without seeding, two runs differ for reasons unrelated
to the controller.

## Decision

The PRNG state lives **inside the game state**, not in a module-level
singleton. `Math.random` is not used anywhere in `src/game/`.

The master seed derives **separate streams**:

1. Food placement sequence.
2. Controller tie-breaking (for any controller that makes arbitrary choices).

The starting position is **not** seeded: the snake always starts at the centre
of the board heading north, body trailing south. On a 12x12 board the head is
at (6,6) with the body at (6,7) and (6,8), giving six cells of runway.

Model sampling is made deterministic by **`temperature: 0`, not by a seed**.

## Alternatives considered

**A single shared PRNG stream.** Rejected: a controller drawing from the same
stream as food placement shifts every subsequent food position, so swapping
controllers would change the board and destroy the comparison.

**Randomised starting position.** Rejected on the grounds that a fixed start
gives an AI predictable time to orient itself before the first decision
matters.

**Seeding the model's sampling.** Measured and rejected as ineffective at our
settings: at `temperature: 0` decoding is greedy, so seed 42, seed 1234 and no
seed at all produce byte-identical output. The seed is genuinely wired up —
at `temperature: 1.0`, seed 7 repeats exactly while seed 999 diverges — so it
becomes relevant only if we later want varied-but-reproducible play at a
non-zero temperature.

## Consequences

- Changing the controller does not change where food appears.
- Total determinism is **not** achieved, because ADR-0001 admits wall-clock
  timing as an input. Seeding makes the *board* reproducible, not the run.
- Model determinism holds only for a fixed build, model and quantization. It
  is not guaranteed across an Ollama upgrade or under concurrent batching.
