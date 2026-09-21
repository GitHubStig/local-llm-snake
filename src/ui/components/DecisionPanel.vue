<script setup lang="ts">
import { computed } from "vue";
import { useGame } from "../useGame.ts";

const { lastMove, lastMeta, inFlightSince, failures, driver, settings, setSettings, stats } =
  useGame();

const elapsed = computed(() => (inFlightSince.value === null ? null : inFlightSince.value));

const why = computed(() => (lastMeta.value?.why as string | null) ?? null);
const truncated = computed(() => lastMeta.value?.truncated === true);
const source = computed(() => lastMeta.value?.source as string | undefined);

const FAILURE_LABEL: Record<string, string> = {
  timedOut: "Timed out",
  arrivedStale: "Arrived stale",
  illegalOnArrival: "Illegal on arrival",
  gameInvalid: "Legal but fatal",
};
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <h2 class="text-sm font-medium">This step's decision</h2>
      <label class="flex items-center gap-1.5 text-[11px] text-muted">
        <input
          type="checkbox"
          :checked="settings.includeWhy"
          @change="setSettings({ includeWhy: ($event.target as HTMLInputElement).checked })"
        />
        Ask why
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <p
        v-if="driver === 'model' && elapsed !== null"
        class="rounded-md border border-accent/30 bg-accent/10 px-2 py-1.5 text-xs text-accent"
      >
        Waiting on the model…
      </p>

      <p v-if="!lastMove" class="mt-2 text-sm text-muted">
        Nothing yet. Press play, or take a step.
      </p>

      <template v-else>
        <dl class="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">Direction</dt>
          <dd class="font-mono">{{ lastMove.direction }}</dd>
          <dt class="text-muted">Decided by</dt>
          <dd class="font-mono">
            {{ lastMove.decidedBy === "controller" ? "controller" : "continued straight" }}
          </dd>
          <dt class="text-muted">Latency</dt>
          <dd class="font-mono tabular-nums">
            {{ lastMove.latencyMs === null ? "--" : `${lastMove.latencyMs} ms` }}
          </dd>
          <dt v-if="lastMeta?.loadMs" class="text-muted">of which model load</dt>
          <dd v-if="lastMeta?.loadMs" class="font-mono tabular-nums">{{ lastMeta.loadMs }} ms</dd>
          <dt class="text-muted">Staleness</dt>
          <dd class="font-mono tabular-nums">{{ lastMove.staleness }}</dd>
          <template v-if="lastMeta?.promptTokens">
            <dt class="text-muted">Prompt tokens</dt>
            <dd class="font-mono tabular-nums">
              {{ lastMeta.promptTokens }}
              <span class="text-muted">({{ lastMeta.cachedPromptTokens }} cached)</span>
            </dd>
          </template>
        </dl>

        <p v-if="why" class="mt-3 rounded-md border border-line px-2 py-1.5 text-sm">
          {{ why }}
        </p>

        <p v-if="truncated" class="mt-2 text-xs text-food">
          The model evaluated fewer prompt tokens than were sent — it truncated silently.
        </p>
        <p v-if="source === 'thinking'" class="mt-2 text-xs text-food">
          Answer arrived in <code>message.thinking</code>; this model returns empty content.
        </p>
      </template>

      <h3 class="mt-4 text-xs font-medium text-muted">Why moves were not decided</h3>
      <dl class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <template v-for="(count, kind) in failures" :key="kind">
          <dt class="text-muted">{{ FAILURE_LABEL[kind] ?? kind }}</dt>
          <dd class="font-mono tabular-nums" :class="count > 0 ? 'text-text' : 'text-muted'">
            {{ count }}
          </dd>
        </template>
      </dl>
    </div>

    <p class="shrink-0 border-t border-line pt-2 text-xs text-muted">
      Controller decided {{ stats.share }}% of moves.
    </p>
  </div>
</template>
