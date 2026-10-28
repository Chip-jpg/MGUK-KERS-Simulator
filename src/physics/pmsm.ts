/**
 * Permanent-magnet synchronous machine (PMSM): d-q model (Phase 4 extension).
 *
 * A representative three-phase machine model that bridges the single-phase
 * rotating loop of slides 18–19 (f.e.m. = V₀ sin ωt, V₀ = NBSω) to a realistic
 * three-phase motor/generator. The d-q quantities are the phase quantities seen
 * from the rotor: in steady state they are constant, so the machine behaves like
 * a DC circuit and its limits (current, voltage) become simple curves.
 *
 * Conventions (documented in docs/PHYSICS.md, "PMSM d-q (Phase 4)"):
 * - **Amplitude-invariant** Clarke/Park transform: the length of the (α, β) or
 *   (d, q) vector equals the peak value of the phase sinusoids. Hence power and
 *   torque carry the factor 3/2.
 * - **Motor (load) convention**: v = Rₛ·i + dψ/dt. Positive torque/power =
 *   motoring; generating (braking, energy to the battery) gives T < 0 and
 *   P_elec < 0 at positive speed.
 * - θₑ = p·θ_mech (electrical angle); the d axis is aligned with the magnet
 *   flux ψₘ (north pole), q leads d by 90° electrical.
 * - Linear magnetics (no saturation), iron losses neglected, ideal inverter whose
 *   phase-voltage amplitude is limited to V_max = V_DC/√3 (sinusoidal PWM with
 *   third-harmonic injection / space-vector modulation, linear range).
 *
 * Pure functions, SI units, no DOM, no clocks (§4.1).
 */
import { rk4Step } from './ode';
import { finite, noNegZero, nonNegative, positive } from './validate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Machine parameters of the d-q model (SI). */
export interface PmsmParams {
  /** Stator phase resistance Rₛ [Ω], ≥ 0. */
  Rs: number;
  /** d-axis synchronous inductance L_d [H], > 0. */
  Ld: number;
  /** q-axis synchronous inductance L_q [H], > 0 (L_q > L_d: interior magnets). */
  Lq: number;
  /** Permanent-magnet flux linkage ψₘ [Wb] (peak, per phase), ≥ 0. */
  psiM: number;
  /** Number of pole pairs p (positive integer). */
  p: number;
}

/** Operating mode used by the limit functions. */
export type PmsmMode = 'motor' | 'generator';

/** Which constraint is active at a maximum-torque operating point. */
export type PmsmRegion =
  /** Maximum torque per ampere at I_max; the voltage limit is not reached (constant torque). */
  | 'mtpa'
  /** Field weakening: current circle and voltage ellipse both active (≈ constant power). */
  | 'field-weakening'
  /** Maximum torque per volt: only the voltage ellipse is active (current below I_max). */
  | 'mtpv'
  /** No current satisfies the voltage limit: beyond the maximum speed. */
  | 'infeasible';

/** Result of {@link pmsmMaxTorque}. */
export interface PmsmMaxTorquePoint {
  /** Signed torque [N·m]: > 0 motor, < 0 generator (0 when infeasible). */
  torque: number;
  /** d-axis current [A]. */
  id: number;
  /** q-axis current [A] (same sign as the torque for L_d ≤ L_q machines). */
  iq: number;
  /** Mechanical power T·ω_mech [W] (signed). */
  power: number;
  region: PmsmRegion;
}

/** One sample of {@link pmsmTorqueSpeedEnvelope}. */
export interface PmsmEnvelopePoint {
  /** Mechanical speed [rad/s]. */
  omegaMech: number;
  /** Maximum motoring torque [N·m] (≥ 0). */
  tMotor: number;
  /** Maximum braking (generating) torque [N·m] (≤ 0). */
  tGen: number;
  /** tMotor·ω [W]. */
  pMotor: number;
  /** tGen·ω [W] (≤ 0: mechanical power absorbed from the shaft). */
  pGen: number;
  regionMotor: PmsmRegion;
  regionGen: PmsmRegion;
}

/** Full steady-state operating point (see {@link pmsmOperatingPoint}). */
export interface PmsmOperatingPoint {
  vd: number;
  vq: number;
  /** |v| = √(v_d² + v_q²) = peak phase voltage [V]. */
  vMag: number;
  /** |i| = √(i_d² + i_q²) = peak phase current [A]. */
  iMag: number;
  torque: number;
  /** Electrical speed ωₑ / p [rad/s]. */
  omegaMech: number;
  /** Electrical power entering the stator terminals, (3/2)(v_d i_d + v_q i_q) [W]. */
  pElec: number;
  /** Mechanical power delivered to the shaft, T·ω_mech [W]. */
  pMech: number;
  /** Copper (Joule) loss (3/2)·Rₛ·(i_d² + i_q²) [W], ≥ 0. */
  pCu: number;
  /** Efficiency in [0, 1]: P_mech/P_elec (motor) or P_elec/P_mech (generator); NaN if undefined. */
  efficiency: number;
}

