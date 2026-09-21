import type { Direction, GameView } from "./types.ts";

export type Decision = {
  direction: Direction;
  /** Opaque to the engine; the decision panel renders it (ADR-0006). */
  meta?: Record<string, unknown>;
};

/**
 * Anything that answers "which way do I turn?".
 *
 * Always async, so a keypress, an arithmetic controller and a network call all
 * use the same code path. A fast controller returns an already-resolved
 * promise and its answer is never stale.
 */
export interface Controller {
  readonly id: string;
  decide(view: GameView, signal: AbortSignal): Promise<Decision>;
}
