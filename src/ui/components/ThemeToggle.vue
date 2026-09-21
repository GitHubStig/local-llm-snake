<script setup lang="ts">
import { useColorMode } from "@vueuse/core";
import Icon from "./Icon.vue";
import type { IconName } from "../icons.ts";

/** Three-state, defaulting to the OS. The pre-paint script in index.html
 *  applies the stored choice before Vue mounts (ADR-0011). */
const mode = useColorMode({ storageKey: "theme", emitAuto: true });

const options: {
  value: "light" | "dark" | "auto";
  icon: IconName;
  label: string;
}[] = [
  { value: "light", icon: "sun", label: "Light theme" },
  { value: "dark", icon: "moon", label: "Dark theme" },
  { value: "auto", icon: "monitor", label: "Match system theme" },
];
</script>

<template>
  <div class="flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="rounded-md p-1.5 transition-colors"
      :class="mode === option.value ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'"
      :aria-pressed="mode === option.value"
      @click="mode = option.value"
    >
      <Icon :name="option.icon" :label="option.label" />
    </button>
  </div>
</template>
