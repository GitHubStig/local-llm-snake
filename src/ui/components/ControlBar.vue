<script setup lang="ts">
import { SPEEDS, type Speed } from "../../game/runner.ts";
import Icon from "./Icon.vue";
import { useGame } from "../useGame.ts";

const { seed, speed, running, state, newGame, toggle, stepOnce, setSpeed } = useGame();

const speeds = Object.keys(SPEEDS) as Speed[];
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-[11px] text-muted">Seed</span>
      <input
        :value="seed"
        type="number"
        class="w-28 rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-sm tabular-nums"
        @change="newGame(Number(($event.target as HTMLInputElement).value))"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-[11px] text-muted">Speed</span>
      <select
        :value="speed"
        class="rounded-md border border-line bg-panel px-2 py-1.5 text-sm capitalize"
        @change="setSpeed(($event.target as HTMLSelectElement).value as Speed)"
      >
        <option v-for="option in speeds" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
    </label>

    <button
      type="button"
      class="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg"
      @click="newGame()"
    >
      <Icon name="restart" />
      New game
    </button>

    <button
      type="button"
      class="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm disabled:opacity-40"
      :disabled="state.outcome !== null"
      @click="toggle()"
    >
      <Icon :name="running ? 'pause' : 'play'" />
      {{ running ? "Pause" : "Play" }}
    </button>

    <button
      type="button"
      class="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm disabled:opacity-40"
      :disabled="state.outcome !== null"
      @click="stepOnce()"
    >
      <Icon name="step" />
      Step
    </button>
  </div>
</template>
