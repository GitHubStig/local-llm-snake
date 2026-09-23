import { isImmediatelySafe, legalMoves, translate } from "./engine.ts";
import { DIRECTIONS, OPPOSITE, type Board, type Direction, type Point } from "./types.ts";

/**
 * Exact facts about each candidate move, computed by code so the model
 * chooses between described options instead of working them out (ADR-0008).
 * The set of facts matches what JEV is given, so local models and JEV can be
 * compared on equal information.
 */
export type Turn = "straight" | "left turn" | "right turn" | "turn around";

export type MoveFacts = {
  direction: Direction;
  turn: Turn;
  /** Where the head lands. */
  target: Point;
  eats: boolean;
  /** Manhattan distance from the new head to the nearest food; null with no food. */
  foodDistance: number | null;
  /** Empty cells reachable from the new head once the move is made, head excluded. */
  reachable: number;
  /** Every empty cell on the board once the move is made. */
  freeTotal: number;
  /** Less room than the snake is long, and no way to follow the tail out. */
  deadEnd: boolean;
  /** The tail borders the reachable region, so the snake can chase it out. */
  canReachTail: boolean;
};

const CLOCKWISE: Record<Direction, Direction> = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
};

export function turnOf(heading: Direction, direction: Direction): Turn {
  if (direction === heading) return "straight";
  if (direction === OPPOSITE[heading]) return "turn around";
  return CLOCKWISE[heading] === direction ? "right turn" : "left turn";
}

/** Legal moves that do not kill the snake on this step. */
export function safeMoves(state: Board): Direction[] {
  return legalMoves(state).filter((d) => isImmediatelySafe(state, d));
}

const key = (p: Point, width: number) => p.row * width + p.col;

/** Empty cells reachable from `start`, which is itself not counted. */
function floodFill(start: Point, blocked: ReadonlySet<number>, width: number, height: number) {
  const seen = new Set<number>();
  const stack: Point[] = [start];
  while (stack.length > 0) {
    const cell = stack.pop() as Point;
    for (const d of DIRECTIONS) {
      const next = translate(cell, d);
      if (next.col < 0 || next.col >= width || next.row < 0 || next.row >= height) continue;
      const k = key(next, width);
      if (blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      stack.push(next);
    }
  }
  return seen;
}

export function analyzeMove(state: Board, direction: Direction): MoveFacts {
  const { width, height } = state.rules;
  const target = translate(state.snake[0], direction);
  const eats = state.food.some((f) => f.col === target.col && f.row === target.row);

  // The body as it will be after the move: the tail vacates unless eating.
  const after = [target, ...(eats ? state.snake : state.snake.slice(0, -1))];
  const blocked = new Set(after.map((p) => key(p, width)));
  const region = floodFill(target, blocked, width, height);

  const tail = after[after.length - 1];
  const canReachTail = DIRECTIONS.some((d) => {
    const next = translate(tail, d);
    return (next.col === target.col && next.row === target.row) || region.has(key(next, width));
  });

  const distances = state.food.map(
    (f) => Math.abs(f.col - target.col) + Math.abs(f.row - target.row),
  );

  return {
    direction,
    turn: turnOf(state.heading, direction),
    target,
    eats,
    foodDistance: distances.length ? Math.min(...distances) : null,
    reachable: region.size,
    freeTotal: width * height - after.length,
    deadEnd: region.size < after.length && !canReachTail,
    canReachTail,
  };
}

/** Facts for every safe move, in the order the engine lists directions. */
export function analyze(state: Board): MoveFacts[] {
  return safeMoves(state).map((d) => analyzeMove(state, d));
}
