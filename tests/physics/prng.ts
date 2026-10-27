/**
 * Deterministic PRNG (mulberry32) for property tests: reproducible random
 * parameter sets without extra dependencies.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform sample in [lo, hi) from `rnd`. */
export function uniform(rnd: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rnd();
}

/** Trapezoidal integral of y over x. */
export function trapz(x: readonly number[], y: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < x.length; i++) {
    s +=
      0.5 * ((y[i] as number) + (y[i - 1] as number)) * ((x[i] as number) - (x[i - 1] as number));
  }
  return s;
}
