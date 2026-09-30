import type { AdviceRule, ModelInfo, Tier } from "./types.ts";

const ORDER: Record<Tier, number> = { unusable: 3, avoid: 2, slow: 1, ok: 0 };

/**
 * Billions of parameters, from the reported size or else from the name.
 *
 * Ollama reports no `parameter_size` for MLX builds, which is precisely the
 * set of large models the advice rules most need to catch — without the name
 * fallback, a 31B model is labelled as fine.
 */
function parseParams(model: ModelInfo): number | null {
  const reported = /^([\d.]+)\s*([BbMm])/.exec((model.parameterSize ?? "").trim());
  if (reported) {
    return reported[2].toLowerCase() === "m" ? Number(reported[1]) / 1000 : Number(reported[1]);
  }
  // A digit-led size token in the tag, e.g. "qwen3.8:27b-mlx" -> 27.
  const named = /[:-](\d+(?:\.\d+)?)b\b/i.exec(model.id);
  return named ? Number(named[1]) : null;
}

/**
 * A first guess only. Measured latency replaces it once a model has run, and
 * nothing here ever blocks a selection — running a model to watch it fail is
 * the point (ADR-0007).
 */
export function classify(
  model: ModelInfo,
  rules: AdviceRule[],
): { tier: Tier; reason: string | null } {
  let worst: { tier: Tier; reason: string } | null = null;

  for (const rule of rules) {
    const hit =
      (rule.capability !== undefined && model.capabilities.includes(rule.capability)) ||
      (rule.match !== undefined && new RegExp(rule.match, "i").test(model.id)) ||
      (rule.minParams !== undefined && (parseParams(model) ?? 0) >= rule.minParams);

    if (hit && (worst === null || ORDER[rule.tier] > ORDER[worst.tier])) {
      worst = { tier: rule.tier, reason: rule.reason };
    }
  }
  return worst ?? { tier: "ok", reason: null };
}