/** PI current-controller gains of {@link pmsmCurrentControllerGains}. */
export interface PmsmCurrentController {
  kpd: number;
  kid: number;
  kpq: number;
  kiq: number;
}

/**
 * State of the dynamic current-control model: d-q currents and the two PI
 * integrators x = ∫(i* − i) dt.
 */
export interface PmsmDynState {
  id: number;
  iq: number;
  xd: number;
  xq: number;
}

/** Inputs of {@link pmsmDynamicsStep} that stay constant during one step. */
export interface PmsmDynInputs {
  /** Current set-points [A]. */
  idRef: number;
  iqRef: number;
  /** Electrical speed ωₑ [rad/s] (imposed: the shaft speed is held by the load). */
  omegaE: number;
  /** Inverter voltage limit V_max [V] (> 0). */
  vMax: number;
}

// ---------------------------------------------------------------------------
// Validation helpers (internal)
// ---------------------------------------------------------------------------

function checkParams(fn: string, m: PmsmParams): void {
  nonNegative(fn, 'Rs', m.Rs);
  positive(fn, 'Ld', m.Ld);
  positive(fn, 'Lq', m.Lq);
  nonNegative(fn, 'psiM', m.psiM);
  positive(fn, 'p', m.p);
  if (!Number.isInteger(m.p)) throw new RangeError(`${fn}: p must be an integer (got ${m.p})`);
}

const SQRT3 = Math.sqrt(3);

// ---------------------------------------------------------------------------
// Clarke / Park transforms
// ---------------------------------------------------------------------------

/**
 * Clarke transform (amplitude-invariant): three phase quantities → stationary
 * (α, β) frame plus zero-sequence component.
 *
 * α = (2/3)·(a − b/2 − c/2),  β = (b − c)/√3,  0 = (a + b + c)/3
 *
 * A balanced set a = X cos θ, b = X cos(θ − 2π/3), c = X cos(θ + 2π/3) gives
 * (α, β) = X·(cos θ, sin θ): the vector length equals the phase amplitude X.
 *
 * @param ia - phase-a quantity (A or V)
 * @param ib - phase-b quantity
 * @param ic - phase-c quantity
 * @returns `{ alpha, beta, zero }` in the same unit
 * @throws RangeError on non-finite input
 * @slide none (extension: d-q model; generalises the single phase of s18–19)
 */
export function clarke(
  ia: number,
  ib: number,
  ic: number,
): { alpha: number; beta: number; zero: number } {
  const fn = 'clarke';
  finite(fn, 'ia', ia);
  finite(fn, 'ib', ib);
  finite(fn, 'ic', ic);
  return {
    alpha: noNegZero((2 / 3) * (ia - 0.5 * ib - 0.5 * ic)),
    beta: noNegZero((ib - ic) / SQRT3),
    zero: noNegZero((ia + ib + ic) / 3),
  };
}

/**
 * Inverse Clarke transform (amplitude-invariant).
 *
 * a = α + 0,  b = −α/2 + (√3/2)β + 0,  c = −α/2 − (√3/2)β + 0
 *
 * @param alpha - α component
 * @param beta - β component
 * @param zero - zero-sequence component (default 0: three-wire machine)
 * @returns `{ a, b, c }` phase quantities
 * @throws RangeError on non-finite input
 * @slide none (extension: d-q model)
 */
export function inverseClarke(
  alpha: number,
  beta: number,
  zero = 0,
): { a: number; b: number; c: number } {
  const fn = 'inverseClarke';
  finite(fn, 'alpha', alpha);
  finite(fn, 'beta', beta);
  finite(fn, 'zero', zero);
  const h = (SQRT3 / 2) * beta;
  return {
    a: noNegZero(alpha + zero),
    b: noNegZero(-0.5 * alpha + h + zero),
    c: noNegZero(-0.5 * alpha - h + zero),
  };
}

/**
 * Park transform: stationary (α, β) → rotor frame (d, q) rotating at the
 * electrical angle θₑ.
 *
 * d = α cos θₑ + β sin θₑ,  q = −α sin θₑ + β cos θₑ
 *
 * @param alpha - α component
 * @param beta - β component
 * @param thetaE - electrical rotor angle θₑ = p·θ_mech [rad]
 * @returns `{ d, q }`
 * @throws RangeError on non-finite input
 * @slide none (extension: d-q model)
 */
export function park(alpha: number, beta: number, thetaE: number): { d: number; q: number } {
  const fn = 'park';
  finite(fn, 'alpha', alpha);
  finite(fn, 'beta', beta);
  finite(fn, 'thetaE', thetaE);
  const c = Math.cos(thetaE);
  const s = Math.sin(thetaE);
  return { d: noNegZero(alpha * c + beta * s), q: noNegZero(-alpha * s + beta * c) };
}

/**
 * Inverse Park transform: rotor frame (d, q) → stationary (α, β).
 *
 * α = d cos θₑ − q sin θₑ,  β = d sin θₑ + q cos θₑ
 *
 * @param d - d component
 * @param q - q component
 * @param thetaE - electrical rotor angle [rad]
 * @returns `{ alpha, beta }`
 * @throws RangeError on non-finite input
 * @slide none (extension: d-q model)
 */
