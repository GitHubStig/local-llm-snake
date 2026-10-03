/** What every provider must accept. Aim at the intersection of the two APIs. */
export type CompletionRequest = {
  model: string;
  /** Byte-identical across ticks, or prefix caching is lost (ADR-0008). */
  system: string;
  /** The per-tick delta only. */
  user: string;
  /** Plain JSON Schema; both providers enforce it by constrained decoding. */
  schema: Record<string, unknown>;
  /** Hard ceiling on generated tokens; output length dominates latency. */
  maxTokens?: number;
  signal?: AbortSignal;
};

/** Instrumentation the panel and the tick budget need (ADR-0009). */
export type Timings = {
  wallMs: number;
  /** Model load, reported separately so a cold swap is not read as slowness. */
  loadMs: number | null;
  promptTokens: number | null;
  cachedPromptTokens: number | null;
  completionTokens: number | null;
};

export type CompletionResult = {
  /** Parsed JSON conforming to the requested schema. */
  value: Record<string, unknown>;
  /** Exactly what came back, for the panel. */
  raw: string;
  /** Where the text was found. Some models leave `content` empty (ADR-0007). */
  source: "content" | "thinking";
  timings: Timings;
  /** The model reported evaluating fewer prompt tokens than we sent. */
  truncated: boolean;
};

/**
 * A decision ("System One") request: pick one of several described options.
 * This is the shape JEV's API takes — a state, and a choice question whose
 * criteria describe each option — which Ollama 0.35 serves at /v1/systemone
 * for models with the `decision` capability (ADR-0014).
 */
export type DecisionRequest = {
  model: string;
  /** Data to judge. Treated by the model as data, never as instructions. */
  state: Record<string, unknown>;
  instructions: string;
  /** One entry per option: its name, and a description to judge it by. */
  criteria: Record<string, string>;
  signal?: AbortSignal;
};

export type DecisionResult = {
  /** The chosen option's name, one of the criteria keys. */
  choice: string;
  /** The model's probability for every option. */
  probabilities: Record<string, number>;
  confidence: number;
  wallMs: number;
  inputTokens: number | null;
  /** Exactly what came back, for the panel. */
  raw: string;
};

export type ModelInfo = {
  id: string;
  parameterSize: string | null;
  contextLength: number | null;
  capabilities: string[];
};

export type Tier = "ok" | "slow" | "avoid" | "unusable";

export type Provider = {
  readonly id: string;
  readonly label: string;
  health(): Promise<boolean>;
  /**
   * Load the model's weights before play starts, resolving once they are
   * loaded. False if the model could not be loaded; never throws.
   *
   * A cold call costs ~2.2s, almost all of it load, which at any tick speed
   * means the snake is dead by the time the first answer lands (ADR-0009).
   * Decision models are loaded through their own endpoint, since they do
   * not serve text generation.
   */
  warm(model: string, options?: { decision?: boolean }): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Only for providers serving decision models; absent otherwise. */
  decide?(request: DecisionRequest): Promise<DecisionResult>;
};

export type ProviderConfig = {
  id: string;
  label: string;
  baseUrl: string;
  api: "ollama" | "openai";
  /** Listed first in the driver dropdown and used by the scripts. */
  defaultModel?: string;
};

export type AdviceRule = {
  capability?: string;
  match?: string;
  minParams?: number;
  tier: Tier;
  reason: string;
};
