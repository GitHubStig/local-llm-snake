import { analyze, type MoveFacts } from "../game/analysis.ts";
import type { Controller, Decision } from "../game/controller.ts";
import type { GameView } from "../game/types.ts";
import { forcedMove } from "./controller.ts";
import { describeFactsCompact, nameOf, renderGrid, type DirectionNames } from "./prompt.ts";
import type { DecisionRequest, Provider } from "./types.ts";

/**
 * The words of a decision request, editable like the chat prompt. The state
 * and the criteria are computed; only the prose lives here.
 */
export type DecisionPromptFile = {
  instructions: string;
  /** Sent inside the state, as JEV's request does. */
  legend: string;
  directionNames?: DirectionNames;
};

/**
 * A request in the shape JEV's reference implementation sends: the board and
 * the facts about the snake as state, and one criterion per safe move, turn
 * first. The option facts are the ones the chat prompt states, in fewer words,
 * so a decision model and a chat model are told the same things (ADR-0014).
 */
export function buildDecisionRequest(
  file: DecisionPromptFile,
  view: GameView,
  facts: readonly MoveFacts[],
): Omit<DecisionRequest, "model" | "signal"> {
  const head = view.snake[0];
  const food = view.food[0];
  const criteria: Record<string, string> = {};
  for (const f of facts) {
    criteria[nameOf(file.directionNames, f.direction)] = `${f.turn}; ${describeFactsCompact(f)}`;
  }
  return {
    state: {
      board: renderGrid(view).split("\n"),
      legend: file.legend,
      head: { row: head.row, col: head.col },
      food: food ? { row: food.row, col: food.col } : null,
      heading: nameOf(file.directionNames, view.heading),
      snakeLength: view.snake.length,
      gridSize: { rows: view.rules.height, cols: view.rules.width },
      foodIsAdjacent: facts.some((f) => f.eats),
    },
    instructions: file.instructions,
    criteria,
  };
}

export type DecisionControllerOptions = {
  provider: Provider;
  model: string;
  prompt: DecisionPromptFile;
};

/**
 * Drives a decision model: it picks one described option and returns a
 * probability for each, instead of generating text (ADR-0014).
 */
export class DecisionController implements Controller {
  readonly id: string;
  #options: DecisionControllerOptions;

  constructor(options: DecisionControllerOptions) {
    this.#options = options;
    this.id = `${options.provider.id}:${options.model}`;
  }

  async decide(view: GameView, signal: AbortSignal): Promise<Decision> {
    const { provider, model, prompt } = this.#options;
    if (!provider.decide) throw new Error(`${provider.label} does not serve decision models`);

    // The board this decision is about; under projection, a few ticks ahead.
    const facts = analyze(view);
    const forced = forcedMove(facts, view);
    if (forced) return forced;

    const request = buildDecisionRequest(prompt, view, facts);
    const result = await provider.decide({ model, ...request, signal });

    const direction = facts.find(
      (f) => nameOf(prompt.directionNames, f.direction) === result.choice,
    )?.direction;
    if (!direction) throw new Error(`model chose an option it was not offered: ${result.choice}`);

    return {
      direction,
      meta: {
        request: { model, kind: "decision", ...request },
        probabilities: result.probabilities,
        confidence: result.confidence,
        raw: result.raw,
        wallMs: result.wallMs,
        promptTokens: result.inputTokens,
      },
    };
  }
}