export function inversePark(d: number, q: number, thetaE: number): { alpha: number; beta: number } {
  const fn = 'inversePark';
  finite(fn, 'd', d);
  finite(fn, 'q', q);
  finite(fn, 'thetaE', thetaE);
  const c = Math.cos(thetaE);
  const s = Math.sin(thetaE);
  return { alpha: noNegZero(d * c - q * s), beta: noNegZero(d * s + q * c) };
}

/**
 * Phase quantities (a, b, c) of a d-q vector at the electrical angle θₑ
 * (inverse Park followed by inverse Clarke, zero sequence 0).
 *
 * @param d - d component
 * @param q - q component
 * @param thetaE - electrical angle [rad]
 * @returns `{ a, b, c }`
 * @slide none (extension: d-q model)
 */
export function dqToAbc(d: number, q: number, thetaE: number): { a: number; b: number; c: number } {
  const ab = inversePark(d, q, thetaE);
  return inverseClarke(ab.alpha, ab.beta, 0);
}

// ---------------------------------------------------------------------------
// Steady-state machine equations
// ---------------------------------------------------------------------------

/**
 * Steady-state d-q stator voltages (motor convention, constant currents).
 *
 * v_d = Rₛ i_d − ωₑ L_q i_q
 * v_q = Rₛ i_q + ωₑ L_d i_d + ωₑ ψₘ
 *
 * With i = 0, |v| = ωₑ ψₘ: the three-phase analogue of the peak f.e.m.
 * V₀ = N B S ω of the rotating loop (slides 18–19) with ψₘ ↔ N B S.
 *
 * @param id - d-axis current [A]
 * @param iq - q-axis current [A]
 * @param omegaE - electrical angular speed ωₑ = p·ω_mech [rad/s]
 * @param m - machine parameters
 * @returns `{ vd, vq }` [V] (peak phase-voltage components)
 * @throws RangeError on invalid parameters or non-finite input
 * @slide none (extension: d-q model; ωₑψₘ is the per-phase V₀ = NBSω of s18–19)
 */
export function pmsmVoltages(
  id: number,
  iq: number,
  omegaE: number,
  m: PmsmParams,
): { vd: number; vq: number } {
  const fn = 'pmsmVoltages';
  finite(fn, 'id', id);
  finite(fn, 'iq', iq);
  finite(fn, 'omegaE', omegaE);
  checkParams(fn, m);
  return {
    vd: noNegZero(m.Rs * id - omegaE * m.Lq * iq),
    vq: noNegZero(m.Rs * iq + omegaE * m.Ld * id + omegaE * m.psiM),
  };
}

/**
 * Electromagnetic torque of the PMSM (amplitude-invariant d-q quantities).
 *
 * T = (3/2)·p·[ψₘ i_q + (L_d − L_q) i_d i_q]
 *
 * First term: magnet ("Lorentz") torque, the three-phase version of
 * F = B I L on the conductors; second term: reluctance torque (zero when
 * L_d = L_q).
 *
 * @param id - d-axis current [A]
 * @param iq - q-axis current [A]
 * @param m - machine parameters
 * @returns torque [N·m] (> 0 motoring for positive speed)
 * @throws RangeError on invalid parameters or non-finite input
 * @slide none (extension: d-q model)
 */
export function pmsmTorque(id: number, iq: number, m: PmsmParams): number {
  const fn = 'pmsmTorque';
  finite(fn, 'id', id);
  finite(fn, 'iq', iq);
  checkParams(fn, m);
  return noNegZero(1.5 * m.p * (m.psiM * iq + (m.Ld - m.Lq) * id * iq));
}

/**
 * Copper (Joule) loss of the three stator phases.
 *
 * P_Cu = (3/2)·Rₛ·(i_d² + i_q²)  (= 3·Rₛ·I_rms²)
 *
 * @param id - d-axis current [A]
 * @param iq - q-axis current [A]
 * @param Rs - phase resistance [Ω], ≥ 0
 * @returns loss [W], ≥ 0
 * @throws RangeError if Rs < 0 or non-finite input
 * @slide 16 (the R·i² term of the energy balance, three phases)
 */
export function pmsmCopperLoss(id: number, iq: number, Rs: number): number {
  const fn = 'pmsmCopperLoss';
  finite(fn, 'id', id);
  finite(fn, 'iq', iq);
  nonNegative(fn, 'Rs', Rs);
  return 1.5 * Rs * (id * id + iq * iq);
}

/**
 * Electrical power at the stator terminals (amplitude-invariant quantities).
 *
 * P_elec = (3/2)·(v_d i_d + v_q i_q)
 *
 * @param vd - d-axis voltage [V]
 * @param vq - q-axis voltage [V]
 * @param id - d-axis current [A]
 * @param iq - q-axis current [A]
 * @returns power [W] (> 0 absorbed from the inverter, < 0 sent to the battery)
 * @throws RangeError on non-finite input
 * @slide none (extension: d-q model)
 */
