/**
 * Pure, DOM-free model of the `joule-transformer` simulator: transport chain
 * plant → step-up transformer → HV line → step-down transformer → users
 * (slides 20–23). Composed only from `src/physics` functions.
 *
 * Assumptions (also shown in the UI note):
 *  - ideal transformers (no winding/core losses, perfect coupling): V₁/V₂ = N₁/N₂,
 *    V₁I₁ = V₂I₂ (slide 20);
 *  - purely resistive line, power factor 1, single-phase equivalent, RMS values;
 *    `Rline` is the total resistance of the line (go + return);
 *  - `P` is the power the plant sends into the step-up transformer;
 *  - the step-down transformer uses the mirrored ratio N₂ : N₁;
 *  - the voltage drop on the line is R·I (resistive line and load ⇒ in phase).
 */
import { jouleLoss, lineLoss, transformerCurrent, transformerSecondary } from '../../physics';

export interface TransmissionInputs {
  /** Generator (primary) voltage V₁ [V]. */
  V1: number;
  /** Primary turns N₁ [-]. */
  N1: number;
  /** Secondary turns N₂ [-]. */
  N2: number;
  /** Transmitted power P [W]. */
  P: number;
  /** Total line resistance [Ω]. */
  Rline: number;
}

export interface TransmissionResult {
  V1: number;
  /** Line (secondary) voltage V₂ = V₁·N₂/N₁ [V]. */
  V2: number;
  /** Primary current I₁ = P/V₁ [A]. */
  I1: number;
  /** Secondary current I₂ = I₁·N₁/N₂ [A] (= line current). */
  I2: number;
  /** P₁ = V₁·I₁ [W]. */
  P1: number;
  /** P₂ = V₂·I₂ [W]. */
  P2: number;
  /** |P₁ − P₂| / P₁ (0 for an ideal transformer, up to rounding). */
  powerMismatch: number;
  /** Line current I = P/V₂, Joule loss R·I² and loss fraction (from `lineLoss`). */
  line: { I: number; loss: number; fraction: number };
  /** Same loss computed as `jouleLoss(R, I₂)` — must equal `line.loss`. */
  jouleCheck: number;
  /** Power reaching the step-down transformer P − P_J [W] (clamped at 0). */
  delivered: number;
  /** Voltage at the end of the line V₂ − R·I [V] (clamped at 0). */
  Vreceived: number;
  /** Voltage after the step-down transformer (ratio N₂ : N₁) [V]. */
  Vout: number;
  /** Current on the users' side after the step-down transformer [A]. */
  Iout: number;
  /** Loss if the line ran directly at V₁ (no step-up transformer). */
  direct: { I: number; loss: number; fraction: number };
  /** direct.loss / line.loss = (V₂/V₁)² — how much the step-up saves. */
  savingFactor: number;
  /** false when the line would dissipate ≥ the transmitted power (model invalid). */
  valid: boolean;
}

/** Full transport chain for the given inputs (SI units). */
export function computeTransmission(p: TransmissionInputs): TransmissionResult {
  const V2 = transformerSecondary(p.V1, p.N1, p.N2);
  const I1 = p.P / p.V1;
  const I2 = transformerCurrent(I1, p.N1, p.N2);
  const P1 = p.V1 * I1;
  const P2 = V2 * I2;
  const line = lineLoss(p.P, V2, p.Rline);
  const jouleCheck = jouleLoss(p.Rline, I2);
  const valid = line.fraction < 1;
  const delivered = Math.max(0, p.P - line.loss);
  const Vreceived = Math.max(0, V2 - p.Rline * line.I);
  const Vout = transformerSecondary(Vreceived, p.N2, p.N1);
  const Iout = transformerCurrent(line.I, p.N2, p.N1);
  const direct = lineLoss(p.P, p.V1, p.Rline);
  return {
    V1: p.V1,
    V2,
    I1,
    I2,
    P1,
    P2,
    powerMismatch: P1 === 0 ? 0 : Math.abs(P1 - P2) / P1,
    line,
    jouleCheck,
    delivered,
    Vreceived,
    Vout,
    Iout,
    direct,
    savingFactor: line.loss === 0 ? Number.NaN : direct.loss / line.loss,
    valid,
  };
}

/**
 * Factor by which the line loss drops when the transmission voltage is
 * multiplied by `k` at equal P and R: loss(V) / loss(k·V) (= k² in theory).
 * Computed from two `lineLoss` evaluations, not hard-coded.
 * Returns NaN when the loss is 0 (P = 0 or R = 0).
 */
export function lossReductionFactor(P: number, V: number, Rline: number, k = 10): number {
  const low = lineLoss(P, V, Rline).loss;
  const high = lineLoss(P, k * V, Rline).loss;
  return high === 0 ? Number.NaN : low / high;
}

/** Log-spaced samples of loss(V) at equal P and R (for the comparison chart). */
export function lossCurve(
  P: number,
  Rline: number,
  Vmin: number,
  Vmax: number,
  n = 64,
): { V: number[]; loss: number[] } {
  const V: number[] = [];
  const loss: number[] = [];
  const a = Math.log10(Vmin);
  const b = Math.log10(Vmax);
  for (let k = 0; k < n; k++) {
    const v = 10 ** (a + ((b - a) * k) / (n - 1));
    V.push(v);
    loss.push(lineLoss(P, v, Rline).loss);
  }
  return { V, loss };
}

/** Engineering prefix for display: picks the unit so the mantissa is in [1, 1000). */
export function siPrefix(value: number, baseUnit: string): { scale: number; unit: string } {
  const a = Math.abs(value);
  const table: Array<[number, string]> = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
  ];
  for (const [f, p] of table) if (a >= f) return { scale: 1 / f, unit: `${p}${baseUnit}` };
  return { scale: 1e3, unit: `m${baseUnit}` };
}

/**
 * Visual turn counts for the coils (the scene cannot draw 1000 turns): keeps the
 * N₁ : N₂ proportion with at most `max` rings per coil and at least 2.
 */
export function visualTurns(N1: number, N2: number, max = 24): { n1: number; n2: number } {
  const s = max / Math.max(N1, N2);
  return {
    n1: Math.max(2, Math.min(max, Math.round(N1 * s))),
    n2: Math.max(2, Math.min(max, Math.round(N2 * s))),
  };
}

/**
 * Heat-glow intensity of the line in [0, 1] from the loss fraction, on a log
 * scale: 10⁻⁴ → 0, 10⁻³ → ⅓, 10⁻² → ⅔, ≥ 10⁻¹ → 1.
 */
export function glowFromFraction(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(fraction) + 4) / 3));
}

/**
 * Particle animation for a conductor carrying current `I`, relative to a
 * reference current `Iref`: density and speed ∝ I (clamped for readability).
 */
export function particleFlow(
  I: number,
  Iref: number,
  maxCount: number,
): { count: number; speed: number } {
  const r = Iref > 0 ? Math.abs(I) / Iref : 0;
  return {
    count: Math.max(r > 0 ? 2 : 0, Math.min(maxCount, Math.round(maxCount * 0.6 * r))),
    speed: Math.min(3, 0.6 * r),
  };
}
