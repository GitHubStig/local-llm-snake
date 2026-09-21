<script setup lang="ts">
defineProps<{ label: string; value: string | number; hint?: string }>();
</script>

<template>
  <div class="rounded-lg border border-line bg-panel px-3 py-2">
    <div class="text-[11px] text-muted">{{ label }}</div>
    <div class="font-mono text-xl tabular-nums">{{ value }}</div>
    <div v-if="hint" class="font-mono text-[11px] text-muted">{{ hint }}</div>
  </div>
</template>
