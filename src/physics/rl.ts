/**
 * Self-induction, solenoid inductance, RL closing transient, magnetic energy.
 */
import { MU_0 } from './constants';
import { finite, noNegZero, nonNegative, positive } from './validate';

/**
 * Inductance of a long ideal solenoid (length ≫ diameter, uniform internal
 * field, no fringe field, linear core without saturation).
 *
 * L = μ · N² · S / l   (μ defaults to μ₀ = 4π·10⁻⁷ H/m; μ = μ_r · μ₀ for a core)
 *
 * @param N - number of turns [-], ≥ 0
 * @param S - cross-section area [m²], ≥ 0
 * @param l - solenoid length [m], must be > 0
 * @param mu - magnetic permeability [H/m], > 0 (default {@link MU_0})
 * @returns L [H]
 * @throws RangeError if l ≤ 0, mu ≤ 0, N < 0, S < 0, or non-finite input
 * @slide 14
 */
export function solenoidInductance(N: number, S: number, l: number, mu?: number): number {
  const fn = 'solenoidInductance';
  nonNegative(fn, 'N', N);
  nonNegative(fn, 'S', S);
  positive(fn, 'l', l);
  const m = positive(fn, 'mu', mu ?? MU_0);
  return (m * N * N * S) / l;
}

/**
 * Self-induced emf.
 *
 * f.e.m. = −L · di/dt
 *
 * @param L - inductance [H], ≥ 0
 * @param dIdt - rate of change of current [A/s]
 * @returns emf [V] (opposes the current variation)
 * @throws RangeError if L < 0 or non-finite input
 * @slide 13
 */
export function emfSelf(L: number, dIdt: number): number {
  const fn = 'emfSelf';
  nonNegative(fn, 'L', L);
  finite(fn, 'dIdt', dIdt);
  return noNegZero(-L * dIdt);
}

/**
 * Time constant of an RL circuit: τ = L / R.
 *
 * @param R - resistance [Ω], > 0
 * @param L - inductance [H], ≥ 0
 * @returns τ [s]
 * @throws RangeError if R ≤ 0, L < 0, or non-finite input
 * @slide 15
 */
export function rlTimeConstant(R: number, L: number): number {
  const fn = 'rlTimeConstant';
  positive(fn, 'R', R);
  nonNegative(fn, 'L', L);
  return L / R;
}

/**
 * RL circuit closing transient (extracurrent at closing), switch closed at t = 0
 * with i(0) = 0. Solution of L·di/dt = f.e.m. − R·i:
 *
 * i(t) = I₀ · (1 − e^(−R t / L)),   I₀ = f.e.m. / R,   τ = L / R
 *
 * Edge cases: t < 0 ⇒ 0 (switch still open); R = 0 ⇒ exact limit
 * i(t) = f.e.m. · t / L (unbounded linear growth, ideal superconducting coil).
 * Evaluated with `expm1` for accuracy when R·t/L is small.
 *
 * @param emfDC - DC generator emf [V]
 * @param R - resistance [Ω], ≥ 0
 * @param L - inductance [H], must be > 0
 * @param t - time since closing [s]
 * @returns current [A]
 * @throws RangeError if L ≤ 0, R < 0, or non-finite input
 * @slide 15
 */
export function rlCurrent(emfDC: number, R: number, L: number, t: number): number {
  const fn = 'rlCurrent';
  finite(fn, 'emfDC', emfDC);
  nonNegative(fn, 'R', R);
  positive(fn, 'L', L);
  finite(fn, 't', t);
  if (t <= 0) return 0;
  if (R === 0) return noNegZero((emfDC * t) / L);
  return noNegZero((emfDC / R) * -Math.expm1((-R * t) / L));
}

/**
 * Energy stored in the magnetic field of an inductor (linear, no saturation).
 *
 * U_M = ½ · L · I²
 *
 * @param L - inductance [H], ≥ 0
 * @param I - current [A]
 * @returns energy [J], ≥ 0
 * @throws RangeError if L < 0 or non-finite input
 * @slide 17
 */
export function magneticEnergy(L: number, I: number): number {
  const fn = 'magneticEnergy';
  nonNegative(fn, 'L', L);
  finite(fn, 'I', I);
  return 0.5 * L * I * I;
}
