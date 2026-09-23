import { analyze } from "../game/analysis.ts";
import type { Controller, Decision } from "../game/controller.ts";
import type { Direction, GameView } from "../game/types.ts";
import { buildSchema, buildUser, type PromptFile, type PromptSettings } from "./prompt.ts";
import type { Provider } from "./types.ts";

export type ModelControllerOptions = {
  provider: Provider;
  model: string;
  prompt: PromptFile;
  settings: PromptSettings;
  maxTokens?: number;
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
    const { provider, model, prompt, settings, maxTokens } = this.#options;
    // The board this decision is about. Under projection it is a few ticks
    // ahead of the live game, so it must be the view, not the live state
    // (ADR-0013).
    const facts = analyze(view);

    // With fewer than two safe moves there is nothing to choose, so code
    // decides and the model is not called — as JEV does. With none, every move
    // is fatal and the snake carries on straight.
    if (facts.length < 2) {
      return {
        direction: facts[0]?.direction ?? view.heading,
        forced: true,
        meta: { forced: true, options: facts.length },
      };
    }

    const user = buildUser(prompt, view, facts);
    const schema = buildSchema(
      prompt,
      facts.map((f) => f.direction),
      settings.includeWhy,
    );

    const result = await provider.complete({
      model,
      system: prompt.system,
      user,
      schema,
      maxTokens,
      signal,
    });

    const direction = result.value.direction as Direction | undefined;
    // Constrained decoding guarantees shape, never correctness (ADR-0008).
    if (!direction || !facts.some((f) => f.direction === direction)) {
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
