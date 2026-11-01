/**
 * Analytic y-ranges for plots (fix round 1, F6). Pure helpers that never
 * return NaN, ±∞ or a zero-width range, whatever the input: non-finite inputs
 * are replaced by safe defaults instead of throwing, because they come straight
 * from sliders and must never break a plot.
 */

/** Default relative margin added around an analytic amplitude [-] (10 %). */
export const PLOT_RANGE_MARGIN = 0.1;

/** Default minimum half-span of a range [same unit as the data]. */
export const PLOT_MIN_HALF_SPAN = 1e-9;

/** Largest magnitude a range bound may take (keeps spans finite). */
const MAX_ABS = 1e300;

function clampFinite(x: number, fallback: number): number {
  if (Number.isNaN(x)) return fallback;
  if (x > MAX_ABS) return MAX_ABS;
  if (x < -MAX_ABS) return -MAX_ABS;
  return x;
}

function cleanPositive(x: number | undefined, fallback: number): number {
  if (x === undefined || !Number.isFinite(x) || x <= 0) return fallback;
  return Math.min(x, MAX_ABS);
}

/**
 * Symmetric range around 0 for a signal of known amplitude.
 *
 * h = max(|A|·(1 + margin), minHalfSpan);  range = [−h, h]
 *
 * NaN amplitude counts as 0; ±∞ is clamped to 1e300. A non-finite or negative
 * margin counts as 0; a non-finite or non-positive minHalfSpan falls back to
 * {@link PLOT_MIN_HALF_SPAN}.
 *
 * @param amplitude - peak value |A| of the signal [any unit]
 * @param margin - relative margin [-], default {@link PLOT_RANGE_MARGIN}
 * @param minHalfSpan - minimum half-span [same unit], default {@link PLOT_MIN_HALF_SPAN}
 * @returns `[−h, h]`, finite, h > 0
 * @slide none (extension: plotting helper)
 */
export function symmetricRange(
  amplitude: number,
  margin: number = PLOT_RANGE_MARGIN,
  minHalfSpan: number = PLOT_MIN_HALF_SPAN,
): [number, number] {
  const a = Math.abs(clampFinite(amplitude, 0));
  const mg = Number.isFinite(margin) && margin > 0 ? Math.min(margin, 1e6) : 0;
  const minH = cleanPositive(minHalfSpan, PLOT_MIN_HALF_SPAN);
  const h = Math.min(MAX_ABS, Math.max(a * (1 + mg), minH));
  return [-h, h];
}

/**
 * Sanitised [min, max] range.
 *
 * Swaps reversed bounds, replaces NaN by the other bound (or 0), clamps ±∞ to
 * ±1e300, and widens a range narrower than `minSpan` symmetrically around its
 * centre: span' = max(max − min, minSpan, 1e-12·|centre|).
 *
 * @param min - lower bound [any unit]
 * @param max - upper bound [same unit]
 * @param minSpan - minimum width [same unit], default 2·{@link PLOT_MIN_HALF_SPAN}
 * @returns `[lo, hi]` with finite lo < hi
 * @slide none (extension: plotting helper)
 */
export function safeRange(
  min: number,
  max: number,
  minSpan: number = 2 * PLOT_MIN_HALF_SPAN,
): [number, number] {
  let lo = Number.isNaN(min) ? (Number.isNaN(max) ? 0 : max) : min;
  let hi = Number.isNaN(max) ? lo : max;
  lo = clampFinite(lo, 0);
  hi = clampFinite(hi, 0);
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = cleanPositive(minSpan, 2 * PLOT_MIN_HALF_SPAN);
  const centre = lo / 2 + hi / 2;
  // relative floor ≫ 1 ulp of the centre, so the widened bounds stay distinct;
  // |centre| ≤ 1e300 keeps centre ± need/2 finite
  const need = Math.max(span, 1e-12 * Math.abs(centre));
  if (hi - lo < need) {
    lo = centre - need / 2;
    hi = centre + need / 2;
  }
  return [lo, hi];
}

/**
 * Analytic plot ranges of the rotating-coil simulator (faraday): the flux is
 * plotted through ONE turn, Φ = B·S·cos(ωt), and the emf of the N-turn coil,
 * e = N·B·S·ω·sin(ωt).
 *
 * phi = symmetricRange(|B·S|, margin);  emf = symmetricRange(|N·B·S·ω|, margin)
 *
 * With B = 0 or ω = 0 (flat signal) the range falls back to a small finite
 * half-span: 1e-9 Wb for Φ; for the emf max(1e-9 V, 10⁻³·N·B·S·(1 rad/s)), so
 * that with B·S ≠ 0 and ω → 0 the axis does not collapse to nanovolts.
 * Non-finite inputs count as 0 (±∞ clamped to 1e300).
 *
 * @param B - field [T]
 * @param S - loop area [m²]
 * @param N - turns [-]
 * @param omega - angular speed [rad/s]
 * @param margin - relative margin [-], default {@link PLOT_RANGE_MARGIN}
 * @returns `phi` [Wb] and `emf` [V] ranges, finite, non-zero width
 * @slide 18, 19 (rotating loop, as `rotatingLoop`); plotting helper
 */
export function faradayRanges(
  B: number,
  S: number,
  N: number,
  omega: number,
  margin: number = PLOT_RANGE_MARGIN,
): { phi: [number, number]; emf: [number, number] } {
  const c = (x: number): number => Math.abs(clampFinite(x, 0));
  const bs = Math.min(MAX_ABS, c(B) * c(S));
  const nbs = Math.min(MAX_ABS, c(N) * bs);
  const w = c(omega);
  const emfAmp = Math.min(MAX_ABS, nbs * w);
  const phi = symmetricRange(bs, margin);
  const emfFloor = Math.max(PLOT_MIN_HALF_SPAN, nbs * 1e-3);
  const emf = symmetricRange(emfAmp, margin, emfFloor);
  return { phi, emf };
}
