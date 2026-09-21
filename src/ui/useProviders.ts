import { createGlobalState } from "@vueuse/core";
import { computed, ref, shallowRef } from "vue";

import config from "../config/providers.json";
import defaultPrompt from "../prompts/default.json";
import applePrompt from "../prompts/apple.json";
import { createOllamaProvider } from "../ai/ollama.ts";
import { createOpenAIProvider } from "../ai/openai.ts";
import { classify } from "../ai/tiers.ts";
import type { PromptFile } from "../ai/prompt.ts";
import type { AdviceRule, ModelInfo, Provider, ProviderConfig, Tier } from "../ai/types.ts";

const PROMPTS: Record<string, PromptFile> = {
  default: defaultPrompt as PromptFile,
  apple: applePrompt as PromptFile,
};

export type Entry = {
  providerId: string;
  model: ModelInfo;
  tier: Tier;
  reason: string | null;
  /** Median wall time once the model has actually run; beats any heuristic. */
  measuredMs: number | null;
};

const STORE_KEY = "measured-latency";

function loadMeasured(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, number[]>;
  } catch {
    return {};
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export const useProviders = createGlobalState(() => {
  const configs = config.providers as ProviderConfig[];
  const rules = config.modelAdvice as AdviceRule[];

  const providers = new Map<string, Provider>(
    configs.map((c) => [
      c.id,
      c.api === "ollama"
        ? createOllamaProvider(c.baseUrl, c.label)
        : createOpenAIProvider(c.baseUrl, c.id, c.label),
    ]),
  );

  const online = ref<Record<string, boolean>>({});
  const entries = shallowRef<Entry[]>([]);
  const loading = ref(false);
  const measured = ref<Record<string, number[]>>(loadMeasured());

  /** Latency measured in play replaces the guess, and persists (ADR-0007). */
  function recordLatency(providerId: string, modelId: string, ms: number) {
    const key = `${providerId}:${modelId}`;
    const samples = [...(measured.value[key] ?? []), ms].slice(-25);
    measured.value = { ...measured.value, [key]: samples };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(measured.value));
    } catch {
      /* blocked storage: the guess simply stays the guess */
    }
  }

  async function refresh() {
    loading.value = true;
    const found: Entry[] = [];

    for (const c of configs) {
      const provider = providers.get(c.id);
      if (!provider) continue;

      const healthy = await provider.health();
      online.value = { ...online.value, [c.id]: healthy };
      if (!healthy) continue;

      try {
        for (const model of await provider.listModels()) {
          const { tier, reason } = classify(model, rules);
          const samples = measured.value[`${c.id}:${model.id}`] ?? [];
          found.push({
            providerId: c.id,
            model,
            tier,
            reason,
            measuredMs: samples.length ? Math.round(median(samples)) : null,
          });
        }
      } catch {
        online.value = { ...online.value, [c.id]: false };
      }
    }

    // Usable first, then by measured speed; nothing is ever hidden or blocked.
    const order: Record<Tier, number> = { ok: 0, slow: 1, avoid: 2, unusable: 3 };
    found.sort(
      (a, b) =>
        order[a.tier] - order[b.tier] ||
        (a.measuredMs ?? Infinity) - (b.measuredMs ?? Infinity) ||
        a.model.id.localeCompare(b.model.id),
    );
    entries.value = found;
    loading.value = false;
  }

  function promptFor(providerId: string, modelId: string): PromptFile {
    const c = configs.find((x) => x.id === providerId);
    const override = c?.promptOverrides?.find((o) => new RegExp(o.match).test(modelId));
    return PROMPTS[override?.prompt ?? c?.prompt ?? "default"] ?? PROMPTS.default;
  }

  const anyOnline = computed(() => Object.values(online.value).some(Boolean));

  return {
    configs,
    providers,
    entries,
    online,
    anyOnline,
    loading,
    refresh,
    promptFor,
    recordLatency,
  };
});
