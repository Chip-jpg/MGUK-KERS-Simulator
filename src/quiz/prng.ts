/**
 * Deterministic PRNG for the quiz (mulberry32). Numeric questions are sampled
 * from a seed, so tests can reproduce every generated question exactly.
 */
export type Rng = () => number;

/** mulberry32: 32-bit state, uniform floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [lo, hi] (inclusive). */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Value on the grid lo, lo+step, …, ≤ hi. The result is rounded to the step's
 * decimals so that the printed prompt value equals the value used in `solve`.
 */
export function pickGrid(rng: Rng, lo: number, hi: number, step: number): number {
  const n = Math.floor((hi - lo) / step + 1e-9);
  const k = randInt(rng, 0, n);
  return roundTo(lo + k * step, decimalsOf(step));
}

/** One element of a non-empty list. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new RangeError('pickOne: empty list');
  return item;
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function decimalsOf(step: number): number {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Round to `d` decimals, removing binary noise (0.1 + 0.2 → 0.3). */
export function roundTo(x: number, d: number): number {
  return Number(x.toFixed(Math.min(20, Math.max(0, d))));
}
