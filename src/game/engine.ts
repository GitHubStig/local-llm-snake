import {
  DELTA,
  DIRECTIONS,
  DEFAULT_RULES,
  OPPOSITE,
  type Board,
  type Direction,
  type GameState,
  type GameView,
  type Point,
  type Ruleset,
} from "./types.ts";
import { deriveStreams, nextInt } from "./prng.ts";

const samePoint = (a: Point, b: Point) => a.col === b.col && a.row === b.row;

const inBounds = (p: Point, rules: Ruleset) =>
  p.col >= 0 && p.col < rules.width && p.row >= 0 && p.row < rules.height;

export function hungerLimit(rules: Ruleset, length: number): number {
  return rules.hungerBase + length * rules.hungerPerSegment;
}

export function translate(p: Point, direction: Direction): Point {
  const d = DELTA[direction];
  return { col: p.col + d.col, row: p.row + d.row };
}

/**
 * The at-most-three non-reverse directions.
 *
 * Reversing is not a rule we chose — the neck never vacates its cell, so it is
 * fatal in every configuration (ADR-0003). At length 1 there is no neck, so
 * all four are legal.
 */
export function legalMoves(state: Board): Direction[] {
  if (state.snake.length < 2) return [...DIRECTIONS];
  return DIRECTIONS.filter((d) => d !== OPPOSITE[state.heading]);
}

/**
 * Cells a move cannot enter. The tail is excluded because it vacates on the
 * same tick — unless the snake is about to grow into it.
 */
function blocked(state: Board, willGrow: boolean): readonly Point[] {
  return willGrow ? state.snake : state.snake.slice(0, -1);
}

/** Opt-in analysis. The engine never calls this on a controller's behalf. */
export function isImmediatelySafe(state: Board, direction: Direction): boolean {
  const target = translate(state.snake[0], direction);
  if (!inBounds(target, state.rules)) return false;
  const willGrow = state.food.some((f) => samePoint(f, target));
  return !blocked(state, willGrow).some((s) => samePoint(s, target));
}

function placeFood(state: GameState): GameState {
  const taken = new Set(state.snake.map((p) => `${p.col},${p.row}`));
  for (const f of state.food) taken.add(`${f.col},${f.row}`);

  const free: Point[] = [];
  for (let row = 0; row < state.rules.height; row++) {
    for (let col = 0; col < state.rules.width; col++) {
      if (!taken.has(`${col},${row}`)) free.push({ col, row });
    }
  }
  if (free.length === 0) return state;

  const pick = nextInt(state.rng.food, free.length);
  return {
    ...state,
    food: [...state.food, free[pick.value]],
    rng: { ...state.rng, food: pick.cursor },
  };
}

/**
 * A fresh game. The snake always starts at the centre heading north with its
 * body trailing south — deliberately not seeded, so an AI has predictable
 * runway before the first decision matters (ADR-0002).
 */
export function createGame(seed: number, rules: Ruleset = DEFAULT_RULES): GameState {
  const col = Math.floor(rules.width / 2);
  const row = Math.floor(rules.height / 2);
  const snake = Array.from({ length: rules.startingLength }, (_, i) => ({ col, row: row + i }));

  let state: GameState = {
    rules,
    snake,
    food: [],
    heading: "north",
    tick: 0,
    ticksSinceFood: 0,
    foodEaten: 0,
    outcome: null,
    rng: deriveStreams(seed),
  };
  while (state.food.length < rules.foodCount) state = placeFood(state);
  return state;
}

/** Advance one tick. Pure: returns a new state, never mutates. */
export function step(state: GameState, direction: Direction): GameState {
  if (state.outcome !== null) return state;

  const move = legalMoves(state).includes(direction) ? direction : state.heading;
  const head = translate(state.snake[0], move);
  const tick = state.tick + 1;

  const eating = state.food.some((f) => samePoint(f, head));
  const hitWall = !inBounds(head, state.rules);
  const hitSelf = blocked(state, eating).some((s) => samePoint(s, head));

  if (hitWall || hitSelf) {
    return { ...state, heading: move, tick, outcome: "crashed" };
  }

  const grow = eating ? state.rules.growthPerFood : 0;
  const snake = [head, ...state.snake.slice(0, state.snake.length - 1 + grow)];

  let next: GameState = {
    ...state,
    snake,
    food: state.food.filter((f) => !samePoint(f, head)),
    heading: move,
    tick,
    ticksSinceFood: eating ? 0 : state.ticksSinceFood + 1,
    foodEaten: state.foodEaten + (eating ? 1 : 0),
  };

  if (snake.length >= state.rules.width * state.rules.height) {
    return { ...next, outcome: "won" };
  }
  if (next.ticksSinceFood >= hungerLimit(state.rules, snake.length)) {
    return { ...next, outcome: "starved" };
  }
  while (next.food.length < state.rules.foodCount) next = placeFood(next);
  return next;
}

/** The frozen snapshot a controller receives. Carries facts, not strategy. */
export function toView(state: GameState): GameView {
  return Object.freeze({
    rules: state.rules,
    snake: state.snake,
    food: state.food,
    heading: state.heading,
    tick: state.tick,
    ticksSinceFood: state.ticksSinceFood,
    legalMoves: legalMoves(state),
  });
}
