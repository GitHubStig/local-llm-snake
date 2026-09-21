import type { AdviceRule, ModelInfo, Tier } from "./types.ts";

const ORDER: Record<Tier, number> = { unusable: 3, avoid: 2, slow: 1, ok: 0 };

function parseParams(size: string | null): number | null {
  if (!size) return null;
  const match = /^([\d.]+)\s*([BbMm])/.exec(size.trim());
  if (!match) return null;
  return match[2].toLowerCase() === "m" ? Number(match[1]) / 1000 : Number(match[1]);
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
      (rule.minParams !== undefined && (parseParams(model.parameterSize) ?? 0) >= rule.minParams);

    if (hit && (worst === null || ORDER[rule.tier] > ORDER[worst.tier])) {
      worst = { tier: rule.tier, reason: rule.reason };
    }
  }
  return worst ?? { tier: "ok", reason: null };
}
