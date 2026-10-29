/**
 * Display scale of the force arrows of the `car-dynamics` scene (pure, testable).
 * Forces span two decades (≈ 0,5 kN of drag at low speed … ≈ 40 kN of tyre force),
 * so arrow lengths are LOGARITHMIC: L = ARROW_K · log₁₀(1 + F / F_REF).
 * Stated in the scene legend: 1 kN → 0,27 m, 10 kN → 0,94 m, 40 kN → 1,45 m.
 */

/** Reference force of the log scale [N]. */
export const ARROW_F_REF = 1000;
/** Length per decade [m]. */
export const ARROW_K = 0.9;
/** Longest arrow drawn [m]. */
export const ARROW_MAX = 2.2;

/** Arrow length for a force magnitude [m] (0 for no force, capped at {@link ARROW_MAX}). */
export function arrowLength(force: number): number {
  if (!(force > 0)) return 0;
  return Math.min(ARROW_MAX, ARROW_K * Math.log10(1 + force / ARROW_F_REF));
}

/** Legend ticks (force [N] → length [m]). */
export const ARROW_LEGEND = [1e3, 10e3, 40e3].map((f) => ({ f, len: arrowLength(f) }));