export function pmsmElectricalPower(vd: number, vq: number, id: number, iq: number): number {
  const fn = 'pmsmElectricalPower';
  finite(fn, 'vd', vd);
  finite(fn, 'vq', vq);
  finite(fn, 'id', id);
  finite(fn, 'iq', iq);
  return noNegZero(1.5 * (vd * id + vq * iq));
}

/**
 * Complete steady-state operating point: voltages, torque and power balance.
 *
 * P_elec = P_mech + P_Cu holds exactly (iron losses neglected):
 * (3/2)(v_d i_d + v_q i_q) = (3/2)Rₛ(i_d² + i_q²) + (3/2)ωₑ[ψₘ i_q + (L_d − L_q) i_d i_q]
 * and T·ω_mech = T·ωₑ/p.
 *
 * Efficiency: motoring (P_mech > 0) η = P_mech/P_elec; generating (P_mech < 0)
 * η = P_elec/P_mech (battery power / shaft power). NaN when the denominator is 0
 * or when the machine only dissipates (e.g. braking current at low speed).
 *
 * @param id - d-axis current [A]
 * @param iq - q-axis current [A]
 * @param omegaMech - mechanical speed [rad/s]
 * @param m - machine parameters
 * @returns {@link PmsmOperatingPoint}
 * @throws RangeError on invalid parameters or non-finite input
 * @slide 16 (energy balance generalised to three phases)
 */
export function pmsmOperatingPoint(
  id: number,
  iq: number,
  omegaMech: number,
  m: PmsmParams,
): PmsmOperatingPoint {
  const fn = 'pmsmOperatingPoint';
  finite(fn, 'omegaMech', omegaMech);
  checkParams(fn, m);
  const omegaE = m.p * omegaMech;
  const { vd, vq } = pmsmVoltages(id, iq, omegaE, m);
  const torque = pmsmTorque(id, iq, m);
  const pElec = pmsmElectricalPower(vd, vq, id, iq);
  const pMech = noNegZero(torque * omegaMech);
  const pCu = pmsmCopperLoss(id, iq, m.Rs);
  return {
    vd,
    vq,
    vMag: Math.hypot(vd, vq),
    iMag: Math.hypot(id, iq),
    torque,
    omegaMech,
    pElec,
    pMech,
    pCu,
    efficiency: pmsmEfficiency(pElec, pMech),
  };
}

/**
 * Efficiency from the two powers of {@link pmsmOperatingPoint}.
 *
 * η = P_mech/P_elec if P_mech > 0 (motor); η = P_elec/P_mech if P_mech < 0
 * (generator, both negative). NaN when undefined (zero power, or a ratio
 * outside [0, 1], i.e. the machine only dissipates).
 *
 * @param pElec - electrical power [W]
 * @param pMech - mechanical power [W]
 * @returns η ∈ [0, 1] or NaN
 * @slide 16 (energy balance)
 */
export function pmsmEfficiency(pElec: number, pMech: number): number {
  let eta = Number.NaN;
  if (pMech > 0 && pElec > 0) eta = pMech / pElec;
  else if (pMech < 0 && pElec < 0) eta = pElec / pMech;
  return eta >= 0 && eta <= 1 ? eta : Number.NaN;
}

// ---------------------------------------------------------------------------
// Operating limits: MTPA, voltage limit, maximum torque, envelope
// ---------------------------------------------------------------------------

/**
 * Inverter voltage limit: maximum peak phase voltage in the linear modulation
 * range of space-vector PWM (or sine PWM with third-harmonic injection).
 *
 * V_max = V_DC / √3
 *
 * @param vdc - DC-bus voltage [V], > 0
 * @returns V_max [V]
 * @throws RangeError if vdc ≤ 0
 * @slide none (extension: inverter limit)
 */
export function pmsmVoltageLimit(vdc: number): number {
  positive('pmsmVoltageLimit', 'vdc', vdc);
  return vdc / SQRT3;
}

/**
 * Maximum-torque-per-ampere (MTPA) currents for a current amplitude I
 * (closed form, salient machine):
 *
 * i_d = [ψₘ − √(ψₘ² + 8 (L_q − L_d)² I²)] / [4 (L_q − L_d)]
 *     = −2 (L_q − L_d) I² / [ψₘ + √(ψₘ² + 8 (L_q − L_d)² I²)]   (form used: stable for L_d → L_q)
 * i_q = ±√(I² − i_d²)
 *
 * For L_d = L_q (surface magnets) it reduces to i_d = 0, i_q = ±I. The degenerate
 * machine ψₘ = 0 with L_d = L_q produces no torque at all (T ≡ 0); the same
 * i_d = 0, i_q = ±I is returned instead of the 0/0 of the closed form.
 *
 * @param iAmp - current amplitude I [A], ≥ 0
 * @param m - machine parameters
 * @param mode - 'motor' (i_q ≥ 0, T ≥ 0) or 'generator' (i_q ≤ 0, T ≤ 0); default 'motor'
 * @returns `{ id, iq }` [A]
 * @throws RangeError on invalid parameters or I < 0
 * @slide none (extension: d-q model)
 */
