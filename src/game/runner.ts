import type { Controller } from "./controller.ts";
import { isImmediatelySafe, legalMoves, step, toView } from "./engine.ts";
import type { Direction, GameState } from "./types.ts";

/** Injectable so tests can drive the loop without real time. */
export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const SPEEDS = { slow: 1000, normal: 400, fast: 200, turbo: 100 } as const;
export type Speed = keyof typeof SPEEDS;

/** Why a tick was not decided by the controller (ADR-0009, ADR-0013). */
export type FailureKind =
  /** An answer was due by this tick and had not arrived. */
  | "timedOut"
  /** Arrived after its tick, by which time the move was no longer safe. */
  | "lateUnsafe"
  /** A keypress that would reverse onto the neck. */
  | "illegalOnArrival"
  /** Applied, legal, and still fatal. */
  | "gameInvalid"
  /** Went straight into a crash while an answer was still on its way. */
  | "diedWaiting";

export type MoveRecord = {
  tick: number;
  direction: Direction;
  /**
   * `planned` is straight by design: the controller's pending decision is for a
   * later tick, and its projection assumed the snake would go straight until
   * then (ADR-0013). `continueStraight` is straight because nothing was there.
   */
  decidedBy: "controller" | "forced" | "planned" | "continueStraight";
  latencyMs: number | null;
  /** How many ticks ahead the board sent to the controller was projected. */
  horizon: number;
  /** Ticks after its target tick the answer was applied; 0 is on time. */
  lateness: number;
  /** Whatever the controller attached; the panel renders it (ADR-0006). */
  meta?: Record<string, unknown>;
};

export type RunRecord = {
  seed: number;
  moves: MoveRecord[];
  failures: Record<FailureKind, number>;
};

type Stored = {
  direction: Direction;
  /** The tick whose board this answer is about, and when it should be applied. */
  target: number;
  horizon: number;
  latencyMs: number;
  forced: boolean;
  live: boolean;
  meta?: unknown;
};

type InFlight = {
  abort: AbortController;
  startedAt: number;
  target: number;
  live: boolean;
};

export type RunnerEvents = {
  onTick?: (state: GameState, record: MoveRecord) => void;
  onEnd?: (state: GameState) => void;
  /** Fired when a request starts and when it settles, for the live panel. */
  onInFlight?: (since: number | null) => void;
};

export type RunnerOptions = {
  seed: number;
  controller: Controller;
  speed?: Speed;
  /** Send each board as it will be when the answer lands (ADR-0013). */
  project?: boolean;
  /**
   * Latencies already measured for this controller — carried over from the
   * previous game, so a new game does not start unprojected.
   */
  latencies?: readonly number[];
  clock?: Clock;
} & RunnerEvents;

/** How many recent latencies the horizon estimate is drawn from. */
const LATENCY_WINDOW = 25;

/**
 * Ticks to project ahead for a controller with these recent latencies.
 *
 * An answer arriving *L* ms after a request is used at the first tick after it
 * lands, and decides the move from the state one tick before that — so the
 * board to send is *k* = max(0, ⌈*L* / *T*⌉ − 1) ticks ahead. *L* is the 75th
 * percentile, not the median: an early answer can be held harmlessly, a late
 * one cannot (ADR-0013).
 */
export function horizonFor(latencies: readonly number[], tickMs: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p75 = sorted[Math.ceil(sorted.length * 0.75) - 1];
  return Math.max(0, Math.ceil(p75 / tickMs) - 1);
}

/**
 * The board after up to `ticks` of going straight, stopping short of any move
 * that would end the game: a projected board is one a decision can still act
 * on. Exact, because the engine is pure and the random generator lives in the
 * state, so even food that spawns along the way lands where it really will.
 */
export function projectStraight(state: GameState, ticks: number): GameState {
  let board = state;
  for (let i = 0; i < ticks; i++) {
    const next = step(board, board.heading);
    if (next.outcome !== null) break;
    board = next;
  }
  return board;
}

/**
 * Drives the game clock and keeps exactly one controller request in flight.
 *
 * The request is deliberately not tied to tick boundaries: an answer that
 * lands becomes the current preference, and the next request fires as soon as
 * a tick consumes it, so a controller slower than the tick still contributes
 * moves (ADR-0006).
 *
 * While a request is outstanding the snake goes straight, so the board its
 * answer will act on is known in advance. With projection on, that is the
 * board the controller is sent (ADR-0013).
 */
