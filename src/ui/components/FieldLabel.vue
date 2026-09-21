<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <span class="text-[11px] leading-4 text-muted">{{ text }}</span>
</template>
