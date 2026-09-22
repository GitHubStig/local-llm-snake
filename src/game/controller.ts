import type { Direction, GameView } from "./types.ts";

export type Decision = {
  direction: Direction;
  /**
   * Decided by code rather than by whatever the controller consults, because
   * there was nothing to choose between. Counted apart from controller
   * decisions so it cannot inflate controller share (ADR-0006).
   */
  forced?: boolean;
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
  /**
   * Whether an answer reflects the board at the moment it *arrives* rather
   * than when it was requested. A keypress is made in response to the board on
   * screen, so it is never stale however long the request sat open; a model
   * answers about the board it was sent, which may have moved on since.
   */
  readonly live?: boolean;
  decide(view: GameView, signal: AbortSignal): Promise<Decision>;
}
