/**
 * KERS Lab — physics core (public API).
 *
 * CONTRACT (frozen in task A0, see docs/ARCHITECTURE.md §4.2): names, parameter
 * names, optional parameters and return shapes below must not change without an
 * orchestrator-approved change request.
 *
 * Rules (§4.1): SI units everywhere (T, m, m², rad/s, V, A, Ω, H, J, W, kg, m/s);
 * degrees only at the UI boundary; pure functions, no global state, no clocks;
 * every export documents formula, units and `@slide N`.
 *
 * Every function is currently a stub that throws {@link NotImplementedError};
 * task A1 provides the implementations.
 */
import { notImplemented } from './errors';

export { NotImplementedError } from './errors';

/** Fixed physics time step in seconds (§4.1): 1/240 s. */
export const PHYSICS_DT = 1 / 240;

// ---------------------------------------------------------------------------
// flux & induction
// ---------------------------------------------------------------------------

/**
 * Magnetic flux through a flat surface in a uniform field.
 *
 * Φ_B = B · S · cos α
 *
 * @param B - magnetic field magnitude [T]
 * @param S - surface area [m²]
 * @param alphaRad - angle between B and the surface normal [rad]
 * @returns Φ_B [Wb] (1 Wb = 1 T·m²)
 * @slide 7
 */
export function fluxUniform(B: number, S: number, alphaRad: number): number {
  return notImplemented('fluxUniform', B, S, alphaRad);
}

/**
 * Faraday-Neumann law (average form).
 *
 * f.e.m. = −N · ΔΦ_B / Δt
 *
 * @param dPhi - flux variation ΔΦ_B through one turn [Wb]
 * @param dt - time interval Δt [s]
 * @param N - number of turns [-] (default 1)
 * @returns induced emf [V]
 * @slide 8
 */
export function emfFaraday(dPhi: number, dt: number, N?: number): number {
  return notImplemented('emfFaraday', dPhi, dt, N);
}

/**
 * Motional emf of a conductor moving perpendicular to a uniform field.
 *
 * f.e.m. = B · l · v
 *
 * @param B - magnetic field [T]
 * @param l - conductor length [m]
 * @param v - speed [m/s]
 * @returns emf [V]
 * @slide 8
 */
export function emfMotional(B: number, l: number, v: number): number {
  return notImplemented('emfMotional', B, l, v);
}

/**
 * N-turn loop rotating at angular speed ω in a uniform field (single-phase
 * alternator model).
 *
 * Φ(t) = B · S · cos(ωt)   (flux through one turn)
 * f.e.m.(t) = N · B · S · ω · sin(ωt) = V₀ sin(ωt),   V₀ = N · B · S · ω
 *
 * @param B - magnetic field [T]
 * @param S - loop area [m²]
 * @param N - number of turns [-]
 * @param omega - angular speed ω [rad/s]
 * @param t - time [s]
 * @returns `phi` [Wb], `emf` [V], `V0` peak emf [V]
 * @slide 18
 * @slide 19
 */
export function rotatingLoop(
  B: number,
  S: number,
  N: number,
  omega: number,
  t: number,
): { phi: number; emf: number; V0: number } {
  return notImplemented('rotatingLoop', B, S, N, omega, t);
}

/**
 * Induced current in a circuit of resistance R (Ohm's law).
 *
 * i = f.e.m. / R = −(1/R) · ΔΦ_B / Δt
 *
 * @param emf - induced emf [V]
 * @param R - circuit resistance [Ω]
 * @returns current [A]
 * @slide 9
 */
export function inducedCurrent(emf: number, R: number): number {
  return notImplemented('inducedCurrent', emf, R);
}

// ---------------------------------------------------------------------------
// Lenz
// ---------------------------------------------------------------------------

/**
 * Lenz's law: sign of the induced field relative to the flux variation. The
 * induced field opposes ΔΦ, so the result is −sign(dΦ/dt).
 *
 * @param dPhiDt - rate of change of flux dΦ/dt [Wb/s]
 * @returns −1 | 0 | 1 (sign of the induced flux contribution)
 * @slide 11
 */
