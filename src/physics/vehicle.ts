/**
 * Vehicle energy and the KERS / MGU-K braking-event model.
 *
 * Model (see docs/PHYSICS.md §4 for the full derivation):
 * - straight-line braking from v₁ to v₂ with CONSTANT deceleration a = (v₁ − v₂)/t_brake;
 *   aerodynamic drag, rolling resistance and tyre slip are ignored, so the whole
 *   ΔE_k must be removed by the brakes (MGU-K + friction discs);
 * - total braking power P_b(t) = m · a · v(t), v(t) = v₁ − a·t (linear in t);
 * - `Pmax` is the ELECTRICAL power cap of the MGU-K (power delivered to the
 *   energy store) and `eta` its mechanical→electrical efficiency, so the MGU-K
 *   can take at most P_cap = Pmax / η of mechanical power from the axle;
 * - mechanical power taken by the MGU-K: P_mguk(t) = min(P_b(t), Pmax / η);
 *   electrical power stored: P_el(t) = η · P_mguk(t) ≤ Pmax;
 * - everything else is heat: disc brakes (P_b − P_mguk) + MGU-K/converter losses
 *   ((1 − η) · P_mguk).
 */
import { finite, noNegZero, nonNegative, positive } from './validate';

/** Number of samples in {@link kersBrakingEvent}'s `powerTrace` (200 intervals). */
export const KERS_TRACE_SAMPLES = 201;

/**
 * Kinetic energy released when braking from v₁ to v₂.
 *
 * ΔE_k = ½ · m · (v₁² − v₂²)
 *
 * Positive when the body slows down (|v₂| < |v₁|), negative when it speeds up.
 *
 * @param m - mass [kg], ≥ 0
 * @param v1 - initial speed [m/s]
 * @param v2 - final speed [m/s]
 * @returns ΔE_k [J]
 * @throws RangeError if m < 0 or non-finite input
 * @slide none (extension: mechanics prerequisite, not in the induction deck)
 */
export function kineticEnergyDelta(m: number, v1: number, v2: number): number {
  const fn = 'kineticEnergyDelta';
  nonNegative(fn, 'm', m);
  finite(fn, 'v1', v1);
  finite(fn, 'v2', v2);
  return noNegZero(0.5 * m * (v1 * v1 - v2 * v2));
}

