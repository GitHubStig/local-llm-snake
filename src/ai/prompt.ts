import { isImmediatelySafe, reachableSpace, translate } from "../game/engine.ts";
import type { Direction, GameState, GameView, Point } from "../game/types.ts";

/** How much precomputed analysis the prompt hands over (ADR-0008). */
export type AssistanceLevel = 0 | 1 | 2 | 3 | 4;
export type Representation = "coordinates" | "grid" | "both";

export type PromptFile = {
  level?: AssistanceLevel;
  /** Must be static: it is the cacheable prefix (ADR-0008). No placeholders. */
  system: string;
  /** A template. `{{name}}` is replaced from `promptValues`. */
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
 * Where the food lies relative to the head, in the direction words the model
 * must answer with. It restates the coordinates rather than judging any move:
 * it says nothing about which directions are safe.
 */
function offset(head: Point, food: Point): string {
  const dx = food.col - head.col;
  const dy = food.row - head.row;
  const parts: string[] = [];
  if (dx) parts.push(`${Math.abs(dx)} ${dx > 0 ? "east" : "west"}`);
  if (dy) parts.push(`${Math.abs(dy)} ${dy > 0 ? "south" : "north"}`);
  return parts.join(" and ") || "on the head";
}

/**
 * Coordinates, not a grid (ADR-0008). There is deliberately no "Heading:"
 * line: the model echoed it, dying on tick 7 on every seed by driving north
 * into the wall whatever the board said. The heading is still implied by the
 * body order.
 */
function coordinates(view: GameView): string {
  return [
    `Grid: ${view.rules.width} wide by ${view.rules.height} tall.`,
    `Head: ${point(view.snake[0])}`,
    `Body, head to tail: ${view.snake.map(point).join(", ")}`,
    `Food: ${view.food.map(point).join(", ") || "none"}`,
  ].join("\n");
}

/**
 * The board as rows of characters. It carries its own legend and orientation:
 * the level prompts describe a coordinate list, so a bare grid would leave the
 * model guessing what H, o and * mean and which way is north.
 */
function grid(view: GameView): string {
  const { width, height } = view.rules;
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  for (const f of view.food) cells[f.row][f.col] = "*";
  view.snake.forEach((p, i) => (cells[p.row][p.col] = i === 0 ? "H" : "o"));
  return [
    `Board, ${width} wide by ${height} tall. Row 0 is the top (north); column 0 is the left (west).`,
    "H = your head, o = your body, * = food, . = empty.",
    ...cells.map((row) => row.join("")),
  ].join("\n");
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

/** The board, in whichever representation the run uses. */
export function renderBoard(view: GameView, representation: Representation): string {
  const parts: string[] = [];
  if (representation !== "grid") parts.push(coordinates(view));
  if (representation !== "coordinates") parts.push(grid(view));
  return parts.join("\n\n");
}

/**
 * Every value a template may use. All are computed each tick, but only those
 * a level's template names are ever sent — which placeholders appear is what
 * distinguishes one level from another.
 *
 * The food offset restates coordinates in the words the model must answer
 * with, and says nothing about which moves are safe. It took level 0 from
 * 2 food across five games to 23 (findings.md §11).
 */
export function promptValues(
  state: GameState,
  view: GameView,
  settings: PromptSettings,
): Record<string, string> {
  const head = view.snake[0];
  const safe = view.legalMoves.filter((d) => isImmediatelySafe(state, d));
  return {
    board: renderBoard(view, settings.representation),
    foodOffset:
      view.food
        .map((f) => `The food at ${point(f)} is ${offset(head, f)} of the head.`)
        .join("\n") || "There is no food on the board.",
    legalMoves: view.legalMoves.join(", "),
    safeMoves: safe.join(", ") || "none, every move is fatal",
    space: safe.map((d) => `${d} ${reachableSpace(state, d)}`).join(", ") || "none",
    length: String(view.snake.length),
    recommended: planned(state, view) ?? "none",
  };
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

  // An optional field is one the model is free to skip, and under constrained
  // decoding it usually does — so "ask why" has to mean *require* why.
  const required = new Set((schema.required as string[] | undefined) ?? []);
  if (includeWhy && "why" in properties) required.add("why");
  else {
    delete properties.why;
    required.delete("why");
  }
  schema.required = [...required];
  return schema;
}

/** Fill a level's user template. An unknown placeholder is a typo, so it throws. */
export function buildUser(
  file: PromptFile,
  state: GameState,
  view: GameView,
  settings: PromptSettings,
): string {
  const values = promptValues(state, view, settings);
  return file.user.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`unknown placeholder {{${name}}} in prompt`);
    return values[name];
  });
}
