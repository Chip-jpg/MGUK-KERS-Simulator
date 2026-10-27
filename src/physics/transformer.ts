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