/**
 * Braking event split between the MGU-K (electrical power cap Pmax, efficiency η)
 * and the friction (disc) brakes. Model in the module header and docs/PHYSICS.md.
 *
 * - dEk = ½ m (v₁² − v₂²)
 * - recoverable = ∫₀^t_brake min(P_b(t), Pmax/η) dt   (mechanical energy taken by
 *   the MGU-K; computed analytically, P_b is linear in t)
 * - recovered = η · recoverable   (electrical energy stored)
 * - dissipated = dEk − recovered = disc-brake heat (dEk − recoverable) +
 *   MGU-K/converter losses (recoverable − recovered); hence
 *   recovered + dissipated = dEk exactly
 * - timeToRecoverAtPmax = η · dEk / Pmax: time the MGU-K, running continuously at
 *   its cap, would need to absorb the whole ΔE_k (storing η·ΔE_k). If it exceeds
 *   t_brake, part of the energy necessarily goes to the discs.
 * - powerTrace: {@link KERS_TRACE_SAMPLES} uniform samples on [0, t_brake];
 *   `pKers` = electrical power stored η·min(P_b, Pmax/η) [W], `pBrakes` =
 *   P_b − pKers [W] (everything not stored); pKers + pBrakes = P_b(t), and the
 *   integrals of pKers / pBrakes are `recovered` / `dissipated`.
 *
 * Edge cases: v₂ ≥ v₁ (no braking) ⇒ dEk = ½m(v₁² − v₂²) ≤ 0 is reported but
 * recoverable = recovered = dissipated = timeToRecoverAtPmax = 0 and the trace is
 * all zeros (the invariant recovered + dissipated = dEk holds only when dEk ≥ 0).
 * Pmax = 0 ⇒ everything to the discs, timeToRecoverAtPmax = +∞.
 * Pmax = +∞ ⇒ uncapped MGU-K, timeToRecoverAtPmax = 0.
 * η = 0 ⇒ the MGU-K takes the mechanical power (cap Pmax/η = +∞) but stores
 * nothing (limit η → 0⁺): recovered = 0, timeToRecoverAtPmax = 0.
 *
 * @param p - `m` [kg] > 0, `v1`/`v2` [m/s] ≥ 0, `Pmax` [W] ≥ 0 (may be +∞),
 *   `eta` [-] in [0, 1], `tBrake` [s] > 0
 * @returns energies [J], time [s] and a power trace (`t` [s], `pKers`/`pBrakes` [W])
 * @throws RangeError on m ≤ 0, negative speeds, Pmax < 0 or NaN, η ∉ [0, 1],
 *   tBrake ≤ 0, or non-finite input
 * @slide none (extension: KERS/MGU-K model; builds on the energy balance of
 * slides 16–17 and on the alternator of slides 18–19)
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
  const fn = 'kersBrakingEvent';
  const { m, v1, v2, Pmax, eta, tBrake } = p;
  positive(fn, 'm', m);
  nonNegative(fn, 'v1', v1);
  nonNegative(fn, 'v2', v2);
  if (Number.isNaN(Pmax) || Pmax < 0) {
    throw new RangeError(`${fn}: Pmax must be ≥ 0 (got ${Pmax})`);
  }
  finite(fn, 'eta', eta);
  if (eta < 0 || eta > 1) throw new RangeError(`${fn}: eta must be in [0, 1] (got ${eta})`);
  positive(fn, 'tBrake', tBrake);

  const dEk = kineticEnergyDelta(m, v1, v2);
  const n = KERS_TRACE_SAMPLES - 1;
  const times = Array.from({ length: KERS_TRACE_SAMPLES }, (_, k) => (tBrake * k) / n);

  if (dEk <= 0) {
    return {
      dEk,
      recoverable: 0,
      recovered: 0,
      dissipated: 0,
      timeToRecoverAtPmax: 0,
      powerTrace: times.map((t) => ({ t, pKers: 0, pBrakes: 0 })),
    };
  }

  const a = (v1 - v2) / tBrake; // deceleration [m/s²], > 0
  const P0 = m * a * v1; // braking power at t = 0 [W]
  const P1 = m * a * v2; // braking power at t = tBrake [W]
  // Mechanical power cap of the MGU-K [W].
  const cap = Pmax === 0 ? 0 : eta === 0 ? Infinity : Pmax / eta;

  let recoverable: number;
  if (cap >= P0) {
    recoverable = dEk; // never saturated
  } else if (cap <= P1) {
    recoverable = cap * tBrake; // saturated for the whole event
  } else {
    // P_b(t*) = cap; saturated on [0, t*], below the cap on [t*, tBrake].
    const tStar = (tBrake * (P0 - cap)) / (P0 - P1);
    recoverable = cap * tStar + 0.5 * (cap + P1) * (tBrake - tStar);
  }
  const recovered = eta * recoverable;
  const dissipated = dEk - recovered;
  const timeToRecoverAtPmax = Pmax === 0 ? Infinity : (eta * dEk) / Pmax;

  const powerTrace = times.map((t, k) => {
    const s = k / n; // normalised time; v(t) written so that v(0) = v₁ and v(tBrake) = v₂ exactly
    const pB = m * a * (v1 * (1 - s) + v2 * s);
    const pKers = eta * Math.min(pB, cap);
    return { t, pKers, pBrakes: Math.max(0, pB - pKers) };
  });

  return { dEk, recoverable, recovered, dissipated, timeToRecoverAtPmax, powerTrace };
}

/**
 * Splits `dissipated` of a {@link kersBrakingEvent} result into its two sources.
 *
 * brakes = dEk − recoverable   (friction heat in the disc brakes)
 * mguk = recoverable − recovered = (1 − η) · recoverable   (MGU-K + converter
 * Joule/iron losses); brakes + mguk = dissipated.
 *
 * @param r - result of {@link kersBrakingEvent}
 * @returns `brakes` [J], `mguk` [J]
 * @slide none (extension: KERS energy bookkeeping; Joule heat as in slide 16)
 */
export function kersDissipationSplit(r: { dEk: number; recoverable: number; recovered: number }): {
  brakes: number;
  mguk: number;
} {
  if (r.dEk <= 0) return { brakes: 0, mguk: 0 };
  return { brakes: r.dEk - r.recoverable, mguk: r.recoverable - r.recovered };
}
