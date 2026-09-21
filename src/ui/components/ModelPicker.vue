<script setup lang="ts">
import { computed, onMounted } from "vue";
import FieldLabel from "./FieldLabel.vue";
import Icon from "./Icon.vue";
import { useGame } from "../useGame.ts";
import { useProviders, type Entry } from "../useProviders.ts";

const { driver, selected, setDriver, setModel } = useGame();
const { entries, loading, refresh } = useProviders();

onMounted(refresh);

const TIER_LABEL: Record<string, string> = {
  ok: "",
  slow: "slow",
  avoid: "avoid",
  unusable: "unusable",
};

/** Measured latency replaces the heuristic once a model has actually run. */
function describe(entry: Entry) {
  const bits = [entry.model.parameterSize, TIER_LABEL[entry.tier] || null].filter(Boolean);
  if (entry.measuredMs !== null) bits.push(`~${entry.measuredMs}ms`);
  return bits.length ? ` (${bits.join(" · ")})` : "";
}

/** Object.groupBy is newer than our browser targets, so group by hand. */
const grouped = computed(() => {
  const byProvider = new Map<string, Entry[]>();
  for (const entry of entries.value) {
    const list = byProvider.get(entry.providerId) ?? [];
    list.push(entry);
    byProvider.set(entry.providerId, list);
  }
  return [...byProvider].map(([providerId, models]) => ({ providerId, models }));
});

function onPick(value: string) {
  if (value === "human") return setDriver("human");
  const [providerId, ...rest] = value.split("|");
  setModel(providerId, rest.join("|"));
  setDriver("model");
}

const current = computed(() =>
  driver.value === "human" || !selected.value
    ? "human"
    : `${selected.value.providerId}|${selected.value.modelId}`,
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <FieldLabel text="Driver" />
    <div class="flex items-center gap-1.5">
      <select
        :value="current"
        class="field h-9 w-56 truncate"
        @change="onPick(($event.target as HTMLSelectElement).value)"
      >
        <option value="human">You (keyboard)</option>
        <optgroup v-for="group in grouped" :key="group.providerId" :label="group.providerId">
          <option
            v-for="entry in group.models"
            :key="entry.model.id"
            :value="`${entry.providerId}|${entry.model.id}`"
            :title="entry.reason ?? undefined"
          >
            {{ entry.model.id }}{{ describe(entry) }}
          </option>
        </optgroup>
      </select>
      <button
        type="button"
        class="field grid h-9 w-9 place-items-center"
        :class="loading ? 'text-muted' : 'hover:text-accent'"
        :disabled="loading"
        title="Rescan for models"
        @click="refresh()"
      >
        <Icon name="restart" :label="loading ? 'Scanning for models' : 'Rescan for models'" />
      </button>
    </div>
  </div>
</template>
