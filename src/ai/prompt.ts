import { isImmediatelySafe, reachableSpace, translate } from "../game/engine.ts";
import type { Direction, GameState, GameView, Point } from "../game/types.ts";

/** How much precomputed analysis the prompt hands over (ADR-0008). */
export type AssistanceLevel = 0 | 1 | 2 | 3 | 4;
export type Representation = "coordinates" | "grid" | "both";

export type PromptFile = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type PromptSettings = {
  level: AssistanceLevel;
  representation: Representation;
  includeWhy: boolean;
};

export const DEFAULT_SETTINGS: PromptSettings = {
  level: 0,
  representation: "coordinates",
  includeWhy: true,
};

const point = (p: Point) => `(${p.col},${p.row})`;

/**
 * Coordinates, not a grid.
 *
 * Measured: a coordinate prompt took gemma4:e2b from 3/10 to 9/10 on
 * unambiguous positions, and showing both representations together was the
 * worst variant tested (ADR-0008). Body order is head to tail, without which
 * the no-reversal rule cannot be stated at all.
 */
function coordinates(view: GameView): string {
  return [
    `Grid: ${view.rules.width} wide by ${view.rules.height} tall.`,
    `Head: ${point(view.snake[0])}`,
    `Body, head to tail: ${view.snake.map(point).join(", ")}`,
    `Food: ${view.food.map(point).join(", ") || "none"}`,
    `Heading: ${view.heading}`,
  ].join("\n");
}

function grid(view: GameView): string {
  const { width, height } = view.rules;
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  for (const f of view.food) cells[f.row][f.col] = "*";
  view.snake.forEach((p, i) => (cells[p.row][p.col] = i === 0 ? "H" : "o"));
  return cells.map((row) => row.join("")).join("\n");
}

/** Levels 2 and 3 are real analysis, so they are opt-in, never the default. */
function assistance(state: GameState, view: GameView, level: AssistanceLevel): string[] {
  const lines: string[] = [];
  if (level >= 1) lines.push(`Legal moves: ${view.legalMoves.join(", ")}`);
  if (level >= 2) {
    const safe = view.legalMoves.filter((d) => isImmediatelySafe(state, d));
    lines.push(`Immediately safe: ${safe.join(", ") || "none"}`);
  }
  if (level >= 3) {
    const space = view.legalMoves.map((d) => `${d} ${reachableSpace(state, d)}`);
    lines.push(`Reachable open space: ${space.join(", ")}`);
  }
  if (level >= 4) {
    const best = planned(state, view);
    if (best) lines.push(`Recommended: ${best}`);
  }
  return lines;
}

/** Level 4's planner: largest escape route, food distance as the tie-break. */
export function planned(state: GameState, view: GameView): Direction | null {
  const scored = view.legalMoves
    .filter((d) => isImmediatelySafe(state, d))
    .map((d) => {
      const head = translate(view.snake[0], d);
      const distance = view.food.length
        ? Math.min(...view.food.map((f) => Math.abs(f.col - head.col) + Math.abs(f.row - head.row)))
        : 0;
      return { d, space: reachableSpace(state, d), distance };
    })
    .sort((a, b) => b.space - a.space || a.distance - b.distance);
  return scored[0]?.d ?? null;
}

export function renderBoard(state: GameState, view: GameView, settings: PromptSettings): string {
  const parts: string[] = [];
  if (settings.representation !== "grid") parts.push(coordinates(view));
  if (settings.representation !== "coordinates") parts.push(grid(view));
  parts.push(...assistance(state, view, settings.level));
  return parts.join("\n\n");
}

/**
 * The schema skeleton lives in the prompt file; only the genuinely computed
 * part is written here — the enum of legal moves, and whether `why` is asked
 * for at all (ADR-0008).
 */
export function buildSchema(
  file: PromptFile,
  legalMoves: readonly Direction[],
  includeWhy: boolean,
): Record<string, unknown> {
  const schema = structuredClone(file.schema);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  properties.direction = { ...properties.direction, enum: [...legalMoves] };
  if (!includeWhy) delete properties.why;
  return schema;
}

export function buildUser(
  file: PromptFile,
  state: GameState,
  view: GameView,
  settings: PromptSettings,
): string {
  return file.user.replace("{{board}}", renderBoard(state, view, settings));
}
