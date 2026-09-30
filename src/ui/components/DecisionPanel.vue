<script setup lang="ts">
import { releaseFocus } from "../focus.ts";
import { computed } from "vue";
import { useGame } from "../useGame.ts";

const {
  lastMove,
  lastDecision,
  inFlightSince,
  failures,
  driver,
  isDecisionModel,
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

/** The model's last decision's attachments, which stay put between decisions. */
const meta = computed(() => lastDecision.value?.meta ?? null);
const why = computed(() => (meta.value?.why as string | null) ?? null);

type SentRequest =
  | {
      kind?: undefined;
      model: string;
      system: string;
      user: string;
      schema: Record<string, unknown>;
      maxTokens?: number;
    }
  | {
      kind: "decision";
      model: string;
      state: Record<string, unknown>;
      instructions: string;
      criteria: Record<string, string>;
    };
const request = computed(() => (meta.value?.request as SentRequest | undefined) ?? null);

/**
 * A decision model's probability for each option, highest first. Chat models
 * give none, so the row reads as a dash for them.
 */
const probabilities = computed(() => {
  const p = meta.value?.probabilities as Record<string, number> | undefined;
  if (!p) return null;
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => `${name} ${Math.round(v * 100)}%`)
    .join(" · ");
});
const whyPlaceholder = computed(() => {
  if (isDecisionModel.value || request.value?.kind === "decision")
    return "A decision model gives probabilities, not reasons.";
  return settings.value.includeWhy ? "No reason yet." : "Not asked for a reason.";
});
const confidence = computed(() => {
  const c = meta.value?.confidence;
  return typeof c === "number" ? `${Math.round(c * 100)}%` : dash;
});
const raw = computed(() => (meta.value?.raw as string | undefined) ?? null);

/** Rare warnings, joined into one line of fixed height so they never shift anything. */
const notes = computed(() =>
  [
    meta.value?.truncated === true && "evaluated fewer prompt tokens than were sent: it truncated",
    meta.value?.source === "thinking" && "answer arrived in message.thinking, content empty",
  ]
    .filter(Boolean)
    .join(" · "),
);

