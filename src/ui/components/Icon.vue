<script setup lang="ts">
import { ICONS, type IconName } from "../icons.ts";

/**
 * An icon from assets/icons, drawn in the current text colour. Decorative by
 * default; pass `label` when the icon alone carries meaning.
 */
withDefaults(defineProps<{ name: IconName; size?: number; label?: string }>(), {
  size: 16,
});
</script>

<template>
  <!-- Our own committed files, never user content, so v-html is safe here. -->
  <span
    class="inline-flex shrink-0 [&>svg]:block [&>svg]:size-full"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="ICONS[name]"
  ></span>
</template>
