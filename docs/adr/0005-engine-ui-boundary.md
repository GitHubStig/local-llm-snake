# ADR-0005: Engine/UI boundary, and no Pinia

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The trustworthiness of every controller comparison rests on the game rules
being correct and testable in isolation.

## Decision

`src/game/` imports **nothing** — no Vue, no VueUse, no `fetch`. It contains
types, the PRNG, the ruleset, `step()`, `legalMoves()`, and opt-in analysis
helpers. It is exercised by **`node:test` + `node:assert/strict`** with no DOM and no
test-runner dependency — which also runs unmodified under Deno and Bun, with
identical failures, messages and exit codes. (Deno and Bun are no longer
supported, as of 2026-09-30: see ADR-0010.)

The model controller lives in `src/ai/` precisely because it does I/O, which
would otherwise contaminate that property.

Shared UI state uses VueUse's `createGlobalState`. **Pinia is not used.**

Two constraints that come with `node:test`:

- **Every test file is named `*.test.ts`.** Node and Deno ignore `*.spec.ts`;
  only Bun discovers it.
- **Two test runners must never share a discovery glob.** With a stray
  Vitest-style file present, Node reported it as a *passing* test while no
  assertion ever ran.

## Amendment, 2026-09-21: headless screenshots

"Engine tests only" still holds for *tests*. But this session had no browser
tooling, so UI work was verified by compiling and grepping the built CSS —
which proved the rules emitted and said nothing about whether the page looked
right. It missed a real bug: `aspect-ratio` with a definite height let a
`max-width` cap stretch the board vertically.

`playwright` is therefore a devDependency, driving `scripts/shoot.ts` — not a
test, a screenshot tool. It also reports the board's measured geometry, which
turns "does it look square" into a number.

Deliberately the `playwright` library rather than `@playwright/test`: a second
test runner would risk exactly the shared-discovery-glob trap below. If a UI
smoke test is ever wanted, it goes in a `node:test` file that drives Playwright
as a library.

## Alternatives considered

**Vitest.** Works under all three runtimes and does not need the Vite config
for a pure module, but costs ~35 npm packages and is 4-25x slower to start.
Reserved for the day we need DOM, mocking or coverage.

**Runtime-native test APIs** (`Deno.test`, `bun:test`). Not portable, though
they at least fail loudly at module load rather than silently skipping.

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