export function lenzSign(dPhiDt: number): -1 | 0 | 1 {
  return notImplemented('lenzSign', dPhiDt);
}

// ---------------------------------------------------------------------------
// inductance / RL / energy
// ---------------------------------------------------------------------------

/**
 * Inductance of a long solenoid.
 *
 * L = μ · N² · S / l   (μ defaults to μ₀ = 4π·10⁻⁷ H/m)
 *
 * @param N - number of turns [-]
 * @param S - cross-section area [m²]
 * @param l - solenoid length [m]
 * @param mu - magnetic permeability [H/m] (default μ₀)
 * @returns L [H]
 * @slide 14
 */
export function solenoidInductance(N: number, S: number, l: number, mu?: number): number {
  return notImplemented('solenoidInductance', N, S, l, mu);
}

/**
 * Self-induced emf.
 *
 * f.e.m. = −L · di/dt
 *
 * @param L - inductance [H]
 * @param dIdt - rate of change of current [A/s]
 * @returns emf [V]
 * @slide 13
 */
export function emfSelf(L: number, dIdt: number): number {
  return notImplemented('emfSelf', L, dIdt);
}

/**
 * RL circuit closing transient (extracurrent at closing).
 *
 * i(t) = I₀ · (1 − e^(−R t / L)),   I₀ = f.e.m. / R,   τ = L / R
 *
 * @param emfDC - DC generator emf [V]
 * @param R - resistance [Ω]
 * @param L - inductance [H]
 * @param t - time since closing [s]
 * @returns current [A]
 * @slide 15
 */
export function rlCurrent(emfDC: number, R: number, L: number, t: number): number {
  return notImplemented('rlCurrent', emfDC, R, L, t);
}

/**
 * Energy stored in the magnetic field of an inductor.
 *
 * U_M = ½ · L · I²
 *
 * @param L - inductance [H]
 * @param I - current [A]
 * @returns energy [J]
 * @slide 17
 */
export function magneticEnergy(L: number, I: number): number {
  return notImplemented('magneticEnergy', L, I);
}

// ---------------------------------------------------------------------------
// transformer & losses
// ---------------------------------------------------------------------------

/**
 * Ideal static transformer, secondary voltage.
 *
 * ΔV₁ / ΔV₂ = N₁ / N₂   ⇒   V₂ = V₁ · N₂ / N₁
 *
 * @param V1 - primary voltage [V]
 * @param N1 - primary turns [-]
 * @param N2 - secondary turns [-]
 * @returns V₂ [V]
 * @slide 20
 */
export function transformerSecondary(V1: number, N1: number, N2: number): number {
  return notImplemented('transformerSecondary', V1, N1, N2);
}

/**
 * Ideal transformer, secondary current (power conserved: V₁I₁ = V₂I₂).
 *
 * I₂ = I₁ · N₁ / N₂
 *
 * @param I1 - primary current [A]
 * @param N1 - primary turns [-]
 * @param N2 - secondary turns [-]
 * @returns I₂ [A]
 * @slide 20
 */
export function transformerCurrent(I1: number, N1: number, N2: number): number {
  return notImplemented('transformerCurrent', I1, N1, N2);
}

/**
 * Joule power dissipated in a resistor.
 *
 * P = R · I²
 *
 * @param R - resistance [Ω]
 * @param I - current [A]
 * @returns power [W]
 * @slide 16 (R i² term of the energy balance)
 */
export function jouleLoss(R: number, I: number): number {
  return notImplemented('jouleLoss', R, I);
}

/**
 * Transmission line loss when delivering power P at voltage V.
 *
 * I = P / V,   loss = R_line · I²,   fraction = loss / P
 *
 * @param P - transmitted power [W]
 * @param V - transmission voltage [V]
 * @param Rline - line resistance [Ω]
 * @returns `I` [A], `loss` [W], `fraction` [-]
 * @slide 22
 * @slide 23
 */
