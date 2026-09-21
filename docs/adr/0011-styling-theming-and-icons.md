# ADR-0011: Styling, theming and icons

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The reference screenshot that inspired the layout has a distinctive hot-pink
-on-near-black palette. The layout itself — game left, decision panel right,
stat tiles under the board — is generic functional structure; the skin is not.

## Decision

**Tailwind 4.3.3, CSS-first.** Configuration lives in `@theme { }` in the
stylesheet; there is no `tailwind.config.js`. The stock palette is wiped with
`--color-*: initial;` so nobody can reach for `bg-blue-500` and bypass the
design system.

Utilities in templates. `<style scoped>` reserved for the board, where styling
is computed rather than chosen (ADR-0004).

**Palette — teal and coral**, in `oklch`, a different hue family from the
reference so the resemblance stops at the layout:

| | Dark | Light |
|---|---|---|
| Background | `#0F1216` | `#F6F7F9` |
| Panel | `#171B21` | `#FFFFFF` |
| Snake head -> tail | `#2DD4BF` -> `#0E7490` | `#0D9488` -> `#134E4A` |
| Food | `#FB7185` | `#E11D48` |
| AI accent | `#A78BFA` | `#7C3AED` |

Sentence-case labels; monospace reserved for numerals.

**Theme: three-state** (light / dark / system, default system) via VueUse
`useColorMode`, persisted, with `@custom-variant dark (&:where(.dark, .dark *));`
and a `.dark` class on `<html>`. A small inline script in `index.html` sets the
class **before first paint**.

**Icons: no plugin.**

```ts
const modules = import.meta.glob('../assets/icons/*.svg', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
```

rendered via `v-html` inside a wrapper `<span>`, with `fill="currentColor"` in
the assets and sizing on the wrapper. `IconName` is a hand-written union beside
the glob, with a dev-only assertion that it matches the folder contents.

## Alternatives considered

**`vite-svg-loader`** with `query: '?component'` — real components, attribute
fallthrough, no wrapper element. Verified working on this stack. Rejected
because it declares **no `vite` peer dependency at all** (so nothing would ever
warn about a breaking Vite), its only claim of Vite 8 support is a maintainer
comment from February that no release has implemented, and it has a known
typing collision with `vite/client`'s `*.svg -> string`. The two options differ
by one string in the glob call, so this remains a ten-minute change.

**`unplugin-icons`** — works, well maintained, but resolves *static* virtual
specifiers rather than runtime names, so it fights the `<Icon name="…" />` API.
Its upstream CI still pins Vite 7.

**`vite-plugin-svg-icons`** — verified broken on Vite 8: it imports `fast-glob`
without declaring it, and Vite 8 ships `tinyglobby`. Unpublished since 2022.
The maintained fork `vite-plugin-svg-icons-ng` does work, if sprites are ever
wanted.

**A generated `IconName` union** via an npm script. Correct at fifty icons;
overkill at a dozen, and a mechanical upgrade later.

**Two-state light/dark toggle.** Rejected: three-state costs nothing more and
"follow my OS" is the common preference.

**Matching the reference palette.** Rejected by intent.

## Consequences

- **`@reference` in a scoped block must point at our own stylesheet**, e.g.
  `@reference "./style.css"`, never the bare `"tailwindcss"` — the bare
  specifier pulls only the default theme, so every custom token fails the build
  with "unknown utility class". The Tailwind docs show both forms without
  flagging the difference.
- **A gitignored directory containing markup is skipped silently** — classes
  simply vanish with no warning. Such a directory needs an explicit
  `@source "../generated/**/*.vue"`.
- Scoped-block output carries a `[data-v-*]` attribute, raising specificity
  above bare utilities, so a scoped rule beats a utility on the same element.
- `v-html` is safe here because every SVG is authored in this repo. It must
  never be pointed at user-supplied content.
- Without the pre-paint script every reload flashes the wrong theme.
