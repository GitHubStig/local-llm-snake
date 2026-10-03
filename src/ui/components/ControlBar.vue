<script setup lang="ts">
import { releaseFocus } from "../focus.ts";
import { computed } from "vue";
import { SPEEDS, type Speed } from "../../game/runner.ts";
import FieldLabel from "./FieldLabel.vue";
import Icon from "./Icon.vue";
import ModelPicker from "./ModelPicker.vue";
import { useGame } from "../useGame.ts";
import { useProviders } from "../useProviders.ts";

const {
  seed,
  speed,
  running,
  loadingModel,
  loadError,
  state,
  newGame,
  toggle,
  stepOnce,
  setSpeed,
} = useGame();
const { entries, online, loading } = useProviders();

/** "Normal · 400 ms" — the tick interval is what a model's latency races against. */
const speeds = (Object.keys(SPEEDS) as Speed[]).map((value) => ({
  value,
  label: `${value[0].toUpperCase()}${value.slice(1)} · ${SPEEDS[value]} ms`,
}));

/** One line under the bar, so a hint never shifts the fields out of line. */
const hint = computed(() => {
  if (loadError.value) return `${loadError.value} Is Ollama running?`;
  if (loadingModel.value) return "Loading the model. The game starts when it is ready.";
  if (loading.value) return null;
  if (!entries.value.length) return "No models found. Is Ollama running?";
  if (online.value.apple === false) return "Start fm serve to use Apple models.";
  return null;
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <FieldLabel text="Seed" />
        <input
          :value="seed"
          type="number"
          class="field h-9 w-28 font-mono tabular-nums"
          @change="
            newGame(Number(($event.target as HTMLInputElement).value));
            releaseFocus($event);
          "
        />
      </label>

      <ModelPicker />

      <label class="flex flex-col gap-1">
        <FieldLabel text="Speed" />
        <select
          :value="speed"
          class="field h-9 w-40 tabular-nums"
          @change="
            setSpeed(($event.target as HTMLSelectElement).value as Speed);
            releaseFocus($event);
          "
        >
          <option v-for="option in speeds" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <div class="flex items-end gap-2">
        <button
          type="button"
          class="field inline-flex h-9 items-center gap-2 bg-accent font-medium text-bg"
          @click="newGame()"
        >
          <Icon name="restart" />
          New game
        </button>
        <button
          type="button"
          class="field inline-flex h-9 items-center gap-2 disabled:opacity-40"
          :disabled="state.outcome !== null"
          @click="toggle()"
        >
          <Icon :name="running ? 'pause' : 'play'" :class="{ 'animate-pulse': loadingModel }" />
          {{ running ? "Pause" : loadingModel ? "Loading…" : "Play" }}
        </button>
        <button
          type="button"
          class="field inline-flex h-9 items-center gap-2 disabled:opacity-40"
          :disabled="state.outcome !== null"
          @click="stepOnce()"
        >
          <Icon name="step" />
          Step
        </button>
      </div>
    </div>

    <p v-if="hint" class="text-[11px] leading-4 text-muted">{{ hint }}</p>
  </div>
</template>
