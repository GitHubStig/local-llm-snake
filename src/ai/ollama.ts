import { parseCompletion, pickText } from "./parse.ts";
import type { CompletionRequest, CompletionResult, ModelInfo, Provider } from "./types.ts";

const NS_PER_MS = 1e6;

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
