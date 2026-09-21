/**
 * Mulberry32. Small, fast, and good enough for food placement.
 *
 * The cursor is a plain number so it can live inside game state and be copied
 * with it — there is deliberately no hidden generator object (ADR-0002).
 */
export function nextRandom(cursor: number): { value: number; cursor: number } {
  let t = (cursor + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, cursor: t };
}

export function nextInt(cursor: number, bound: number): { value: number; cursor: number } {
  const next = nextRandom(cursor);
  return { value: Math.floor(next.value * bound), cursor: next.cursor };
}

/**
 * Derive independent streams from one master seed, so that a controller's
 * draws can never shift the food sequence (ADR-0002).
 */
export function deriveStreams(seed: number): { food: number; tiebreak: number } {
  return { food: (seed ^ 0x9e3779b9) | 0, tiebreak: (seed ^ 0x85ebca6b) | 0 };
}
