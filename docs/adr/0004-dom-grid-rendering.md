# ADR-0004: DOM grid rendering

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The board must be drawn several times a second, and the decision panel will
want to annotate individual cells — highlighting candidate moves, showing
reachable space, or marking the cell a controller chose.

## Decision

Render the board as a **CSS grid of `<div>` cells**, one Vue element per cell.

The snake body **fades from head to tail**, so heading and length are readable
at a glance without animation.

## Alternatives considered

**`<canvas>`** — better raw performance and smooth interpolated movement.
Rejected: per-cell annotation and hit-testing become manual work, and the
playground's value lies in seeing *why* a move was chosen, which is mostly
per-cell overlay.

**Inline SVG** — a middle ground; no decisive advantage over DOM here.

## Consequences

- 144 cells updating a few times a second is negligible; this decision would
  need revisiting at a much larger board or a much faster tick.
- Cell state is inspectable in Vue devtools.
- Smooth, interpolated movement between cells is not available. Movement snaps
  cell to cell. Revisit only if that becomes a goal.
- The board is the one component where styling is computed rather than chosen,
  so it uses a scoped `<style>` block with custom properties rather than
  utility classes (ADR-0011).
