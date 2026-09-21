# ADR-0005: Engine/UI boundary, and no Pinia

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The trustworthiness of every controller comparison rests on the game rules
being correct and testable in isolation.

## Decision

`src/game/` imports **nothing** — no Vue, no VueUse, no `fetch`. It contains
types, the PRNG, the ruleset, `step()`, `legalMoves()`, and opt-in analysis
helpers. It is exercised by `deno test` with no DOM and no npm resolution at
all.

The model controller lives in `src/ai/` precisely because it does I/O, which
would otherwise contaminate that property.

Shared UI state uses VueUse's `createGlobalState`. **Pinia is not used.**

## Alternatives considered

**Pinia.** Its genuine benefits are devtools time-travel, SSR state
serialisation, HMR-safe store replacement, and a convention that scales to many
stores. Three are irrelevant here — no SSR, one store — and the fourth is
redundant: the run record (ADR-0009) gives better time-travel than the devtools
would, because it can replay into any tick from the game's own data.

**A `createGameSession()` factory behind `provide`/`inject`** instead of
`createGlobalState`. Equivalent effort, and it has no singleton ceiling.
Rejected for the smaller code, with one constraint accepted: running two boards
side by side to race two controllers would require unpicking the singleton.

## Consequences

- Engine tests are fast and have no npm dependency surface.
- Component tests are not written. The UI will churn; the engine will not.
- The day a side-by-side comparison view is wanted, `createGlobalState` is the
  thing that has to change.
