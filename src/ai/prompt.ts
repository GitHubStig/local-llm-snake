import type { MoveFacts } from "../game/analysis.ts";
import type { Direction, GameView, Point } from "../game/types.ts";

/**
 * One prompt, matching the information JEV is given (ADR-0008): the board
 * with a legend, a few facts about the snake, and exact facts about every
 * safe move. Code does the analysis; the model chooses between described
 * options.
 */
export type PromptFile = {
  /** Must be static: it is the cacheable prefix. No placeholders. */
  system: string;
  /** A template. `{{name}}` is replaced from `promptValues`. */
  user: string;
  schema: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type PromptSettings = {
  includeWhy: boolean;
};

export const DEFAULT_SETTINGS: PromptSettings = { includeWhy: true };

/** Named, so there is no (x,y) order to get backwards. */
const at = (p: Point) => `row ${p.row}, column ${p.col}`;

/** H head, o body, T tail, F food, . empty — the legend is in the system prompt. */
export function renderGrid(view: GameView): string {
  const { width, height } = view.rules;
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  for (const f of view.food) cells[f.row][f.col] = "F";
  const last = view.snake.length - 1;
  view.snake.forEach((p, i) => {
    cells[p.row][p.col] = i === 0 ? "H" : i === last ? "T" : "o";
  });
  return cells.map((row) => row.join("")).join("\n");
}

/** One self-contained line per option, so there is nothing to cross-reference. */
export function describeOption(f: MoveFacts): string {
  const parts = [
    `the head moves to ${at(f.target)}`,
    f.eats
      ? "this move EATS THE FOOD"
      : f.foodDistance === null
        ? "there is no food on the board"
        : `the food is ${f.foodDistance} steps away after this move`,
    `${f.reachable} of ${f.freeTotal} empty cells stay reachable`,
  ];
  if (f.deadEnd) {
    parts.push("DEAD END: less room than the snake is long, and no way to follow the tail out");
  } else if (f.canReachTail) {
    parts.push("the tail can still be followed out");
  }
  return `- ${f.direction} (${f.turn}): ${parts.join("; ")}`;
}

/** Every value the template may use. */
export function promptValues(view: GameView, facts: readonly MoveFacts[]): Record<string, string> {
  const food = view.food[0];
  return {
    board: renderGrid(view),
    head: at(view.snake[0]),
    food: food ? at(food) : "none",
    heading: view.heading,
    length: String(view.snake.length),
    gridSize: `${view.rules.height} rows by ${view.rules.width} columns`,
    foodAdjacent: facts.some((f) => f.eats) ? "yes" : "no",
    options: facts.map(describeOption).join("\n"),
  };
}

/** Fill the user template. An unknown placeholder is a typo, so it throws. */
export function buildUser(file: PromptFile, view: GameView, facts: readonly MoveFacts[]): string {
  const values = promptValues(view, facts);
  return file.user.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`unknown placeholder {{${name}}} in prompt`);
    return values[name];
  });
}

/**
 * The schema skeleton lives in the prompt file; the enum is written here from
 * the safe moves, so the model can only name an option it was offered.
 *
 * `why` stays after `direction`: at temperature 0 the direction is then
 * decoded from the same prefix as with `why` off, so asking for an explanation
 * cannot change the move (findings.md §12).
 */
export function buildSchema(
  file: PromptFile,
  options: readonly Direction[],
  includeWhy: boolean,
): Record<string, unknown> {
  const schema = structuredClone(file.schema);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  properties.direction = { ...properties.direction, enum: [...options] };

  // Left optional, the model skipped it under constrained decoding.
  const required = new Set((schema.required as string[] | undefined) ?? []);
  if (includeWhy && "why" in properties) required.add("why");
  else {
    delete properties.why;
    required.delete("why");
  }
  schema.required = [...required];
  return schema;
}