export class Runner {
  #state: GameState;
  #controller: Controller;
  #clock: Clock;
  #events: RunnerEvents;
  #tickMs: number;
  #project: boolean;
  #latencies: number[] = [];

  #timer: unknown = null;
  /**
   * Whether the loop is meant to keep going. Separate from `#timer`, which is
   * always null inside the timer's own callback — so a stop made from onTick
   * could not be seen through it.
   */
  #active = false;
  /** Stopped, as opposed to paused: a paused runner still asks, for Step. */
  #stopped = false;
  #inFlight: InFlight | null = null;
  #stored: Stored | null = null;
  #record: RunRecord;

  constructor(state: GameState, options: RunnerOptions) {
    this.#state = state;
    this.#controller = options.controller;
    this.#clock = options.clock ?? systemClock;
    this.#events = options;
    this.#tickMs = SPEEDS[options.speed ?? "normal"];
    this.#project = options.project ?? true;
    this.#latencies = [...(options.latencies ?? [])].slice(-LATENCY_WINDOW);
    this.#record = {
      seed: options.seed,
      moves: [],
      failures: {
        timedOut: 0,
        lateUnsafe: 0,
        illegalOnArrival: 0,
        gameInvalid: 0,
        diedWaiting: 0,
      },
    };
  }

  get state(): GameState {
    return this.#state;
  }
  get record(): RunRecord {
    return this.#record;
  }
  get running(): boolean {
    return this.#active;
  }
  /** When the outstanding request started, for the live in-flight display. */
  get inFlightSince(): number | null {
    return this.#inFlight?.startedAt ?? null;
  }
  /** The recent latencies behind the horizon, to carry into the next game. */
  get latencies(): readonly number[] {
    return this.#latencies;
  }
  /** How far ahead the next request would be projected. */
  get horizon(): number {
    return this.#horizon(this.#controller);
  }

  setSpeed(speed: Speed): void {
    this.#tickMs = SPEEDS[speed];
  }

  setProjection(on: boolean): void {
    this.#project = on;
  }

  /** Swap controllers mid-run. Takeover is just this (ADR-0006). */
  setController(controller: Controller): void {
    this.#cancelRequest();
    this.#stored = null;
    // A different controller has a different latency, so start measuring anew.
    this.#latencies = [];
    this.#controller = controller;
    this.#request();
  }

  start(): void {
    if (this.#active || this.#state.outcome !== null) return;
    this.#active = true;
    this.#stopped = false;
    this.#request();
    this.#schedule();
  }

  pause(): void {
    this.#active = false;
    if (this.#timer !== null) this.#clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  stop(): void {
    this.#stopped = true;
    this.pause();
    this.#cancelRequest();
  }

  /** Advance exactly one tick. Only meaningful while paused. */
  advance(): void {
    if (this.#state.outcome !== null) return;
    this.#tick();
  }

  #horizon(controller: Controller): number {
    if (!this.#project || controller.live) return 0;
    return horizonFor(this.#latencies, this.#tickMs);
  }

  #schedule(): void {
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      this.#tick();
      if (this.#state.outcome !== null) {
        this.#active = false;
        this.#events.onEnd?.(this.#state);
      } else if (this.#active) {
        this.#schedule();
      }
    }, this.#tickMs);
  }

  #cancelRequest(): void {
    this.#inFlight?.abort.abort();
    this.#inFlight = null;
    this.#events.onInFlight?.(null);
  }

  #request(): void {
    if (this.#stopped || this.#inFlight !== null || this.#state.outcome !== null) return;
    // An unconsumed answer already describes the board ahead, so asking again
    // would only overwrite it — and with an instantly-resolving controller it
    // would never yield.
    if (this.#stored !== null) return;

    const controller = this.#controller;
    const live = controller.live === true;
    const abort = new AbortController();
    const startedAt = this.#clock.now();
    const board = projectStraight(this.#state, this.#horizon(controller));
    const target = board.tick;
    const horizon = target - this.#state.tick;
    this.#inFlight = { abort, startedAt, target, live };
    this.#events.onInFlight?.(startedAt);

    controller
      .decide(toView(board), abort.signal)
      .then((decision) => {
        if (abort.signal.aborted) return;
        const latencyMs = this.#clock.now() - startedAt;
        // A forced answer is instant and a keypress is human, so neither says
        // anything about how far ahead to project.
        if (!decision.forced && !live) {
          this.#latencies = [...this.#latencies, latencyMs].slice(-LATENCY_WINDOW);
        }
        this.#stored = {
          direction: decision.direction,
          // A keypress is about the board on screen when it arrives, however
          // long its request sat open (ADR-0006).
          target: live ? this.#state.tick : target,
          horizon,
          latencyMs,
          forced: decision.forced === true,
          live,
          meta: decision.meta,
        };
      })
      .catch(() => {
        /* aborted or failed; the tick falls through to continue-straight */
      })
      .finally(() => {
        if (this.#inFlight?.abort === abort) {
          this.#inFlight = null;
          this.#events.onInFlight?.(null);
        }
        this.#request();
      });
  }

  /**
   * The answer to act on this tick, if any.
   *
   * Early answers are held until the tick they were projected for. Late ones
   * are applied however late, as long as the move is still safe — age alone
   * says nothing about whether a move still works (ADR-0013).
   */
  #take(): {
    direction: Direction;
    latencyMs: number;
    horizon: number;
    lateness: number;
    forced: boolean;
    meta?: Record<string, unknown>;
  } | null {
    const now = this.#state.tick;
    const stored = this.#stored;

    if (stored === null) {
      // Ticks before a projected target are meant to go straight, and not
      // pressing a key is a choice, so only a due, missing answer is a failure.
      const pending = this.#inFlight;
      if (pending && !pending.live && pending.target <= now) this.#record.failures.timedOut++;
      return null;
    }
    if (now < stored.target) return null;
    this.#stored = null;

    // The snake only goes straight while an answer is pending, so the heading
    // cannot change under it: a reverse can only come from the controller.
    if (!legalMoves(this.#state).includes(stored.direction)) {
      this.#record.failures.illegalOnArrival++;
      return null;
    }
    // On time, the board is exactly the one the answer was chosen for, and a
    // fatal choice is the controller's to own. Late, the board has moved on.
    if (!stored.live && now > stored.target && !isImmediatelySafe(this.#state, stored.direction)) {
      this.#record.failures.lateUnsafe++;
      return null;
    }

    return {
      direction: stored.direction,
      latencyMs: stored.latencyMs,
      horizon: stored.horizon,
      lateness: now - stored.target,
      forced: stored.forced,
      meta: stored.meta as Record<string, unknown> | undefined,
    };
  }

  #tick(): void {
    const now = this.#state.tick;
    const pending = this.#inFlight;
    // A decision is pending for a later tick, held or still on its way.
    const planned =
      (this.#stored !== null && now < this.#stored.target) ||
      (this.#stored === null && pending !== null && !pending.live && pending.target > now);
    const taken = this.#take();
    const direction = taken?.direction ?? this.#state.heading;
    // A model's answer was still coming, or was being held for a later tick.
    const waiting =
      taken === null &&
      this.#controller.live !== true &&
      (this.#inFlight !== null || this.#stored !== null);

    this.#state = step(this.#state, direction);

    const move: MoveRecord = {
      tick: this.#state.tick,
      direction,
      decidedBy: taken
        ? taken.forced
          ? "forced"
          : "controller"
        : planned
          ? "planned"
          : "continueStraight",
      latencyMs: taken?.latencyMs ?? null,
      horizon: taken?.horizon ?? 0,
      lateness: taken?.lateness ?? 0,
      meta: taken?.meta,
    };

    if (this.#state.outcome === "crashed") {
      // Schema-valid, in-enum, and still fatal (ADR-0009). A forced move is
      // code's, not the controller's, so it never counts here.
      if (taken && !taken.forced) this.#record.failures.gameInvalid++;
      // Latency, not judgement, lost this one.
      if (waiting) this.#record.failures.diedWaiting++;
    }

    this.#record.moves.push(move);
    this.#events.onTick?.(this.#state, move);

    if (this.#state.outcome !== null) this.#cancelRequest();
    else this.#request();
  }
}

/**
 * Of the moves where a decision was due, the share the controller made
 * (ADR-0009). Planned ticks are left out: no decision was due on them, and
 * counting them as misses made share *fall* when projection was switched on.
 */
export function controllerShare(record: RunRecord): number {
  const due = record.moves.filter((m) => m.decidedBy !== "planned");
  if (due.length === 0) return 0;
  return due.filter((m) => m.decidedBy === "controller").length / due.length;
}
