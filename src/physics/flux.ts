/**
 * Flux, Faraday-Neumann law, motional emf, rotating loop, induced current, Lenz.
 *
 * Orientation convention used throughout (see docs/PHYSICS.md §2): the circuit
 * has a chosen unit normal n̂; Φ is measured along n̂; an emf/current is positive
 * when it circulates counter-clockwise seen from the tip of n̂ (right-hand rule:
 * a positive current produces a field along +n̂).
 */
import { finite, noNegZero, nonNegative, positive } from './validate';

/**
 * Magnetic flux through a flat surface in a uniform field.
 *
 * Φ_B = B · S · cos α
 *
 * Validity: uniform B over a flat surface S.
 *
 * @param B - magnetic field (signed component magnitude) [T]
 * @param S - surface area [m²], ≥ 0
 * @param alphaRad - angle between B and the surface normal n̂ [rad]
 * @returns Φ_B [Wb] (1 Wb = 1 T·m²)
 * @throws RangeError if an input is not finite or S < 0
 * @slide 7
 */
export function fluxUniform(B: number, S: number, alphaRad: number): number {
  const fn = 'fluxUniform';
  finite(fn, 'B', B);
  nonNegative(fn, 'S', S);
  finite(fn, 'alphaRad', alphaRad);
  return noNegZero(B * S * Math.cos(alphaRad));
}

/**
 * Faraday-Neumann law, average form.
 *
 * f.e.m. = −N · ΔΦ_B / Δt
 *
 * @param dPhi - flux variation ΔΦ_B through one turn [Wb]
 * @param dt - time interval Δt [s], must be > 0
 * @param N - number of turns [-], ≥ 0 (default 1)
 * @returns average induced emf [V]
 * @throws RangeError if dt ≤ 0 (in particular Δt = 0), N < 0, or non-finite input
 * @slide 8
 */
export function emfFaraday(dPhi: number, dt: number, N?: number): number {
  const fn = 'emfFaraday';
  finite(fn, 'dPhi', dPhi);
  positive(fn, 'dt', dt);
  const turns = nonNegative(fn, 'N', N ?? 1);
  return noNegZero((-turns * dPhi) / dt);
}

/**
 * Motional emf of a straight conductor moving perpendicular to a uniform field
 * (B ⟂ l ⟂ v).
 *
 * f.e.m. = B · l · v
 *
 * @param B - magnetic field [T]
 * @param l - conductor length [m], ≥ 0
 * @param v - speed [m/s] (signed)
 * @returns emf magnitude with the sign of B·v [V]
 * @throws RangeError if l < 0 or non-finite input
 * @slide 8
 */
export function emfMotional(B: number, l: number, v: number): number {
  const fn = 'emfMotional';
  finite(fn, 'B', B);
  nonNegative(fn, 'l', l);
  finite(fn, 'v', v);
  return noNegZero(B * l * v);
}

/**
 * N-turn flat loop rotating at constant angular speed ω in a uniform field
 * (single-phase alternator model; α(t) = ωt, α(0) = 0 ⇒ maximum flux at t = 0).
 *
 * Φ(t) = B · S · cos(ωt)   (flux through ONE turn)
 * f.e.m.(t) = −N · dΦ/dt = N · B · S · ω · sin(ωt) = V₀ · sin(ωt),
 * V₀ = N · B · S · ω   (signed; the peak value is |V₀|)
 *
 * @param B - magnetic field [T]
 * @param S - loop area [m²], ≥ 0
 * @param N - number of turns [-], ≥ 0
 * @param omega - angular speed ω [rad/s]
 * @param t - time [s]
 * @returns `phi` [Wb] (one turn), `emf` [V] (whole coil), `V0` [V]
 * @throws RangeError if S < 0, N < 0, or non-finite input
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
  const fn = 'rotatingLoop';
  finite(fn, 'B', B);
  nonNegative(fn, 'S', S);
  nonNegative(fn, 'N', N);
  finite(fn, 'omega', omega);
  finite(fn, 't', t);
  const theta = omega * t;
  const V0 = noNegZero(N * B * S * omega);
  return {
    phi: noNegZero(B * S * Math.cos(theta)),
    emf: noNegZero(V0 * Math.sin(theta)),
    V0,
  };
}

/**
 * Induced current in a circuit of resistance R (Ohm's law applied to the
 * induced emf; the circuit's self-inductance is neglected).
 *
 * i = f.e.m. / R = −(1/R) · ΔΦ_B / Δt
 *
 * R = 0 is rejected: a resistance-free loop is outside the Ohm's-law model
 * (the current would be limited by self-inductance, slide 12–15, not by R).
 *
 * @param emf - induced emf [V]
 * @param R - circuit resistance [Ω], must be > 0
 * @returns current [A], same sign as the emf
 * @throws RangeError if R ≤ 0 (in particular R = 0) or non-finite input
 * @slide 9
 */
export function inducedCurrent(emf: number, R: number): number {
  const fn = 'inducedCurrent';
  finite(fn, 'emf', emf);
  positive(fn, 'R', R);
  return noNegZero(emf / R);
}

/**
 * Lenz's law: orientation of the induced emf/current (and of the field it
 * produces) with respect to the circuit normal n̂ used to measure Φ.
 *
 * sign(f.e.m.) = sign(i) = −sign(dΦ/dt)
 *
 * +1 ⇒ induced current counter-clockwise seen from the tip of n̂ (its field
 * points along +n̂); −1 ⇒ clockwise (field along −n̂); 0 ⇒ no variation, no
 * induced current. In every case the induced field opposes the variation.
 *
 * @param dPhiDt - rate of change of flux dΦ/dt [Wb/s]
 * @returns −1 | 0 | 1
 * @throws RangeError if dPhiDt is NaN
 * @slide 11
 */
export function lenzSign(dPhiDt: number): -1 | 0 | 1 {
  if (Number.isNaN(dPhiDt)) throw new RangeError('lenzSign: dPhiDt must not be NaN');
  if (dPhiDt > 0) return -1;
  if (dPhiDt < 0) return 1;
  return 0;
}
