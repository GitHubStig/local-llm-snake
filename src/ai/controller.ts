import type { Controller, Decision } from "../game/controller.ts";
import type { Direction, GameState, GameView } from "../game/types.ts";
import { buildSchema, buildUser, type PromptFile, type PromptSettings } from "./prompt.ts";
import type { Provider } from "./types.ts";

export type ModelControllerOptions = {
  provider: Provider;
  model: string;
  prompt: PromptFile;
  settings: PromptSettings;
  maxTokens?: number;
  /** The live game, since a GameView deliberately carries no analysis. */
  getState: () => GameState;
};

/**
 * One controller for every provider and model. Swapping either is a new
 * Provider, never a new Controller (ADR-0007).
 */
export class ModelController implements Controller {
  readonly id: string;
  #options: ModelControllerOptions;

  constructor(options: ModelControllerOptions) {
    this.#options = options;
    this.id = `${options.provider.id}:${options.model}`;
  }

  async decide(view: GameView, signal: AbortSignal): Promise<Decision> {
    const { provider, model, prompt, settings, maxTokens, getState } = this.#options;
    const state = getState();

    const user = buildUser(prompt, state, view, settings);
    const schema = buildSchema(prompt, view.legalMoves, settings.includeWhy);

    const result = await provider.complete({
      model,
      system: prompt.system,
      user,
      schema,
      maxTokens,
      signal,
    });

    const direction = result.value.direction as Direction | undefined;
    // Constrained decoding guarantees shape, never correctness, and a stale
    // answer may have gone illegal in flight (ADR-0008).
    if (!direction || !view.legalMoves.includes(direction)) {
      throw new Error(`model returned an unusable direction: ${String(direction)}`);
    }

    return {
      direction,
      meta: {
        // Exactly what went over the wire, so the panel can show it.
        request: { model, system: prompt.system, user, schema, maxTokens },
        why: result.value.why ?? null,
        raw: result.raw,
        source: result.source,
        truncated: result.truncated,
        ...result.timings,
      },
    };
  }
}