export function pmsmMtpa(
  iAmp: number,
  m: PmsmParams,
  mode: PmsmMode = 'motor',
): { id: number; iq: number } {
  const fn = 'pmsmMtpa';
  nonNegative(fn, 'iAmp', iAmp);
  checkParams(fn, m);
  if (iAmp === 0) return { id: 0, iq: 0 };
  const dL = m.Lq - m.Ld;
  // ψₘ = 0 and L_d = L_q: no torque-producing mechanism, T ≡ 0 for every split;
  // the closed form would be 0/0. Return the SPM limit i_d = 0, i_q = ±I (QA-024).
  if (m.psiM === 0 && dL === 0) return { id: 0, iq: mode === 'motor' ? iAmp : -iAmp };
  const root = Math.sqrt(m.psiM * m.psiM + 8 * dL * dL * iAmp * iAmp);
  const id = noNegZero((-2 * dL * iAmp * iAmp) / (m.psiM + root));
  const iq = Math.sqrt(Math.max(0, iAmp * iAmp - id * id));
  return { id, iq: mode === 'motor' ? iq : noNegZero(-iq) };
}

/**
 * Speed at which the MTPA point at I_max reaches the voltage limit (motoring):
 * the end of the constant-torque region ("velocità base").
 *
 * Solves |v(i_MTPA(I_max), p·ω_b)| = V_max by bisection (|v|² is a quadratic in
 * ω, increasing for ω > 0 in motoring).
 *
 * @param m - machine parameters
 * @param iMax - current limit [A], > 0
 * @param vMax - voltage limit [V], > 0
 * @returns ω_base [rad/s] (0 if Rₛ·I_max already exceeds V_max)
 * @throws RangeError on invalid input
 * @slide none (extension: d-q model)
 */
