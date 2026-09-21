<script setup lang="ts">
import { computed } from "vue";
import { useEventListener } from "@vueuse/core";

import ControlBar from "./components/ControlBar.vue";
import GameBoard from "./components/GameBoard.vue";
import StatTile from "./components/StatTile.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { useGame } from "./useGame.ts";
import type { Direction } from "../game/types.ts";

const { state, stats, lastMove, press, toggle } = useGame();

const KEYS: Record<string, Direction> = {
  ArrowUp: "north",
  ArrowRight: "east",
  ArrowDown: "south",
  ArrowLeft: "west",
  w: "north",
  d: "east",
  s: "south",
  a: "west",
};

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === " ") {
    event.preventDefault();
    toggle();
    return;
  }
  const direction = KEYS[event.key];
  if (direction) {
    event.preventDefault();
    press(direction);
  }
});

const outcome = computed(() => {
  switch (state.value.outcome) {
    case "crashed":
      return "Crashed";
    case "starved":
      return "Starved";
    case "won":
      return "Filled the board";
    default:
      return null;
  }
});
</script>

<template>
  <!-- One viewport-tall frame. It only scrolls when the content genuinely
       cannot fit: a zoomed-in page, or a very short window. -->
  <div class="h-dvh overflow-auto">
    <div class="mx-auto flex h-full min-h-[34rem] max-w-6xl flex-col gap-4 px-4 py-4">
      <header class="flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 class="text-lg font-semibold">Snake playground</h1>
          <p class="text-sm text-muted">Arrow keys or WASD to drive, space to pause.</p>
        </div>
        <ThemeToggle />
      </header>

      <!-- Stacked, the board takes the flexible row and the panel sizes to its
           content; side by side, they share one row. -->
      <div
        class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1"
      >
        <section class="flex min-h-0 flex-col gap-3">
          <ControlBar class="shrink-0" />

          <!-- min-h-0 lets this shrink below its content, which is what
               allows the board to size itself rather than overflow. -->
          <div class="min-h-0 flex-1">
            <GameBoard :state="state">
              <template #overlay>
                <div
                  v-if="outcome"
                  class="absolute inset-0 grid place-items-center rounded-lg bg-bg/70 backdrop-blur-[2px]"
                >
                  <span
                    class="rounded-md border border-line bg-panel px-4 py-2 text-sm font-medium"
                  >
                    {{ outcome }}
                  </span>
                </div>
              </template>
            </GameBoard>
          </div>

          <div class="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5">
            <StatTile label="Food" :value="stats.food" />
            <StatTile label="Steps" :value="stats.steps" />
            <StatTile label="Length" :value="stats.length" />
            <StatTile label="Steps per food" :value="stats.stepsPerFood" />
            <StatTile label="Controller share" :value="`${stats.share}%`" />
          </div>
        </section>

        <aside class="flex min-h-0 flex-col rounded-lg border border-line bg-panel p-4">
          <h2 class="shrink-0 text-sm font-medium">This step's decision</h2>

          <div class="min-h-0 flex-1 overflow-auto">
            <p v-if="!lastMove" class="mt-2 text-sm text-muted">
              Nothing yet. Press play, or take a step.
            </p>
            <dl v-else class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
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
              <dt class="text-muted">Staleness</dt>
              <dd class="font-mono tabular-nums">{{ lastMove.staleness }}</dd>
            </dl>
          </div>

          <p class="mt-3 shrink-0 border-t border-line pt-3 text-xs text-muted">
            The AI half lands here next: provider and model pickers, the prompt actually sent, and
            per-direction scoring.
          </p>
        </aside>
      </div>
    </div>
  </div>
</template>
