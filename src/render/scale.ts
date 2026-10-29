/**
 * Display scales for quantities that span decades (pure, no Three.js / DOM).
 *
 * `niceCeil` rounds up to the 1-2-5 series (like the ranges of a lab meter);
 * `autoRange` is the range switch of an auto-ranging instrument: it goes up at
 * once when the held peak exceeds the full scale and down only when the peak
 * falls well below it (hysteresis), so the scale does not flicker.
 * Used by the galvanometer (lenz) and the energy-ribbon scale (alternator-motor).
 */

const STEPS = [1, 2, 5, 10] as const;

/** Smallest value of the 1-2-5 × 10ᵏ series that is ≥ x (x ≤ 0 or non-finite → `floor`). */
export function niceCeil(x: number, floor = 0): number {
  if (!(x > 0) || !Number.isFinite(x)) return floor;
  const e = Math.floor(Math.log10(x));
  const base = Math.pow(10, e);
  const m = x / base;
  // tolerance: 2.0000000001 is still "2"
  const step = STEPS.find((s) => m <= s * (1 + 1e-9)) ?? 10;
  return Math.max(floor, step * base);
}

/** Below this fraction of the full scale the range switches down. */
export const RANGE_DOWN_FRACTION = 0.3;

/**
 * Next full-scale value of an auto-ranging display.
 * @param range - current full scale (> 0)
 * @param peak - held peak |x| (≥ 0)
 * @param floor - smallest allowed full scale (> 0)
 */
export function autoRange(range: number, peak: number, floor: number): number {
  const p = Math.abs(peak);
  if (!(range >= floor) || p > range) return niceCeil(p, floor);
  if (p < RANGE_DOWN_FRACTION * range) return niceCeil(p / 0.8, floor);
  return range;
}

/**
 * Peak hold with exponential release: max(|x|, peak · e^(−dt/τ)).
 * @param tau - release time constant [s]
 */
export function holdPeak(peak: number, x: number, dt: number, tau: number): number {
  return Math.max(Math.abs(x), peak * Math.exp(-dt / tau));
}
