/** A cell on the board. `col` increases east, `row` increases south. */
export type Point = { col: number; row: number };

export const DIRECTIONS = ["north", "east", "south", "west"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Offsets match the coordinate system: north decreases `row`. */
export const DELTA: Record<Direction, Point> = {
  north: { col: 0, row: -1 },
  east: { col: 1, row: 0 },
  south: { col: 0, row: 1 },
  west: { col: -1, row: 0 },
};

export const OPPOSITE: Record<Direction, Direction> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

export type Ruleset = {
  width: number;
  height: number;
  foodCount: number;
  growthPerFood: number;
  startingLength: number;
  /**
   * Ticks without food before starving: `hungerBase + length * hungerPerSegment`
   * (ADR-0003). Kept as data, not a function, so a Ruleset stays serialisable
   * for the run record.
   */
  hungerBase: number;
  hungerPerSegment: number;
  /** Arcade only: ramp the tick rate as hunger climbs. Off for measurement. */
  speedEscalation: boolean;
};

export const DEFAULT_RULES: Ruleset = {
  width: 12,
  height: 12,
  foodCount: 1,
  growthPerFood: 1,
  startingLength: 3,
  hungerBase: 100,
  hungerPerSegment: 10,
  speedEscalation: false,
};

/** Why a game ended. `crashed` and `starved` stay distinct (ADR-0003). */
export type Outcome = "crashed" | "starved" | "won";

export type GameState = {
  rules: Ruleset;
  /** Head first, tail last. Order matters: it defines the neck. */
  snake: Point[];
  food: Point[];
  heading: Direction;
  tick: number;
  ticksSinceFood: number;
  foodEaten: number;
  outcome: Outcome | null;
  /** PRNG cursors live in state, never module-level (ADR-0002). */
  rng: { food: number; tiebreak: number };
};

/** The read-only view handed to a controller each turn. */
export type GameView = Readonly<{
  rules: Ruleset;
  snake: readonly Point[];
  food: readonly Point[];
  heading: Direction;
  tick: number;
  ticksSinceFood: number;
  legalMoves: readonly Direction[];
}>;
