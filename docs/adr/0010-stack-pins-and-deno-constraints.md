# ADR-0010: Stack pins and Deno/Vite constraints

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Deno 2.9.7 with Vite 8.3.0 is a combination whose failure modes concentrate in
the native Rolldown/Oxc addon and in module resolution. Every pin below was
verified by building a real project on this machine, not inferred from version
ranges.

## Decision

Exact pins, no caret ranges:

| Package | Version |
|---|---|
| `vite` | 8.3.0 |
| `vue` | 3.5.43 |
| `@vitejs/plugin-vue` | 6.0.9 |
| `tailwindcss` | 4.3.3 |
| `@tailwindcss/vite` | 4.3.3 |
| `@vueuse/core` | 15.0.0 |

**Four rules that are load-bearing:**

1. **`"nodeModulesDir": "auto"` in `deno.json` is mandatory.** Without it the
   build fails with `Could not find referrer npm package`. Verified with a
   control containing no Tailwind: this is a Vite 8 + Deno global-cache
   incompatibility, not a plugin problem.
2. **Do not install `@deno/vite-plugin`.** It breaks `@vitejs/plugin-vue`:
   `Unsupported scheme "plugin-vue" for module "plugin-vue:export-helper"`,
   reproduced with just those two plugins and nothing else. It is also
   unnecessary once rule 1 is in place.
3. **Aliases go in `vite.config.ts`, not `deno.json` imports.** Rolldown's
   native Rust resolver does its own filesystem resolution and bypasses Deno's
   module resolution entirely — confirmed by a Deno maintainer as not fixable
   on Deno's side, with `resolve.alias` named as the sanctioned workaround.
   Glob patterns must be relative (`./...`); an aliased glob pattern fails
   **silently**, reporting a successful build and returning an empty object.
4. **Never wrap the dev server in `deno run --watch`.** `signal-exit`, bundled
   inside Rolldown, kills the watcher process (denoland/deno#35942, open,
   reported as affecting every Vite 8 dev server). Use Vite's own HMR.

## Alternatives considered

**Caret ranges.** Rejected: the failure modes here are native-addon bugs, and
exact pins make them reproducible.

**`@deno/vite-plugin`.** Recommended twice during design on the strength of
being the only package declaring `vite: 8.x`, then withdrawn when the conflict
with `@vitejs/plugin-vue` was reproduced.

**Vue 3.6 / Vapor mode.** Still at `3.6.0-rc.9` with no confirmed GA date.

**Dropping VueUse**, since no primary source asserts Deno compatibility and it
is not published to JSR. Kept, but confined to the UI layer — `src/game/`
imports nothing, so engine tests need no npm resolution at all. Note v15
dropped Node 20 and flipped `useThrottleFn`'s `trailing` default to `true`.

## Consequences

- One known Rolldown issue (tailwindlabs #20501, a plugin-context memory
  retainer) is explicitly invisible in one-shot SPA builds.
- `esbuild` is now an optional dependency in Vite 8, and `transformWithEsbuild`
  is deprecated in favour of `transformWithOxc`. Native decorators are not
  lowered by Oxc yet. Neither affects this project.
- Upgrades are deliberate events, not incidental ones.
