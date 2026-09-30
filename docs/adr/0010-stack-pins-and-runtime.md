# ADR-0010: Stack pins and runtime

- **Status:** Accepted; amended 2026-09-30 (Node only, see the end)
- **Date:** 2026-09-21
- **Supersedes:** the Deno-primary decision originally recorded here.

## Context

Deno was chosen at the outset for consistency with another project, and later
partly for `deno desktop`. Desktop was rejected (ADR-0007), which prompted a
re-examination. Measurements are in [findings.md](../findings.md) §8.

## Decision

**Node is the primary and canonical runtime.** `package-lock.json` is the
committed lockfile; `deno.lock` and `bun.lock` are gitignored.

A single `package.json` holds every dependency and script. There is no
`deno.json` and no `bunfig.toml`.

Exact pins, no caret ranges: `vite` 8.3.0, `vue` 3.5.43, `@vitejs/plugin-vue`
6.0.9, `tailwindcss` 4.3.3, `@tailwindcss/vite` 4.3.3, `@vueuse/core` 15.0.0.

Quality gates, all on Node: `vue-tsc` for typechecking, `oxlint`, `prettier`.

### Portability without a support claim

*Withdrawn 2026-09-30: see the amendment at the end.*

The project's *shape* is portable, and Deno 2.9.7 and Bun 1.4.2 both run
install, build, dev, preview and tests today with byte-identical build output.
Every element of that shape is simply correct on any runtime:

- Dependencies and scripts in `package.json` (Deno reads its `scripts` as tasks)
- `node:test` for engine tests (ADR-0005)
- Path aliases in `vite.config.ts`, mirrored by `paths` in `tsconfig.json`
- Relative `import.meta.glob` patterns
- `tsconfig.json` with **no `baseUrl`**
- JSON imported as a module with `with { type: "json" }`, never read from disk
  in shared code. Deno's sandbox denies file reads by default, so a test that
  used `readFileSync` on the prompt files passed on Node and Bun and failed on
  Deno — silently, in a summary line that still looked green at a glance.

But **we do not claim tri-runtime support**, because nothing verifies it. When
CI exists, three jobs running install/build/test — about three seconds each,
explicitly excluding typecheck and format — would turn the claim into something
backed.

### TypeScript we cannot use

Node runs `.ts` by **stripping types only**, so any TypeScript that *emits*
code is rejected at load with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Banned
throughout:

- parameter properties — `constructor(private x: T) {}`
- `enum` (use `as const` objects or string unions)
- `namespace`
- legacy decorators

This is a project-wide constraint, not a test-only one, because the same
loader runs `src/`.

### Non-negotiable

**A `.gitignore` containing `dist` is a correctness requirement, not hygiene.**
Tailwind 4 scans source files as text and will scan a previous build's output:
without it, a second build harvested class names out of the old bundle and
produced 7.11 kB of CSS instead of 5.11 kB. Reproduced on every runtime.

## Alternatives considered

**Staying on Deno.** Rejected on one decisive fact: **Deno cannot typecheck
Vue SFCs, and fails silently doing it.** A real `TS2322` inside `App.vue`
returned rc=0 from `deno check` on the file importing it, while `vue-tsc` caught
it on Node and Bun. A hole in the safety net shaped like a pass is worse than
no gate. Secondary costs: Prettier and `deno fmt` disagree on 6 of 14 files and
cannot coexist, so supporting Deno properly means adding back a `deno.json`
purely to disable Deno's own tooling.

**Bun as primary.** Rejected as illusory: `bun run` honours the
`#!/usr/bin/env node` shebang on `node_modules/.bin/vite` and delegates to
Node. `bun --bun run` is needed to actually run under Bun, so adopting Bun does
not remove the Node dependency. It remains an excellent package manager and
test runner here.

**A genuine tri-runtime promise now.** Rejected until CI exists. Three
single-runtime breakages surfaced during investigation — `baseUrl` in tsconfig
(Deno only), a missing `@types/node` (Deno only), `oxlint --type-aware` (Bun and
Deno) — each costing a debugging cycle. Without CI on every change, the
non-primary runtimes break within weeks and nobody notices.

**Caret ranges.** Rejected: exact pins make native-addon failures reproducible.

**Vue 3.6 / Vapor mode.** Still `3.6.0-rc.9` with no confirmed GA date.

## Consequences

- Most of the Deno-specific workarounds recorded in the original version of
  this ADR are gone. `nodeModulesDir: "auto"` and `@deno/vite-plugin` were both
  artefacts of putting dependencies in `deno.json`; with `package.json` they do
  not arise.
- **One rule survives, with its attribution corrected.** Prefer *relative*
  `import.meta.glob` patterns. An aliased pattern whose alias is not registered
  in Vite fails **silently** — warning, exit code 0, and a literal
  `import.meta.glob(...)` left in the bundle that throws at runtime. This was
  originally recorded here as a Deno quirk. It is **Vite 8 behaviour on every
  runtime**, reproduced identically under Node. Moving to Node did not fix it;
  registering the alias does.
- `deno run --watch` being killed by `signal-exit` inside Rolldown
  (denoland/deno#35942) no longer affects us, but remains true for anyone
  running the project under Deno.
- Upgrades are deliberate events.

## Amendment, 2026-09-30: Node only

**Deno and Bun are no longer supported, and the project no longer tries to
stay portable to them.** Open thread 7 had proposed CI jobs for both, to back
up the portability described above. Re-measured from a clean copy of the
repository, neither passed as cleanly as [findings.md](../findings.md) §15
recorded:

- **Deno cannot install from the committed lockfile.** `deno install` seeds a
  `deno.lock` from `package-lock.json`, and Deno 2.9.7 rejects it as corrupt.
  The cause is a bundled dependency (`@tybys/wasm-util`) inside Tailwind's
  optional `@tailwindcss/oxide-wasm32-wasi` package. With `--no-lock` it
  installs, builds and passes the tests.
- **Bun fails the typecheck when it actually runs it.** Under
  `bun --bun run typecheck`, `vue-tsc` cannot resolve `./ui/App.vue`. Plain
  `bun run typecheck` passes only because it hands the job to Node.

Keeping two more runtimes working would mean workarounds in the project and
extra CI jobs, all to support runtimes nobody uses to run it. So Node is the
only runtime:

- `deno.lock` and `bun.lock` are no longer gitignored, and the README no longer
  says the project runs on Deno and Bun.
- The portability rules above are no longer requirements. Importing JSON as a
  module and leaving `baseUrl` out of `tsconfig.json` still work on Node, so the
  code that follows them stays as it is.
- CI, when it is built, runs the four checks on Node only.
