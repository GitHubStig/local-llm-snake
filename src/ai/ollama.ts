import { parseCompletion, pickText } from "./parse.ts";
import type {
  CompletionRequest,
  CompletionResult,
  DecisionRequest,
  DecisionResult,
  ModelInfo,
  Provider,
} from "./types.ts";

const NS_PER_MS = 1e6;
/** Longer than Ollama's 5 minute default, so a pause does not evict the model. */
const KEEP_ALIVE = "30m";

type ChatResponse = {
  message?: { content?: string; thinking?: string | null };
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_cached_count?: number;
  eval_count?: number;
};

/**
 * Ollama over its native /api/chat, not the OpenAI-compatible layer.
 *
 * Both enforce schemas identically, but only the native response carries
 * prompt_eval_cached_count, eval_count and load_duration — exactly the
 * instrumentation the panel and the tick budget need (ADR-0007).
 */
export function createOllamaProvider(baseUrl: string, label = "Ollama"): Provider {
  return {
    id: "ollama",
    label,

    async health() {
      try {
        const res = await fetch(`${baseUrl}/api/version`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async warm(model: string) {
      try {
        // An empty prompt loads the weights and returns immediately.
        await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, keep_alive: KEEP_ALIVE }),
        });
      } catch {
        /* the first real call will simply pay the load cost instead */
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
      const body = (await res.json()) as {
        models?: { name: string; details?: Record<string, unknown>; capabilities?: string[] }[];
      };
      return (body.models ?? []).map((m) => ({
        id: m.name,
        parameterSize: (m.details?.parameter_size as string) ?? null,
        contextLength: (m.details?.context_length as number) ?? null,
        capabilities: m.capabilities ?? [],
      }));
    },

    /**
     * A decision model through Ollama's /v1/systemone (ADR-0014). One choice
     * question named `move`; the answer comes back keyed by our own option
     * names, with a probability for each. Measured at about 40 ms for tev1.
     */
    async decide(request: DecisionRequest): Promise<DecisionResult> {
      const startedAt = performance.now();
      const res = await fetch(`${baseUrl}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          state: request.state,
          questions: {
            move: {
              type: "choice",
              instructions: request.instructions,
              criteria: request.criteria,
            },
          },
          keep_alive: KEEP_ALIVE,
        }),
      });
      const raw = await res.text();
      if (!res.ok)
        throw new Error(`Ollama /v1/systemone returned ${res.status}: ${raw.slice(0, 200)}`);
      return parseDecision(raw, Math.round(performance.now() - startedAt));
    },

    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const startedAt = performance.now();
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          // Thinking defaults to ON and costs ~83x; never omit this (ADR-0008).
          think: false,
          // Defaults to NDJSON streaming, so this is not optional either.
          stream: false,
          format: request.schema,
          keep_alive: KEEP_ALIVE,
          options: {
            temperature: 0,
            ...(request.maxTokens ? { num_predict: request.maxTokens } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(`Ollama /api/chat returned ${res.status}`);

      const body = (await res.json()) as ChatResponse;
      const picked = pickText(body.message?.content, body.message?.thinking);
      if (!picked) throw new Error("Ollama returned neither content nor thinking");

      return parseCompletion(
        picked.text,
        picked.source,
        {
          wallMs: Math.round(performance.now() - startedAt),
          loadMs: body.load_duration ? Math.round(body.load_duration / NS_PER_MS) : null,
          promptTokens: body.prompt_eval_count ?? null,
          cachedPromptTokens: body.prompt_eval_cached_count ?? null,
          completionTokens: body.eval_count ?? null,
        },
        request.system.length + request.user.length,
      );
    },
  };
}

/** Read a /v1/systemone response. Exported for tests. */
export function parseDecision(raw: string, wallMs: number): DecisionResult {
  const body = JSON.parse(raw) as {
    answers?: {
      move?: { choice?: string; probabilities?: Record<string, number>; confidence?: number };
    };
    usage?: { input_tokens?: number };
  };
  const move = body.answers?.move;
  if (!move?.choice) throw new Error(`decision response had no choice: ${raw.slice(0, 200)}`);
  return {
    choice: move.choice,
    probabilities: move.probabilities ?? {},
    confidence: move.confidence ?? 0,
    wallMs,
    inputTokens: body.usage?.input_tokens ?? null,
    raw,
  };
}
