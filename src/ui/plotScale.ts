/**
 * Pure y-range helpers of the plot wrapper (F6), testable without uPlot / DOM.
 *
 * - {@link sanitizeRange}: a range is never NaN / ±∞ / inverted / zero-width.
 * - {@link stepRange}: rate-limited approach of the shown range to a target
 *   (exponential, time constant {@link RANGE_TAU_MS}; ~300 ms to settle), so a new
 *   analytic range never jumps in one frame and an expanding signal is followed fast.
 */

export type Range = readonly [number, number];

/** Fallback range when nothing usable is known. */
export const DEFAULT_RANGE: [number, number] = [-1, 1];
/** Time constant of the range smoothing [ms] (95 % settled after 3τ ≈ 300 ms). */
export const RANGE_TAU_MS = 100;
/** Relative distance (of the target span) under which the range snaps to the target. */
export const RANGE_SNAP = 0.002;

/**
 * Make a range safe to draw: finite, ordered, with a non-zero span.
 * A degenerate range [c, c] becomes c ± max(|c|·10 %, minHalfSpan) (a flat signal sits
 * in the middle with readable ticks); NaN / ∞ ends fall back to `fallback`.
 */
export function sanitizeRange(
  r: readonly [number, number] | null | undefined,
  fallback: Range = DEFAULT_RANGE,
  minHalfSpan = 1e-12,
): [number, number] {
  const finite = (
    x: readonly [number, number] | null | undefined,
  ): x is readonly [number, number] => !!x && Number.isFinite(x[0]) && Number.isFinite(x[1]);
  const src = finite(r) ? r : finite(fallback) ? fallback : DEFAULT_RANGE;
  let lo = src[0];
  let hi = src[1];
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = hi - lo;
  const mag = Math.max(Math.abs(lo), Math.abs(hi));
  // Zero (or float-noise) span: open it around the centre.
  if (!(span > mag * 1e-9) || span < minHalfSpan * 2) {
    const c = (lo + hi) / 2;
    const h = Math.max(Math.abs(c) * 0.1, minHalfSpan, c === 0 ? 1 : 0);
    return [c - h, c + h];
  }
  return [lo, hi];
}

/** True when `a` is within the snap tolerance of `b`. */
export function rangesClose(a: Range, b: Range, rel = RANGE_SNAP): boolean {
  const tol = Math.abs(b[1] - b[0]) * rel;
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

/**
 * Advance the shown range `current` toward `target` after `dtMs` milliseconds:
 * exponential approach with time constant `tauMs`, snapping when close. Never
 * returns NaN / ∞ / zero width (both inputs are sanitised first). `current` null →
 * the target itself (first draw). dtMs is clamped to [0, 1000].
 */
export function stepRange(
  current: Range | null,
  target: Range,
  dtMs: number,
  tauMs = RANGE_TAU_MS,
): [number, number] {
  const tgt = sanitizeRange(target);
  if (!current) return tgt;
  const cur = sanitizeRange(current, tgt);
  const dt = Number.isFinite(dtMs) ? Math.min(1000, Math.max(0, dtMs)) : 0;
  const k = tauMs > 0 ? 1 - Math.exp(-dt / tauMs) : 1;
  const next: [number, number] = [cur[0] + (tgt[0] - cur[0]) * k, cur[1] + (tgt[1] - cur[1]) * k];
  return rangesClose(next, tgt) ? tgt : sanitizeRange(next, tgt);
}

/**
 * Padded auto range of a data window [min, max] (5 % margin), sanitised. NaN ends
 * (no data) give the fallback.
 */
export function paddedRange(
  min: number,
  max: number,
  margin = 0.05,
  fallback: Range = DEFAULT_RANGE,
): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return sanitizeRange(fallback);
  const pad = (max - min) * margin;
  return sanitizeRange([min - pad, max + pad], fallback);
}

const NICE_MANTISSAS = [1, 2, 2.5, 5];

/** Smallest nice step (1, 2, 2,5, 5 × 10ⁿ) ≥ x. */
function niceStepAtLeast(x: number): number {
  const e = 10 ** Math.floor(Math.log10(x));
  for (const m of NICE_MANTISSAS) if (m * e >= x * (1 - 1e-9)) return m * e;
  return 10 * e;
}

/** The nice step just below `step`. */
function smallerNiceStep(step: number): number {
  const e = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const m = step / e;
  const idx = NICE_MANTISSAS.findIndex((v) => Math.abs(v - m) < 1e-6);
  return idx > 0 ? (NICE_MANTISSAS[idx - 1] as number) * e : 5 * (e / 10);
}

/**
 * Tick values for an axis over [min, max]: a nice step (1, 2, 2,5, 5 × 10ⁿ) giving at most
 * `maxTicks` ticks, refined until at least two ticks fall inside the range — so every
 * y axis is always labelled (uPlot's default can leave a single tick when the range is
 * not aligned to its increments, e.g. [32, 1966] → only "1000").
 */
export function niceTicks(min: number, max: number, maxTicks: number): number[] {
  const [lo, hi] = sanitizeRange([min, max]);
  const span = hi - lo;
  let step = niceStepAtLeast(span / Math.max(1, Math.floor(maxTicks)));
  for (let guard = 0; guard < 8; guard++) {
    const first = Math.ceil(lo / step - 1e-9) * step;
    const ticks: number[] = [];
    for (let k = 0; ticks.length < 100; k++) {
      const v = first + k * step;
      if (v > hi + step * 1e-9) break;
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
    }
    if (ticks.length >= 2) return ticks;
    step = smallerNiceStep(step);
  }
  return [lo, hi];
}