export function lineLoss(
  P: number,
  V: number,
  Rline: number,
): { I: number; loss: number; fraction: number } {
  return notImplemented('lineLoss', P, V, Rline);
}

// ---------------------------------------------------------------------------
// machine & vehicle
// ---------------------------------------------------------------------------

/**
 * Force on a straight current-carrying conductor in a uniform field (inverse
 * principle of induction: electric motor).
 *
 * F = B · I · L · sin θ   (θ defaults to π/2)
 *
 * @param B - magnetic field [T]
 * @param I - current [A]
 * @param L - conductor length [m]
 * @param theta - angle between conductor and B [rad] (default π/2)
 * @returns force [N]
 * @slide none — not in the deck (inverse principle of induction, assignment sheet); A1 to confirm
 */
export function lorentzForce(B: number, I: number, L: number, theta?: number): number {
  return notImplemented('lorentzForce', B, I, L, theta);
}

/**
 * Kinetic energy released when braking from v₁ to v₂.
 *
 * ΔE_k = ½ · m · (v₁² − v₂²)
 *
 * @param m - mass [kg]
 * @param v1 - initial speed [m/s]
 * @param v2 - final speed [m/s]
 * @returns ΔE_k [J]
 * @slide none — mechanics prerequisite, not in the induction deck
 */
export function kineticEnergyDelta(m: number, v1: number, v2: number): number {
  return notImplemented('kineticEnergyDelta', m, v1, v2);
}

/**
 * Braking event split between MGU-K (power-capped, efficiency η) and disc brakes.
 *
 * ΔE_k = ½ m (v₁² − v₂²);  recoverable = min(ΔE_k, P_max · t_brake);
 * recovered = η · recoverable;  dissipated = ΔE_k − recovered;
 * timeToRecoverAtPmax = ΔE_k / P_max.
 * (Indicative model; A1 finalises the exact semantics and edge cases in
 * docs/PHYSICS.md. Invariant: recovered + dissipated = ΔE_k.)
 *
 * @param p - `m` [kg], `v1`/`v2` [m/s], `Pmax` [W], `eta` [-], `tBrake` [s]
 * @returns energies [J], time [s] and a power trace (`t` [s], `pKers`/`pBrakes` [W])
 * @slide 16
 * @slide 17
 */
export function kersBrakingEvent(p: {
  m: number;
  v1: number;
  v2: number;
  Pmax: number;
  eta: number;
  tBrake: number;
}): {
  dEk: number;
  recoverable: number;
  recovered: number;
  dissipated: number;
  timeToRecoverAtPmax: number;
  powerTrace: Array<{ t: number; pKers: number; pBrakes: number }>;
} {
  return notImplemented('kersBrakingEvent', p);
}

/** Input of {@link kersBrakingEvent}. */
export type KersBrakingParams = Parameters<typeof kersBrakingEvent>[0];
/** Output of {@link kersBrakingEvent}. */
export type KersBrakingResult = ReturnType<typeof kersBrakingEvent>;

// ---------------------------------------------------------------------------
// numerical integration
// ---------------------------------------------------------------------------

/** Right-hand side of an ODE system dy/dt = f(t, y). */
export type OdeRhs = (t: number, y: readonly number[]) => number[];

/**
 * One classical fourth-order Runge-Kutta step for a vector state.
 *
 * k₁ = f(t, y);  k₂ = f(t + dt/2, y + dt/2·k₁);  k₃ = f(t + dt/2, y + dt/2·k₂);
 * k₄ = f(t + dt, y + dt·k₃);  y(t+dt) = y + dt/6 · (k₁ + 2k₂ + 2k₃ + k₄)
 *
 * Pure: must not mutate `y`. Use with dt = {@link PHYSICS_DT} (§4.1).
 *
 * @param f - derivative function
 * @param t - current time [s]
 * @param y - current state vector
 * @param dt - step [s]
 * @returns new state vector at t + dt
 */
export function rk4Step(f: OdeRhs, t: number, y: readonly number[], dt: number): number[] {
  return notImplemented('rk4Step', f, t, y, dt);
}
