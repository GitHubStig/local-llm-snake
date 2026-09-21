import { parseCompletion, pickText } from "./parse.ts";
import type { CompletionRequest, CompletionResult, ModelInfo, Provider } from "./types.ts";

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

/**
 * The OpenAI-compatible shape, used by `fm serve` (Apple Foundation Models).
 *
 * Unlike Ollama it is not a daemon — it must be started by hand, so `health`
 * is the probe behind the UI's offline state (ADR-0007).
 */
export function createOpenAIProvider(baseUrl: string, id: string, label: string): Provider {
  return {
    id,
    label,

    async health() {
      try {
        const res = await fetch(`${baseUrl}/health`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async warm() {
      // fm serve holds the system model; there is nothing to preload.
    },

    async listModels(): Promise<ModelInfo[]> {
      const res = await fetch(`${baseUrl}/v1/models`);
      if (!res.ok) throw new Error(`${label} /v1/models returned ${res.status}`);
      const body = (await res.json()) as { data?: { id: string }[] };
      return (body.data ?? []).map((m) => ({
        id: m.id,
        parameterSize: null,
        contextLength: null,
        capabilities: ["completion"],
      }));
    },

    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const startedAt = performance.now();
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          // Defaults to server-sent events, so this is not optional.
          stream: false,
          temperature: 0,
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
          response_format: {
            type: "json_schema",
            json_schema: { name: "move", schema: request.schema },
          },
        }),
      });
      if (!res.ok) throw new Error(`${label} /v1/chat/completions returned ${res.status}`);

      const body = (await res.json()) as ChatResponse;
      const picked = pickText(body.choices?.[0]?.message?.content);
      if (!picked) throw new Error(`${label} returned no content`);

      return parseCompletion(
        picked.text,
        picked.source,
        {
          wallMs: Math.round(performance.now() - startedAt),
          loadMs: null,
          promptTokens: body.usage?.prompt_tokens ?? null,
          cachedPromptTokens: body.usage?.prompt_tokens_details?.cached_tokens ?? null,
          completionTokens: body.usage?.completion_tokens ?? null,
        },
        request.system.length + request.user.length,
      );
    },
  };
}
