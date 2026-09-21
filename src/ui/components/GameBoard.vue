<script setup lang="ts">
import { computed } from "vue";
import type { GameState } from "../../game/types.ts";

const props = defineProps<{ state: GameState }>();

/** Segment index per occupied cell, so the body can fade head to tail. */
const cells = computed(() => {
  const { width, height } = props.state.rules;
  const snake = new Map<number, number>();
  props.state.snake.forEach((p, i) => snake.set(p.row * width + p.col, i));
  const food = new Set(props.state.food.map((p) => p.row * width + p.col));

  return Array.from({ length: width * height }, (_, i) => ({
    key: i,
    segment: snake.get(i),
    food: food.has(i),
  }));
});

const length = computed(() => props.state.snake.length);
</script>

<template>
  <!-- Sizes to whichever of width or height runs out first, so the board
       never pushes the rest of the page below the fold. -->
  <div class="stage" :style="{ '--cols': state.rules.width, '--rows': state.rules.height }">
    <div class="fit">
      <div
        class="board"
        role="img"
        :aria-label="`Snake, length ${length}, ${state.foodEaten} food eaten`"
      >
        <div
          v-for="cell in cells"
          :key="cell.key"
          class="cell"
          :class="{ 'cell--food': cell.food }"
          :style="
            cell.segment === undefined
              ? undefined
              : { '--t': length < 2 ? 0 : cell.segment / (length - 1) }
          "
          :data-snake="cell.segment === undefined ? undefined : ''"
        ></div>
      </div>
      <slot name="overlay" />
    </div>
  </div>
</template>

<style scoped>
/* The board is the one place where styling is computed rather than chosen,
   so it uses real CSS rather than utility classes (ADR-0004). */
/* A size container, so the board can measure against BOTH axes. */
.stage {
  container-type: size;
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: 100%;
}

/*
 * aspect-ratio alone is not enough here. With a definite `height: 100%`, a
 * `max-width` cap shrinks the width without shrinking the height, so the
 * ratio breaks and the cells stretch. Deriving the width from whichever axis
 * is scarcer keeps it exact.
 */
.fit {
  position: relative;
  aspect-ratio: var(--cols) / var(--rows);
  inline-size: min(100cqw, calc(100cqh * var(--cols) / var(--rows)));
}

.board {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 1px;
  padding: 1px;
  border-radius: 0.5rem;
  border: 1px solid var(--c-line);
  background-color: var(--c-panel);
}

.cell {
  border-radius: 2px;
  background-color: var(--c-cell);
}

/* Head to tail, interpolated in oklab so the fade stays even. */
.cell[data-snake] {
  background-color: color-mix(
    in oklab,
    var(--c-snake-head),
    var(--c-snake-tail) calc(var(--t) * 100%)
  );
}

.cell--food {
  background-color: var(--c-food);
  border-radius: 50%;
}

@media (prefers-reduced-motion: no-preference) {
  .cell {
    transition: background-color 90ms linear;
  }
}
</style>