const dash = "—";
const ms = (v: unknown) => (typeof v === "number" ? `${v} ms` : dash);

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
    <!-- Left-aligned, each box beside the first line of its label, so the boxes
         line up however the labels wrap. -->
    <div class="flex shrink-0 flex-col gap-1.5 text-[11px] leading-4 text-muted">
      <label class="flex items-start gap-1.5">
        <input
          type="checkbox"
          class="mt-0.5 shrink-0"
          :checked="project"
          @change="
            setProjection(($event.target as HTMLInputElement).checked);
            releaseFocus($event);
          "
        />
        <span>Plan ahead for the model's latency</span>
      </label>
      <label
        class="flex items-start gap-1.5"
        :class="isDecisionModel ? 'cursor-not-allowed opacity-50' : ''"
        :title="
          isDecisionModel
            ? 'Decision models answer with probabilities, never text, so they cannot give a reason'
            : undefined
        "
      >
        <input
          type="checkbox"
          class="mt-0.5 shrink-0 disabled:cursor-not-allowed"
          :checked="settings.includeWhy && !isDecisionModel"
          :disabled="isDecisionModel"
          @change="
            setSettings({ includeWhy: ($event.target as HTMLInputElement).checked });
            releaseFocus($event);
          "
        />
        <span>Ask why — after the answer, so it never changes the move</span>
      </label>
    </div>

    <div class="flex shrink-0 items-center justify-between gap-2">
      <h2 class="text-sm font-medium">Decisions</h2>
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

    <!-- Every row below is always rendered; only values change. Rows that came
         and went with each tick made everything under them jump. -->
    <div class="min-h-0 flex-1 overflow-auto">
      <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt class="text-muted">This tick</dt>
        <dd class="truncate font-mono">{{ lastMove?.direction ?? dash }}</dd>
        <dt class="text-muted">Decided by</dt>
        <dd class="truncate">{{ lastMove ? DECIDED_BY[lastMove.decidedBy] : dash }}</dd>
      </dl>

      <h3 class="mt-4 text-xs font-medium text-muted">The model's last decision</h3>
      <dl class="mt-1.5 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt class="text-muted">Direction</dt>
        <dd class="truncate font-mono">{{ lastDecision?.direction ?? dash }}</dd>
        <dt class="text-muted">Latency</dt>
        <dd class="truncate font-mono tabular-nums">{{ ms(lastDecision?.latencyMs) }}</dd>
        <dt class="text-muted">of which model load</dt>
        <dd class="truncate font-mono tabular-nums">{{ ms(meta?.loadMs) }}</dd>
        <dt class="text-muted">Planned ahead</dt>
        <dd class="truncate font-mono tabular-nums">
          {{
            lastDecision
              ? lastDecision.horizon === 0
                ? "no"
                : `${lastDecision.horizon} ticks`
              : dash
          }}
        </dd>
        <dt class="text-muted">Arrived</dt>
        <dd class="truncate font-mono tabular-nums">
          {{ lastDecision ? arrival(lastDecision.lateness) : dash }}
        </dd>
        <dt class="text-muted">Prompt tokens</dt>
        <dd class="truncate font-mono tabular-nums">
          <template v-if="typeof meta?.promptTokens === 'number'">
            {{ meta.promptTokens }}
            <span v-if="typeof meta.cachedPromptTokens === 'number'" class="text-muted"
              >({{ meta.cachedPromptTokens }} cached)</span
            >
          </template>
          <template v-else>{{ dash }}</template>
        </dd>
        <dt class="text-muted">Confidence</dt>
        <dd class="truncate font-mono tabular-nums">{{ confidence }}</dd>
      </dl>

      <!-- One line whatever the model: a decision model's probabilities are too
           long for the value column, and a chat model has none. -->
      <p class="mt-2 text-sm text-muted">Probabilities</p>
      <p class="mt-1 truncate font-mono text-sm tabular-nums" :title="probabilities ?? undefined">
        {{ probabilities ?? dash }}
      </p>

      <!-- Fixed at three lines: reasons vary in length, and a box that grew and
           shrank with them moved everything below. -->
      <p
        class="mt-3 line-clamp-3 h-[4.625rem] overflow-hidden rounded-md border border-line px-2 py-1.5 text-sm"
        :class="why ? '' : 'text-muted'"
        :title="why ?? undefined"
      >
        {{ why ?? whyPlaceholder }}
      </p>
      <p class="mt-1 h-4 truncate text-xs text-food" :title="notes || undefined">{{ notes }}</p>

      <h3 class="mt-4 text-xs font-medium text-muted">Why moves were not decided</h3>
      <dl class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <template v-for="(count, kind) in failures" :key="kind">
          <dt class="text-muted">{{ FAILURE_LABEL[kind] ?? kind }}</dt>
          <dd class="font-mono tabular-nums" :class="count > 0 ? 'text-text' : 'text-muted'">
            {{ count }}
          </dd>
        </template>
      </dl>

      <!-- Last, because it is the one block whose height varies. -->
      <details v-if="request" class="group mt-4 rounded-md border border-line">
        <summary
          class="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-muted hover:text-text"
        >
          What was sent to {{ request.model }}
        </summary>
        <div
          v-if="request.kind === 'decision'"
          class="flex flex-col gap-3 border-t border-line p-2"
        >
          <section>
            <h4 class="mb-1 text-[11px] text-muted">Options — changes every tick</h4>
            <pre class="sent">{{ JSON.stringify(request.criteria, null, 2) }}</pre>
          </section>
          <section>
            <h4 class="mb-1 text-[11px] text-muted">Response</h4>
            <pre class="sent">{{ raw }}</pre>
          </section>
          <details>
            <summary class="cursor-pointer text-[11px] text-muted hover:text-text">
              State — changes every tick
            </summary>
            <pre class="sent mt-1">{{ JSON.stringify(request.state, null, 2) }}</pre>
          </details>
          <details>
            <summary class="cursor-pointer text-[11px] text-muted hover:text-text">
              Instructions — identical every tick
            </summary>
            <pre class="sent mt-1">{{ request.instructions }}</pre>
          </details>
          <p class="text-[11px] text-muted">
            Sent to Ollama's <code>/v1/systemone</code> as one <code>choice</code> question.
          </p>
        </div>
        <div v-else class="flex flex-col gap-3 border-t border-line p-2">
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
