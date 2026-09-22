/**
 * Hand the keyboard back to the game once a control has done its job.
 *
 * The game ignores keys while a form control has focus, so that typing a seed
 * does not steer the snake. But a dropdown keeps focus after you pick from it,
 * and then the arrow keys go on changing its value instead of steering: you
 * turn, and the speed changes while the snake drives into the wall.
 */
export function releaseFocus(event: Event): void {
  (event.target as HTMLElement | null)?.blur();
}
