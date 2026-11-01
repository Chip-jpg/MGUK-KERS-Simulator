/**
 * Ideal static transformer, Joule losses and power transmission lines.
 *
 * Validity (ideal transformer): no winding resistance, no leakage flux, no core
 * losses (hysteresis/eddy currents), linear core without saturation, AC
 * quantities expressed as RMS (or amplitude) values consistently on both sides.
 */
import { finite, noNegZero, nonNegative, positive } from './validate';

/**
 * Ideal static transformer, secondary voltage.
 *
 * ΔV₁ / ΔV₂ = N₁ / N₂   ⇒   V₂ = V₁ · N₂ / N₁
 *
 * @param V1 - primary voltage [V]
 * @param N1 - primary turns [-], > 0
 * @param N2 - secondary turns [-], > 0
 * @returns V₂ [V]
 * @throws RangeError if N1 ≤ 0, N2 ≤ 0, or non-finite input
 * @slide 20
 */
export function transformerSecondary(V1: number, N1: number, N2: number): number {
  const fn = 'transformerSecondary';
  finite(fn, 'V1', V1);
  positive(fn, 'N1', N1);
  positive(fn, 'N2', N2);
  return noNegZero((V1 * N2) / N1);
}

/**
 * Ideal transformer, secondary current (power conserved: V₁I₁ = V₂I₂).
 *
 * I₂ = I₁ · N₁ / N₂
 *
 * @param I1 - primary current [A]
 * @param N1 - primary turns [-], > 0
 * @param N2 - secondary turns [-], > 0
 * @returns I₂ [A]
 * @throws RangeError if N1 ≤ 0, N2 ≤ 0, or non-finite input
 * @slide 20 (voltage ratio; the current ratio follows from energy conservation)
 */
export function transformerCurrent(I1: number, N1: number, N2: number): number {
  const fn = 'transformerCurrent';
  finite(fn, 'I1', I1);
  positive(fn, 'N1', N1);
  positive(fn, 'N2', N2);
  return noNegZero((I1 * N1) / N2);
}

/**
 * Joule power dissipated in a resistor.
 *
 * P = R · I²
 *
 * @param R - resistance [Ω], ≥ 0
 * @param I - current [A]
 * @returns power [W], ≥ 0
 * @throws RangeError if R < 0 or non-finite input
 * @slide 16 (the R·i²·Δt term of the energy balance)
 */
export function jouleLoss(R: number, I: number): number {
  const fn = 'jouleLoss';
  nonNegative(fn, 'R', R);
  finite(fn, 'I', I);
  return R * I * I;
}

/**
 * Transmission-line loss when delivering power P at voltage V (purely resistive
 * line, power factor 1, single-phase equivalent).
 *
 * I = P / V,   loss = R_line · I² = R_line · P² / V²,   fraction = loss / P
 *
 * Consequence: at equal P and R_line, 10× voltage ⇒ ÷10 current ⇒ ÷100 loss.
 * P = 0 ⇒ fraction = 0. `fraction` > 1 means the model is outside its validity
 * (the line would dissipate more than it carries).
 *
 * @param P - transmitted power [W], ≥ 0
 * @param V - transmission voltage [V], > 0
 * @param Rline - total line resistance [Ω], ≥ 0
 * @returns `I` [A], `loss` [W], `fraction` [-]
 * @throws RangeError if V ≤ 0, P < 0, Rline < 0, or non-finite input
 * @slide 23 (transport chain plant → step-up → HV line → step-down; slides 21–23)
 */
export function lineLoss(
  P: number,
  V: number,
  Rline: number,
): { I: number; loss: number; fraction: number } {
  const fn = 'lineLoss';
  nonNegative(fn, 'P', P);
  positive(fn, 'V', V);
  nonNegative(fn, 'Rline', Rline);
  const I = P / V;
  const loss = Rline * I * I;
  return { I, loss, fraction: P === 0 ? 0 : loss / P };
}

/**
 * Logarithmically spaced values from a to b (both included), for log axes.
 *
 * x_k = a · (b/a)^(k/(n−1)),  k = 0 … n−1  (x_0 = a and x_{n−1} = b exactly)
 *
 * @param a - first value, > 0
 * @param b - last value, > 0 (may be < a: decreasing sequence)
 * @param n - number of points, integer ≥ 1 (n = 1 ⇒ [a])
 * @returns n values
 * @throws RangeError if a ≤ 0, b ≤ 0, n not an integer ≥ 1, or non-finite input
 * @slide none (extension: plotting helper for the line-loss sweeps, F10)
 */
export function logspace(a: number, b: number, n: number): number[] {
  const fn = 'logspace';
  positive(fn, 'a', a);
  positive(fn, 'b', b);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`${fn}: n must be an integer ≥ 1 (got ${n})`);
  }
  if (n === 1) return [a];
  const step = Math.log(b / a) / (n - 1);
  return Array.from({ length: n }, (_, k) => (k === n - 1 ? b : a * Math.exp(k * step)));
}

/**
 * Line loss vs transmission voltage at fixed P and R_line ({@link lineLoss}
 * evaluated at each voltage).
 *
 * loss(V) = R_line · P² / V²  ⇒  10× V ⇒ loss ÷ 100
 *
 * @param P - transmitted power [W], ≥ 0
 * @param Rline - total line resistance [Ω], ≥ 0
 * @param voltages - transmission voltages [V], each > 0
 * @returns one `{ V, I, loss, fraction }` per voltage (same order)
 * @throws RangeError as {@link lineLoss}
 * @slide 23 (transport chain; slides 21–23)
 */
export function lineLossSweep(
  P: number,
  Rline: number,
  voltages: readonly number[],
): Array<{ V: number; I: number; loss: number; fraction: number }> {
  return voltages.map((V) => ({ V, ...lineLoss(P, V, Rline) }));
}

/**
 * Line loss vs line resistance at fixed P and V: loss(R) = R · P² / V²
 * (linear in R).
 *
 * @param P - transmitted power [W], ≥ 0
 * @param V - transmission voltage [V], > 0
 * @param resistances - line resistances [Ω], each ≥ 0
 * @returns one `{ R, I, loss, fraction }` per resistance (same order)
 * @throws RangeError as {@link lineLoss}
 * @slide 23 (transport chain; slides 21–23)
 */
export function lineLossSweepR(
  P: number,
  V: number,
  resistances: readonly number[],
): Array<{ R: number; I: number; loss: number; fraction: number }> {
  return resistances.map((R) => ({ R, ...lineLoss(P, V, R) }));
}

/**
 * Line loss vs transmitted power at fixed V and R_line: loss(P) = R · P² / V²
 * (quadratic in P; fraction = R·P/V², linear in P).
 *
 * @param V - transmission voltage [V], > 0
 * @param Rline - total line resistance [Ω], ≥ 0
 * @param powers - transmitted powers [W], each ≥ 0
 * @returns one `{ P, I, loss, fraction }` per power (same order)
 * @throws RangeError as {@link lineLoss}
 * @slide 23 (transport chain; slides 21–23)
 */
export function lineLossSweepP(
  V: number,
  Rline: number,
  powers: readonly number[],
): Array<{ P: number; I: number; loss: number; fraction: number }> {
  return powers.map((P) => ({ P, ...lineLoss(P, V, Rline) }));
}
