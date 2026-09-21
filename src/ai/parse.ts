import type { CompletionResult, Timings } from "./types.ts";

/**
 * Some models leave `message.content` empty and put the schema-constrained
 * JSON in `message.thinking` instead — measured on qwen3-vl:4b, where a client
 * reading only `content` fails on every single tick (ADR-0007).
 */
export function pickText(content: string | null | undefined, thinking?: string | null) {
  if (content && content.trim()) return { text: content, source: "content" as const };
  if (thinking && thinking.trim()) return { text: thinking, source: "thinking" as const };
  return null;
}

/**
 * A model that silently truncates reports evaluating fewer prompt tokens than
 * were sent, with no error and no warning field — llama3:latest collapses to
 * ~4108 above its 8192 window and drops the middle of the prompt.
 *
 * The bound is deliberately loose: roughly six characters per token is well
 * below any real tokenizer's ratio, so this flags genuine truncation rather
 * than firing on ordinary variation.
 */
export function looksTruncated(promptChars: number, promptTokens: number | null): boolean {
  if (promptTokens === null) return false;
  return promptTokens < Math.floor(promptChars / 6);
}

export function parseCompletion(
  text: string,
  source: "content" | "thinking",
  timings: Timings,
  promptChars: number,
): CompletionResult {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`provider returned text that is not JSON: ${text.slice(0, 120)}`);
  }
  return {
    value,
    raw: text,
    source,
    timings,
    truncated: looksTruncated(promptChars, timings.promptTokens),
  };
}