export function pmsmBaseSpeed(m: PmsmParams, iMax: number, vMax: number): number {
  const fn = 'pmsmBaseSpeed';
  checkParams(fn, m);
  positive(fn, 'iMax', iMax);
  positive(fn, 'vMax', vMax);
  const { id, iq } = pmsmMtpa(iMax, m, 'motor');
  const g = (w: number): number => {
    const v = pmsmVoltages(id, iq, m.p * w, m);
    return Math.hypot(v.vd, v.vq) - vMax;
  };
  if (g(0) >= 0) return 0;
  let hi = 1;
  while (g(hi) < 0) hi *= 2; // |v| grows ∝ ω (iq > 0 ⇒ Lq·iq > 0): terminates
  let lo = 0;
  for (let k = 0; k < 100; k++) {
    const mid = 0.5 * (lo + hi);
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Number of samples per boundary curve in {@link pmsmMaxTorque}. */
const BOUNDARY_SAMPLES = 720;

/**
 * Maximum torque (motor) or maximum braking torque (generator) the machine can
 * develop at a given speed under the current limit √(i_d² + i_q²) ≤ I_max and
 * the steady-state voltage limit √(v_d² + v_q²) ≤ V_max.
 *
 * The voltage limit is an ellipse in the (i_d, i_q) plane (v is an affine
 * function of i; Rₛ is included, so the ellipse is slightly tilted). Since T has
 * no interior maximum, the optimum lies on the boundary of the intersection of
 * the circle and the ellipse:
 * - MTPA point inside the ellipse → region `'mtpa'` (constant torque);
 * - otherwise on the circle/ellipse intersection → `'field-weakening'`;
 * - or on the ellipse inside the circle → `'mtpv'`;
 * - empty intersection → `'infeasible'` (torque 0).
 *
 * Numerical method (deterministic): both boundary curves are sampled
 * (720 points each), the best feasible sample is refined by bisection on the
 * constraint crossing or by golden-section search (relative accuracy ≈ 1e-9).
 * With Rₛ = 0 the generator result is the exact mirror (i_q → −i_q) of the
 * motor one; with Rₛ > 0 braking has slightly more voltage margin.
 *
 * @param omegaMech - mechanical speed [rad/s] (≥ 0)
 * @param m - machine parameters
 * @param iMax - current limit [A], > 0
 * @param vMax - voltage limit [V], > 0
 * @param mode - 'motor' (maximise T) or 'generator' (minimise T); default 'motor'
 * @returns {@link PmsmMaxTorquePoint}
 * @throws RangeError on invalid input
 * @slide none (extension: d-q model; explains the power-limited recovery of theory 10)
 */
export function pmsmMaxTorque(
  omegaMech: number,
  m: PmsmParams,
  iMax: number,
  vMax: number,
  mode: PmsmMode = 'motor',
): PmsmMaxTorquePoint {
  const fn = 'pmsmMaxTorque';
  nonNegative(fn, 'omegaMech', omegaMech);
  checkParams(fn, m);
  positive(fn, 'iMax', iMax);
  positive(fn, 'vMax', vMax);
  const w = m.p * omegaMech;
  const sgn = mode === 'motor' ? 1 : -1;
  const torqueOf = (id: number, iq: number): number =>
    1.5 * m.p * (m.psiM * iq + (m.Ld - m.Lq) * id * iq);
  const vOf = (id: number, iq: number): number =>
    Math.hypot(m.Rs * id - w * m.Lq * iq, m.Rs * iq + w * m.Ld * id + w * m.psiM);
  const tolV = vMax * 1e-12;
  const okV = (id: number, iq: number): boolean => vOf(id, iq) <= vMax + tolV;
  const tolI = iMax * 1e-12;
  const okI = (id: number, iq: number): boolean => Math.hypot(id, iq) <= iMax + tolI;
  const result = (id: number, iq: number, region: PmsmRegion): PmsmMaxTorquePoint => {
    const torque = noNegZero(torqueOf(id, iq));
    return {
      torque,
      id: noNegZero(id),
      iq: noNegZero(iq),
      power: noNegZero(torque * omegaMech),
      region,
    };
  };

  // 1. MTPA at I_max: the unconstrained maximum on the disk.
  const mtpa = pmsmMtpa(iMax, m, mode);
  if (okV(mtpa.id, mtpa.iq)) return result(mtpa.id, mtpa.iq, 'mtpa');

  // 2. Boundary curves: circle (angle γ) and voltage ellipse (angle t).
  const circle = (g: number): [number, number] => [iMax * Math.cos(g), iMax * Math.sin(g)];
  const det = m.Rs * m.Rs + w * w * m.Ld * m.Lq; // det of v = A·i + b (> 0 here: w > 0 or Rs > 0)
  const ellipse = (t: number): [number, number] => {
    // i = A⁻¹ (V_max·(cos t, sin t) − b), A = [[Rs, −w Lq], [w Ld, Rs]], b = (0, w ψ)
    const x = vMax * Math.cos(t);
    const y = vMax * Math.sin(t) - w * m.psiM;
    return [(m.Rs * x + w * m.Lq * y) / det, (-w * m.Ld * x + m.Rs * y) / det];
  };
  const objective = ([id, iq]: [number, number]): number => sgn * torqueOf(id, iq);

  interface Candidate {
    id: number;
    iq: number;
    f: number;
  }
  const step = (2 * Math.PI) / BOUNDARY_SAMPLES;
  const wrap = (k: number): number =>
    ((k % BOUNDARY_SAMPLES) + BOUNDARY_SAMPLES) % BOUNDARY_SAMPLES;
  /** Best feasible point of one boundary curve (sampled, then refined), or null. */
  const scan = (
    curve: (s: number) => [number, number],
    ok: (pt: [number, number]) => boolean,
  ): Candidate | null => {
    let best: Candidate | null = null;
    const consider = (pt: [number, number]): void => {
      const f = objective(pt);
      if (best === null || f > best.f) best = { id: pt[0], iq: pt[1], f };
    };
    const feas: boolean[] = [];
    let kBest = -1;
    let fBest = -Infinity;
    for (let k = 0; k < BOUNDARY_SAMPLES; k++) {
      const pt = curve(k * step);
      const isOk = ok(pt);
      feas.push(isOk);
      const f = objective(pt);
      if (isOk && f > fBest) {
        fBest = f;
        kBest = k;
      }
    }
    if (kBest < 0) return null;
    const s0 = kBest * step;
    consider(curve(s0));
    for (const dir of [-1, 1]) {
      if (feas[wrap(kBest + dir)]) continue;
      // constraint crossing between s0 (feasible) and s0 + dir·step: bisection
      let a = 0;
      let b = 1;
      for (let it = 0; it < 80; it++) {
        const mid = 0.5 * (a + b);
        if (ok(curve(s0 + dir * mid * step))) a = mid;
        else b = mid;
      }
      consider(curve(s0 + dir * a * step));
    }
    if (feas[wrap(kBest - 1)] && feas[wrap(kBest + 1)]) {
      // interior local maximum on the arc: golden-section search on [s0 − step, s0 + step]
      const gr = (Math.sqrt(5) - 1) / 2;
      let a = s0 - step;
      let b = s0 + step;
      for (let it = 0; it < 80; it++) {
        const c = b - gr * (b - a);
        const d = a + gr * (b - a);
        if (objective(curve(c)) > objective(curve(d))) b = d;
        else a = c;
      }
      const pt = curve(0.5 * (a + b));
      if (ok(pt)) consider(pt);
    }
    return best;
  };

  const onCircle = scan(circle, ([id, iq]) => okV(id, iq));
  const onEllipse = det > 0 ? scan(ellipse, ([id, iq]) => okI(id, iq)) : null;
  let pick: Candidate | null = onCircle;
  if (onEllipse !== null && (pick === null || onEllipse.f > pick.f)) pick = onEllipse;
  if (pick === null || pick.f <= 0) {
    return { torque: 0, id: 0, iq: 0, power: 0, region: 'infeasible' };
  }
  const onI = Math.abs(Math.hypot(pick.id, pick.iq) - iMax) <= iMax * 1e-6;
  return result(pick.id, pick.iq, onI ? 'field-weakening' : 'mtpv');
}

/**
 * Torque–speed (and power–speed) envelope for motoring and braking: constant
 * torque up to the base speed (MTPA at I_max), then field weakening (≈ constant
 * power) and, if reached, MTPV; zero beyond the maximum speed.
 *
 * @param m - machine parameters
 * @param iMax - current limit [A], > 0
 * @param vMax - voltage limit [V], > 0
 * @param omegaMax - highest mechanical speed sampled [rad/s], > 0
 * @param n - number of samples (≥ 2, default 121), equally spaced from 0 to omegaMax
 * @returns `{ baseSpeed, points }`
 * @throws RangeError on invalid input
 * @slide none (extension: d-q model)
 */
export function pmsmTorqueSpeedEnvelope(
  m: PmsmParams,
  iMax: number,
  vMax: number,
  omegaMax: number,
  n = 121,
): { baseSpeed: number; points: PmsmEnvelopePoint[] } {
  const fn = 'pmsmTorqueSpeedEnvelope';
  positive(fn, 'omegaMax', omegaMax);
  if (!Number.isInteger(n) || n < 2)
    throw new RangeError(`${fn}: n must be an integer ≥ 2 (got ${n})`);
  const baseSpeed = pmsmBaseSpeed(m, iMax, vMax);
  const points: PmsmEnvelopePoint[] = [];
  for (let k = 0; k < n; k++) {
    const omegaMech = (omegaMax * k) / (n - 1);
    const mot = pmsmMaxTorque(omegaMech, m, iMax, vMax, 'motor');
    const gen = pmsmMaxTorque(omegaMech, m, iMax, vMax, 'generator');
    points.push({
      omegaMech,
      tMotor: mot.torque,
      tGen: gen.torque,
      pMotor: mot.power,
      pGen: gen.power,
      regionMotor: mot.region,
      regionGen: gen.region,
    });
  }
  return { baseSpeed, points };
}

// ---------------------------------------------------------------------------
// Dynamic model: d-q current dynamics with PI current control
// ---------------------------------------------------------------------------

/**
 * d-q current dynamics (motor convention, linear magnetics):
 *
 * L_d di_d/dt = v_d − Rₛ i_d + ωₑ L_q i_q
 * L_q di_q/dt = v_q − Rₛ i_q − ωₑ L_d i_d − ωₑ ψₘ
 *
 * In steady state (d/dt = 0) these reduce to {@link pmsmVoltages}. Each axis is
 * an RL circuit (slide 15) plus the speed-voltage coupling terms.
 *
 * @param id - d current [A]
 * @param iq - q current [A]
 * @param vd - applied d voltage [V]
 * @param vq - applied q voltage [V]
 * @param omegaE - electrical speed [rad/s]
 * @param m - machine parameters
 * @returns `[di_d/dt, di_q/dt]` [A/s]
 * @throws RangeError on invalid parameters or non-finite input
 * @slide 15 (RL circuit per axis), otherwise none (extension: d-q model)
 */
export function pmsmCurrentDerivatives(
  id: number,
  iq: number,
  vd: number,
  vq: number,
  omegaE: number,
  m: PmsmParams,
): [number, number] {
  const fn = 'pmsmCurrentDerivatives';
  finite(fn, 'id', id);
  finite(fn, 'iq', iq);
  finite(fn, 'vd', vd);
  finite(fn, 'vq', vq);
  finite(fn, 'omegaE', omegaE);
  checkParams(fn, m);
  return [
    (vd - m.Rs * id + omegaE * m.Lq * iq) / m.Ld,
    (vq - m.Rs * iq - omegaE * m.Ld * id - omegaE * m.psiM) / m.Lq,
  ];
}

/**
 * PI current-controller gains by pole-zero cancellation (technical optimum):
 * k_p = L·ω_c, k_i = Rₛ·ω_c per axis. With the decoupling feed-forward of
 * {@link pmsmControllerVoltages}, each closed loop is first order:
 * i(t) = i*·(1 − e^(−ω_c t)) (like the RL extracurrent of slide 15, τ = 1/ω_c).
 *
 * @param m - machine parameters
 * @param bandwidth - closed-loop bandwidth ω_c [rad/s], > 0
 * @returns {@link PmsmCurrentController}
 * @throws RangeError on invalid input
 * @slide 15 (first-order response), otherwise none (extension)
 */
export function pmsmCurrentControllerGains(
  m: PmsmParams,
  bandwidth: number,
): PmsmCurrentController {
  const fn = 'pmsmCurrentControllerGains';
  checkParams(fn, m);
  positive(fn, 'bandwidth', bandwidth);
  return {
    kpd: m.Ld * bandwidth,
    kid: m.Rs * bandwidth,
    kpq: m.Lq * bandwidth,
    kiq: m.Rs * bandwidth,
  };
}

/**
 * Voltage commanded by the PI current controller with decoupling feed-forward,
 * limited to the inverter circle |v| ≤ V_max (ideal inverter otherwise).
 *
 * u_d = k_pd (i_d* − i_d) + k_id x_d − ωₑ L_q i_q
 * u_q = k_pq (i_q* − i_q) + k_iq x_q + ωₑ (L_d i_d + ψₘ)
 * if |u| > V_max: v = u·V_max/|u| (saturated), else v = u
 *
 * @param s - controller/machine state
 * @param inp - set-points, speed and voltage limit
 * @param m - machine parameters
 * @param c - controller gains
 * @returns `{ vd, vq, saturated }`
 * @slide none (extension: current control)
 */
export function pmsmControllerVoltages(
  s: PmsmDynState,
  inp: PmsmDynInputs,
  m: PmsmParams,
  c: PmsmCurrentController,
): { vd: number; vq: number; saturated: boolean } {
  const ud = c.kpd * (inp.idRef - s.id) + c.kid * s.xd - inp.omegaE * m.Lq * s.iq;
  const uq = c.kpq * (inp.iqRef - s.iq) + c.kiq * s.xq + inp.omegaE * (m.Ld * s.id + m.psiM);
  const mag = Math.hypot(ud, uq);
  if (mag > inp.vMax) {
    const k = inp.vMax / mag;
    return { vd: ud * k, vq: uq * k, saturated: true };
  }
  return { vd: ud, vq: uq, saturated: false };
}

/**
 * Advance the current-controlled machine by `dt` with fixed-step RK4
 * ({@link rk4Step}), split into equal sub-steps so that h·λ ≤ 0,25 for the
 * fastest rate λ = max(ω_c, |ωₑ|, Rₛ/L) of the model (deterministic: the number
 * of sub-steps depends only on the inputs). Integrator anti-windup: x stops
 * integrating while the voltage is saturated.
 *
 * @param s - state at t
 * @param inp - set-points, ωₑ and V_max (constant over the step)
 * @param m - machine parameters
 * @param c - controller gains
 * @param dt - time step [s], ≥ 0 (e.g. PHYSICS_DT scaled by the slow-motion factor)
 * @returns state at t + dt
 * @throws RangeError on invalid input
 * @slide none (extension: d-q dynamic model; RK4 per §4.1)
 */
export function pmsmDynamicsStep(
  s: PmsmDynState,
  inp: PmsmDynInputs,
  m: PmsmParams,
  c: PmsmCurrentController,
  dt: number,
): PmsmDynState {
  const fn = 'pmsmDynamicsStep';
  checkParams(fn, m);
  nonNegative(fn, 'dt', dt);
  positive(fn, 'vMax', inp.vMax);
  finite(fn, 'omegaE', inp.omegaE);
  finite(fn, 'idRef', inp.idRef);
  finite(fn, 'iqRef', inp.iqRef);
  for (const [k, v] of Object.entries(s)) finite(fn, k, v as number);
  if (dt === 0) return { ...s };
  const lambda = Math.max(
    c.kpd / m.Ld,
    c.kpq / m.Lq,
    Math.abs(inp.omegaE),
    m.Rs / Math.min(m.Ld, m.Lq),
    1e-9,
  );
  const nSub = Math.max(1, Math.ceil((dt * lambda) / 0.25));
  const h = dt / nSub;
  const f = (_t: number, y: readonly number[]): number[] => {
    const st: PmsmDynState = {
      id: y[0] as number,
      iq: y[1] as number,
      xd: y[2] as number,
      xq: y[3] as number,
    };
    const v = pmsmControllerVoltages(st, inp, m, c);
    const did = (v.vd - m.Rs * st.id + inp.omegaE * m.Lq * st.iq) / m.Ld;
    const diq = (v.vq - m.Rs * st.iq - inp.omegaE * m.Ld * st.id - inp.omegaE * m.psiM) / m.Lq;
    return [did, diq, v.saturated ? 0 : inp.idRef - st.id, v.saturated ? 0 : inp.iqRef - st.iq];
  };
  let y = [s.id, s.iq, s.xd, s.xq];
  for (let k = 0; k < nSub; k++) y = rk4Step(f, k * h, y, h);
  return { id: y[0] as number, iq: y[1] as number, xd: y[2] as number, xq: y[3] as number };
}

/**
 * Integrator values that make the controller output exactly the steady-state
 * voltages for constant currents i_d = i_d*, i_q = i_q* (start-up without
 * transient): x = Rₛ·i* ÷ k_i (0 if k_i = 0).
 *
 * @param idRef - d set-point [A]
 * @param iqRef - q set-point [A]
 * @param m - machine parameters
 * @param c - controller gains
 * @returns steady state {@link PmsmDynState}
 * @slide none (extension)
 */
export function pmsmSteadyDynState(
  idRef: number,
  iqRef: number,
  m: PmsmParams,
  c: PmsmCurrentController,
): PmsmDynState {
  return {
    id: idRef,
    iq: iqRef,
    xd: c.kid > 0 ? (m.Rs * idRef) / c.kid : 0,
    xq: c.kiq > 0 ? (m.Rs * iqRef) / c.kiq : 0,
  };
}
