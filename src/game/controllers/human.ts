import type { Controller, Decision } from "../controller.ts";
import type { Direction, GameView } from "../types.ts";

/**
 * The player, as a controller.
 *
 * `decide` resolves on the next keypress. Not pressing anything means the
 * promise is still unresolved when the tick fires, so the runner continues
 * straight — which is how classic snake already behaves (ADR-0006).
 *
 * Deliberately DOM-free: the UI calls `press()` from a keydown handler, which
 * keeps this testable and keeps `src/game/` free of browser APIs.
 */
export class HumanController implements Controller {
  readonly id = "human";
  /** A press answers the board on screen now, so staleness never applies. */
  readonly live = true;

  #resolve: ((d: Decision) => void) | null = null;
  /** One pending press, never more. Overwriting is the bug where a fast
   *  up-then-left loses the second turn you know you made (ADR-0006). */
  #queued: Direction | null = null;

  press(direction: Direction): void {
    if (this.#resolve) {
      const resolve = this.#resolve;
      this.#resolve = null;
      resolve({ direction });
    } else if (this.#queued === null) {
      this.#queued = direction;
    }
  }

  decide(_view: GameView, signal: AbortSignal): Promise<Decision> {
    if (this.#queued !== null) {
      const direction = this.#queued;
      this.#queued = null;
      return Promise.resolve({ direction });
    }
    return new Promise<Decision>((resolve, reject) => {
      this.#resolve = resolve;
      signal.addEventListener("abort", () => {
        this.#resolve = null;
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }
}
