/**
 * Pure, DOM-free model of the `rl-energy` simulator: RL circuit closing
 * transient (extracurrent) and energy balance (slides 12–17). Composed from
 * `src/physics` functions.
 *
 * Assumptions (also shown in the UI note): ideal components, generator without
 * internal resistance, constant inductance (no saturation), switch closed at
 * t = 0 with i(0) = 0.
 *
 * State integrated numerically with fixed-step RK4 (`rk4Step`):
 *   L di/dt = E − R i          (slide 15)
 *   dE_gen/dt = E · i           (energy delivered by the generator)
 *   dE_J/dt   = R i²            (Joule heat, `jouleLoss`)
 * and the field energy is U_M = ½ L i² (`magneticEnergy`, slide 17), so the
 * slide 16–17 balance E·i·Δt = R i² Δt + L i Δi becomes E_gen = E_J + U_M,
 * which the numeric integration must reproduce (a genuine check, not an identity).
 */
import {
  MU_0,
  emfSelf,
  jouleLoss,
  magneticEnergy,
  rk4Step,
  rlCurrent,
  rlTimeConstant,
  solenoidInductance,
} from '../../physics';

export interface RlInputs {
  /** Generator emf E [V]. */
  E: number;
  /** Resistance R [Ω]. */
  R: number;
  /** Inductance L [H]. */
  L: number;
}

export interface RlState {
  /** Time since the switch closed [s]. */
  t: number;
  /** Current [A]. */
  i: number;
  /** Energy delivered by the generator ∫E·i dt [J]. */
  Egen: number;
  /** Joule heat ∫R·i² dt [J]. */
  EJoule: number;
}

export const initialState = (): RlState => ({ t: 0, i: 0, Egen: 0, EJoule: 0 });

/** Steady-state current I₀ = E/R [A]. */
export const steadyCurrent = (p: RlInputs): number => p.E / p.R;

/** RK4 sub-steps used so that each sub-step is ≤ τ/50. */
export function substepsFor(h: number, tau: number): number {
  if (!(tau > 0)) return 1;
  return Math.max(1, Math.min(10_000, Math.ceil(h / (tau / 50))));
}

/** Advance the state by `h` seconds of simulated time (RK4, sub-stepped). */
export function advance(s: RlState, p: RlInputs, h: number): RlState {
  const tau = rlTimeConstant(p.R, p.L);
  const n = substepsFor(h, tau);
  const dt = h / n;
  const f = (_t: number, y: readonly number[]): number[] => {
    const i = y[0] ?? 0;
    return [(p.E - p.R * i) / p.L, p.E * i, jouleLoss(p.R, i)];
  };
  let y = [s.i, s.Egen, s.EJoule];
  let t = s.t;
  for (let k = 0; k < n; k++) {
    y = rk4Step(f, t, y, dt);
    t += dt;
  }
  return { t, i: y[0] ?? 0, Egen: y[1] ?? 0, EJoule: y[2] ?? 0 };
}

export interface EnergyBalance {
  gen: number;
  joule: number;
  field: number;
  /** gen − (joule + field) [J]. */
  residual: number;
  /** |residual| / gen (0 when gen = 0). */
  relError: number;
}

export function energyBalance(s: RlState, L: number): EnergyBalance {
  const field = magneticEnergy(L, s.i);
  const residual = s.Egen - (s.EJoule + field);
  return {
    gen: s.Egen,
    joule: s.EJoule,
    field,
    residual,
    relError: s.Egen > 0 ? Math.abs(residual) / s.Egen : 0,
  };
}

/** i(τ)/I₀ computed with `rlCurrent` (theory: 1 − e⁻¹ ≈ 0,632). */
export function currentRatioAtTau(p: RlInputs): number {
  const tau = rlTimeConstant(p.R, p.L);
  return rlCurrent(p.E, p.R, p.L, tau) / steadyCurrent(p);
}

/** Self-induced emf −L di/dt for the current i, with di/dt = (E − R i)/L. */
export function selfEmf(p: RlInputs, i: number): number {
  return emfSelf(p.L, (p.E - p.R * i) / p.L);
}

/**
 * Playback time scale: simulated seconds per real second, so that the whole
 * transient (5τ) lasts ≈ 6 s on screen whatever τ is.
 */
export function timeScale(tau: number): number {
  return (5 * tau) / 6;
}

/** Simulated duration shown: the transient is complete after ≈ 6τ. */
export const T_END_TAUS = 6;

/** Generator energy at time t from the analytic solution (for bar scaling). */
export function analyticGeneratorEnergy(p: RlInputs, t: number): number {
  const tau = rlTimeConstant(p.R, p.L);
  const I0 = steadyCurrent(p);
  return p.E * I0 * (t + tau * Math.expm1(-t / tau));
}

/** Solenoid inductance with a linear core: L = μᵣ μ₀ N² S / l (slide 14). */
export function inductanceFromSolenoid(N: number, S: number, l: number, muR: number): number {
  return solenoidInductance(N, S, l, muR * MU_0);
}

/** Samples of the analytic i(t) on [0, tEnd], including t = τ exactly. */
export function currentCurve(p: RlInputs, tEnd: number, n = 240): { t: number[]; i: number[] } {
  const tau = rlTimeConstant(p.R, p.L);
  const ts: number[] = [];
  for (let k = 0; k <= n; k++) ts.push((tEnd * k) / n);
  if (!ts.some((x) => x === tau)) {
    ts.push(tau);
    ts.sort((a, b) => a - b);
  }
  return { t: ts, i: ts.map((x) => rlCurrent(p.E, p.R, p.L, x)) };
}

/** Rows of the i(t) plot: analytic curve, asymptote I₀, τ marker, "now" marker. */
export function currentPlotData(
  inp: RlInputs,
  tNow: number,
  iNow: number,
  n = 240,
): [number[], number[], number[], number[], number[]] {
  const tau = rlTimeConstant(inp.R, inp.L);
  const I0 = steadyCurrent(inp);
  const tEnd = T_END_TAUS * tau;
  type Row = [number, number, number, number, number];
  const rows: Row[] = [];
  const iAt = (t: number): number => rlCurrent(inp.E, inp.R, inp.L, t);
  for (let k = 0; k <= n; k++) {
    const t = (tEnd * k) / n;
    rows.push([t, iAt(t), I0, Number.NaN, Number.NaN]);
  }
  rows.push([tau, iAt(tau), I0, 0, Number.NaN], [tau, iAt(tau), I0, I0, Number.NaN]);
  if (tNow > 0) {
    rows.push([tNow, iAt(tNow), I0, Number.NaN, 0], [tNow, iAt(tNow), I0, Number.NaN, iNow]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return [0, 1, 2, 3, 4].map((c) => rows.map((r) => r[c] as number)) as [
    number[],
    number[],
    number[],
    number[],
    number[],
  ];
}
