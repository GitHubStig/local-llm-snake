import type { Controller } from "./controller.ts";
import { legalMoves, step, toView } from "./engine.ts";
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

export const SPEEDS = { slow: 1000, normal: 400, fast: 150, turbo: 60 } as const;
export type Speed = keyof typeof SPEEDS;

/** Why a tick was not decided by the controller (ADR-0009). */
export type FailureKind = "timedOut" | "arrivedStale" | "illegalOnArrival" | "gameInvalid";

export type MoveRecord = {
  tick: number;
  direction: Direction;
  decidedBy: "controller" | "continueStraight";
  latencyMs: number | null;
  /** Ticks between the board the answer was computed on and the board it moved. */
  staleness: number;
};

export type RunRecord = {
  seed: number;
  moves: MoveRecord[];
  failures: Record<FailureKind, number>;
};

type Stored = { direction: Direction; tick: number; latencyMs: number; meta?: unknown };

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
  /** Discard an answer older than this many ticks. */
  stalenessCap?: number;
  clock?: Clock;
} & RunnerEvents;

/**
 * Drives the game clock and keeps exactly one controller request in flight.
 *
 * The request is deliberately not tied to tick boundaries: when an answer
 * lands it becomes the current preference and the next request fires at once,
 * so a controller slower than the tick still contributes moves (ADR-0006).
 */
export class Runner {
  #state: GameState;
  #controller: Controller;
  #clock: Clock;
  #events: RunnerEvents;
  #tickMs: number;
  #stalenessCap: number;

  #timer: unknown = null;
  #inFlight: { abort: AbortController; startedAt: number; tick: number } | null = null;
  #stored: Stored | null = null;
  #record: RunRecord;

  constructor(state: GameState, options: RunnerOptions) {
    this.#state = state;
    this.#controller = options.controller;
    this.#clock = options.clock ?? systemClock;
    this.#events = options;
    this.#tickMs = SPEEDS[options.speed ?? "normal"];
    this.#stalenessCap = options.stalenessCap ?? 2;
    this.#record = {
      seed: options.seed,
      moves: [],
      failures: { timedOut: 0, arrivedStale: 0, illegalOnArrival: 0, gameInvalid: 0 },
    };
  }

  get state(): GameState {
    return this.#state;
  }
  get record(): RunRecord {
    return this.#record;
  }
  get running(): boolean {
    return this.#timer !== null;
  }
  /** When the outstanding request started, for the live in-flight display. */
  get inFlightSince(): number | null {
    return this.#inFlight?.startedAt ?? null;
  }

  setSpeed(speed: Speed): void {
    this.#tickMs = SPEEDS[speed];
  }

  /** Swap controllers mid-run. Takeover is just this (ADR-0006). */
  setController(controller: Controller): void {
    this.#cancelRequest();
    this.#stored = null;
    this.#controller = controller;
    this.#request();
  }

  start(): void {
    if (this.#timer !== null || this.#state.outcome !== null) return;
    this.#request();
    this.#schedule();
  }

  pause(): void {
    if (this.#timer !== null) this.#clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  stop(): void {
    this.pause();
    this.#cancelRequest();
  }

  /** Advance exactly one tick. Only meaningful while paused. */
  advance(): void {
    if (this.#state.outcome !== null) return;
    this.#tick();
  }

  #schedule(): void {
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      this.#tick();
      if (this.#state.outcome === null) this.#schedule();
      else this.#events.onEnd?.(this.#state);
    }, this.#tickMs);
  }

  #cancelRequest(): void {
    this.#inFlight?.abort.abort();
    this.#inFlight = null;
    this.#events.onInFlight?.(null);
  }

  #request(): void {
    if (this.#inFlight !== null || this.#state.outcome !== null) return;
    // An unconsumed answer already describes the current board, so asking
    // again would only overwrite it with work computed on the same state —
    // and with an instantly-resolving controller it would never yield.
    if (this.#stored !== null) return;

    const abort = new AbortController();
    const startedAt = this.#clock.now();
    const tick = this.#state.tick;
    this.#inFlight = { abort, startedAt, tick };
    this.#events.onInFlight?.(startedAt);

    this.#controller
      .decide(toView(this.#state), abort.signal)
      .then((decision) => {
        if (abort.signal.aborted) return;
        this.#stored = {
          direction: decision.direction,
          tick,
          latencyMs: this.#clock.now() - startedAt,
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
   * Consume the freshest stored answer, rejecting one that has aged out or
   * become a reverse since it was computed.
   */
  #take(): { direction: Direction; latencyMs: number; staleness: number } | null {
    const stored = this.#stored;
    if (stored === null) {
      this.#record.failures.timedOut++;
      return null;
    }
    this.#stored = null;

    const staleness = this.#state.tick - stored.tick;
    if (staleness > this.#stalenessCap) {
      this.#record.failures.arrivedStale++;
      return null;
    }
    if (!legalMoves(this.#state).includes(stored.direction)) {
      this.#record.failures.illegalOnArrival++;
      return null;
    }
    return { direction: stored.direction, latencyMs: stored.latencyMs, staleness };
  }

  #tick(): void {
    const taken = this.#take();
    const direction = taken?.direction ?? this.#state.heading;

    this.#state = step(this.#state, direction);

    const move: MoveRecord = {
      tick: this.#state.tick,
      direction,
      decidedBy: taken ? "controller" : "continueStraight",
      latencyMs: taken?.latencyMs ?? null,
      staleness: taken?.staleness ?? 0,
    };

    // Schema-valid, in-enum, and still fatal: the interesting bucket (ADR-0009).
    if (taken && this.#state.outcome === "crashed") this.#record.failures.gameInvalid++;

    this.#record.moves.push(move);
    this.#events.onTick?.(this.#state, move);

    if (this.#state.outcome !== null) this.#cancelRequest();
    else this.#request();
  }
}

/** Share of moves the controller actually decided (ADR-0009). */
export function controllerShare(record: RunRecord): number {
  if (record.moves.length === 0) return 0;
  const decided = record.moves.filter((m) => m.decidedBy === "controller").length;
  return decided / record.moves.length;
}
