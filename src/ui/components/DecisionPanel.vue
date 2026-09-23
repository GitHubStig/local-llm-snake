<script setup lang="ts">
import { releaseFocus } from "../focus.ts";
import { computed } from "vue";
import { useGame } from "../useGame.ts";

const {
  lastMove,
  lastMeta,
  inFlightSince,
  failures,
  driver,
  settings,
  project,
  setProjection,
  setSettings,
  stats,
} = useGame();

/**
 * Always rendered at a fixed size. The in-flight state flips on and off every
 * tick, so anything that appears and disappears with it shoves the rest of the
 * panel up and down several times a second.
 */
const status = computed(() => {
  if (driver.value !== "model") return { label: "You're driving", waiting: false };
  return inFlightSince.value === null
    ? { label: "Ready", waiting: false }
    : { label: "Waiting", waiting: true };
});

const why = computed(() => (lastMeta.value?.why as string | null) ?? null);

type SentRequest = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
};
const request = computed(() => (lastMeta.value?.request as SentRequest | undefined) ?? null);
const raw = computed(() => (lastMeta.value?.raw as string | undefined) ?? null);
const truncated = computed(() => lastMeta.value?.truncated === true);
const source = computed(() => lastMeta.value?.source as string | undefined);

const FAILURE_LABEL: Record<string, string> = {
  timedOut: "Timed out",
  lateUnsafe: "Late and no longer safe",
  illegalOnArrival: "Illegal on arrival",
  gameInvalid: "Legal but fatal",
  diedWaiting: "Died waiting for an answer",
};

const DECIDED_BY: Record<string, string> = {
  controller: "controller",
  forced: "code, with one safe move",
  planned: "straight, as planned",
  continueStraight: "continued straight",
};

/** "on time", "1 tick late" — lateness against the tick it was planned for. */
const arrival = (lateness: number) =>
  lateness === 0 ? "on time" : `${lateness} tick${lateness === 1 ? "" : "s"} late`;
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted">
      <label class="flex items-center gap-1.5">
        <input
          type="checkbox"
          :checked="project"
          @change="
            setProjection(($event.target as HTMLInputElement).checked);
            releaseFocus($event);
          "
        />
        Plan ahead for the model's latency
      </label>
      <label class="flex items-center gap-1.5">
        <input
          type="checkbox"
          :checked="settings.includeWhy"
          @change="
            setSettings({ includeWhy: ($event.target as HTMLInputElement).checked });
            releaseFocus($event);
          "
        />
        Ask why (after the answer, so it never changes the move)
      </label>
    </div>

    <div class="flex shrink-0 items-center justify-between gap-2">
      <h2 class="text-sm font-medium">This step's decision</h2>
      <span
        class="inline-flex h-6 w-28 items-center justify-center gap-1.5 rounded-full border text-[11px] transition-colors duration-150"
        :class="
          status.waiting ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted'
        "
        role="status"
      >
        <span
          class="size-1.5 rounded-full transition-colors duration-150"
          :class="status.waiting ? 'bg-accent' : 'bg-line'"
        ></span>
        {{ status.label }}
      </span>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <p v-if="!lastMove" class="mt-2 text-sm text-muted">
        Nothing yet. Press play, or take a step.
      </p>

      <template v-else>
        <dl class="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt class="text-muted">Direction</dt>
          <dd class="font-mono">{{ lastMove.direction }}</dd>
          <dt class="text-muted">Decided by</dt>
          <dd class="font-mono">
            {{ DECIDED_BY[lastMove.decidedBy] }}
          </dd>
          <dt class="text-muted">Latency</dt>
          <dd class="font-mono tabular-nums">
            {{ lastMove.latencyMs === null ? "--" : `${lastMove.latencyMs} ms` }}
          </dd>
          <dt v-if="lastMeta?.loadMs" class="text-muted">of which model load</dt>
          <dd v-if="lastMeta?.loadMs" class="font-mono tabular-nums">{{ lastMeta.loadMs }} ms</dd>
          <template v-if="lastMove.decidedBy === 'controller'">
            <dt class="text-muted">Planned ahead</dt>
            <dd class="font-mono tabular-nums">
              {{ lastMove.horizon === 0 ? "no" : `${lastMove.horizon} ticks` }}
            </dd>
            <dt class="text-muted">Arrived</dt>
            <dd class="font-mono tabular-nums">{{ arrival(lastMove.lateness) }}</dd>
          </template>
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

      <details v-if="request" class="group mt-4 rounded-md border border-line">
        <summary
          class="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-muted hover:text-text"
        >
          What was sent to {{ request.model }}
        </summary>
        <div class="flex flex-col gap-3 border-t border-line p-2">
          <section>
            <h4 class="mb-1 text-[11px] text-muted">User — changes every tick</h4>
            <pre class="sent">{{ request.user }}</pre>
          </section>
          <section>
            <h4 class="mb-1 text-[11px] text-muted">Response</h4>
            <pre class="sent">{{ raw }}</pre>
          </section>
          <details>
            <summary class="cursor-pointer text-[11px] text-muted hover:text-text">
              System — identical every tick
            </summary>
            <pre class="sent mt-1">{{ request.system }}</pre>
          </details>
          <details>
            <summary class="cursor-pointer text-[11px] text-muted hover:text-text">
              Schema — direction enum rebuilt each tick
            </summary>
            <pre class="sent mt-1">{{ JSON.stringify(request.schema, null, 2) }}</pre>
          </details>
          <p class="text-[11px] text-muted">
            Plus <code>think: false</code>, <code>temperature: 0</code>, and a
            {{ request.maxTokens ?? "no" }}-token output cap.
          </p>
        </div>
      </details>

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
      Controller made {{ stats.share }}% of the decisions due<template v-if="stats.planned">
        · {{ stats.planned }} ticks straight as planned</template
      ><template v-if="stats.forced"> · {{ stats.forced }} forced by code</template>.
    </p>
  </div>
</template>

<style scoped>
.sent {
  max-height: 14rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 0.375rem;
  background-color: var(--c-bg);
  padding: 0.5rem;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
}
</style>
