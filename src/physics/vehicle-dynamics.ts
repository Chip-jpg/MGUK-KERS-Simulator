/**
 * Longitudinal car dynamics in a braking zone (Phase 4 extension, `car-dynamics`).
 *
 * Extends the constant-deceleration model of {@link kersBrakingEvent} with tyres,
 * aerodynamics and per-axle braking. Full model, assumptions and validity limits:
 * docs/PHYSICS.md § "Car dynamics (Phase 4)".
 *
 * Model summary:
 * - point-mass car on a straight, flat road; only longitudinal motion (no pitch
 *   dynamics, no wheel rotational inertia, no rolling resistance);
 * - aerodynamics: drag D = ½ρC_dA v², downforce L = ½ρC_lA v²; the drag acts at
 *   the height of the centre of gravity (no pitch moment) and the downforce is
 *   split between the axles like the weight (`weightFront`);
 * - tyres: simplified longitudinal Pacejka "magic formula" with peak friction
 *   D = μ at the slip κ*. Ideal ABS: the axle that limits the braking works at κ*
 *   (μ·F_z), the other one at the smaller slip set by the brake balance;
 * - brake balance β = FRONT share of the total tyre braking force; longitudinal
 *   load transfer ΔF_z = F_x·h/L from the rear to the front axle;
 * - the MGU-K brakes the REAR axle only (model assumption). Following D8, `Pmax`
 *   is its ELECTRICAL cap, so it absorbs at most P_max/η of mechanical power:
 *   F_MGU-K = min(F_x,rear, (P_max/η)/v); the rear friction brakes supply the rest
 *   (ideal brake-by-wire blending);
 * - integration: {@link rk4Step} with dt = 1/240 s; the last step is shortened so
 *   that the zone ends exactly at v₂.
 *
 * Energy bookkeeping (exact for the ODE, conserved by RK4 to ≪ 10⁻⁶):
 * ½m(v₁² − v₂²) = E_MGU-K (mechanical) + E_brakes,front + E_brakes,rear + E_aero,
 * with E_stored = η·E_MGU-K ≤ P_max·t and MGU-K/converter losses (1 − η)·E_MGU-K.
 */
import { PHYSICS_DT } from './constants';
import { rk4Step } from './ode';
import { finite, noNegZero, nonNegative, positive } from './validate';

/** Standard gravity g₀ [m/s²] (exact by definition). */
export const G_STANDARD = 9.80665;

/** Air density of the ISA standard atmosphere at sea level, 15 °C [kg/m³]. */
export const AIR_DENSITY_STD = 1.225;

/**
 * Coefficients of the simplified longitudinal Pacejka magic formula
 * Fx = F_z · D · sin(C · atan(Bκ − E(Bκ − atan Bκ))).
 * `D` is the peak friction coefficient μ (dimensionless here: Fx is F_z·D at the peak).
 */
export interface PacejkaCoeffs {
  /** Stiffness factor B [–], > 0. */
  B: number;
  /** Shape factor C [–], 1 < C ≤ 2 (a peak exists and Fx ≥ 0 for κ ≥ 0). */
  C: number;
  /** Peak factor D = μ_peak [–], > 0. */
  D: number;
  /** Curvature factor E [–], E < 1. */
  E: number;
}

/** Tyre shape without the peak factor (D comes from μ). */
export type PacejkaShape = Omit<PacejkaCoeffs, 'D'>;

/**
 * Illustrative tyre shape (B = 12, C = 1,9, E = 0,5 ⇒ κ* ≈ 0,106). Not the data of
 * any real tyre: chosen only to give a textbook-like curve with the peak near 10 %.
 */
export const PACEJKA_ILLUSTRATIVE: Readonly<PacejkaShape> = { B: 12, C: 1.9, E: 0.5 };

function checkPacejka(fn: string, c: PacejkaCoeffs): void {
  positive(fn, 'B', c.B);
  finite(fn, 'C', c.C);
  if (!(c.C > 1 && c.C <= 2)) throw new RangeError(`${fn}: C must be in (1, 2] (got ${c.C})`);
  positive(fn, 'D', c.D);
  finite(fn, 'E', c.E);
  if (c.E >= 1) throw new RangeError(`${fn}: E must be < 1 (got ${c.E})`);
}

/** φ(u) = u − E(u − atan u), u = Bκ: strictly increasing for E < 1. */
function phi(u: number, E: number): number {
  return u - E * (u - Math.atan(u));
}

/** Solves φ(u) = target ≥ 0 for u ≥ 0 (bisection to machine precision). */
function invertPhi(target: number, E: number): number {
  if (target <= 0) return 0;
  let lo = 0;
  let hi = 1;
  while (phi(hi, E) < target) hi *= 2;
  for (let k = 0; k < 200 && hi - lo > 1e-15 * hi; k++) {
    const mid = 0.5 * (lo + hi);
    if (phi(mid, E) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Longitudinal tyre force, simplified Pacejka magic formula.
 *
 * Fx = F_z · D · sin(C · atan(Bκ − E(Bκ − atan(Bκ))))
 *
 * Odd in κ (braking slip κ < 0 gives Fx < 0). |Fx| ≤ F_z·D, with the maximum
 * F_z·D = μ_peak·F_z at |κ| = κ* ({@link pacejkaPeakSlip}).
 *
 * @param kappa - longitudinal slip ratio κ [–]
 * @param Fz - vertical load [N], ≥ 0
 * @param c - magic-formula coefficients ({@link PacejkaCoeffs})
 * @returns Fx [N]
 * @throws RangeError on non-finite κ, F_z < 0 or invalid coefficients
 * @slide none (extension: vehicle dynamics; tyre model, not in the induction deck)
 */
export function pacejkaFx(kappa: number, Fz: number, c: PacejkaCoeffs): number {
  const fn = 'pacejkaFx';
  finite(fn, 'kappa', kappa);
  nonNegative(fn, 'Fz', Fz);
  checkPacejka(fn, c);
  const u = c.B * kappa;
  return noNegZero(Fz * c.D * Math.sin(c.C * Math.atan(u - c.E * (u - Math.atan(u)))));
}

/**
 * Slip κ* > 0 at which the magic formula reaches its peak F_z·D:
 * C·atan(φ(Bκ*)) = π/2 ⇔ φ(Bκ*) = tan(π/(2C)), φ(u) = u − E(u − atan u).
 *
 * @param c - magic-formula coefficients (D is not needed)
 * @returns κ* [–]
 * @throws RangeError on invalid coefficients
 * @slide none (extension: vehicle dynamics)
 */
export function pacejkaPeakSlip(c: PacejkaShape): number {
  checkPacejka('pacejkaPeakSlip', { ...c, D: 1 });
  return invertPhi(Math.tan(Math.PI / (2 * c.C)), c.E) / c.B;
}

/**
 * Inverse of the magic formula on the stable branch [0, κ*]: the slip at which the
 * tyre uses the fraction `ratio` = Fx/(F_z·D) of its peak force.
 * φ(Bκ) = tan(asin(ratio)/C). Odd in `ratio`; |ratio| = 1 gives ±κ*.
 *
 * @param ratio - used fraction of the peak force [–], in [−1, 1]
 * @param c - magic-formula coefficients (D is not needed)
 * @returns κ [–], same sign as `ratio`
 * @throws RangeError if |ratio| > 1, non-finite, or invalid coefficients
 * @slide none (extension: vehicle dynamics)
 */
export function pacejkaSlipForRatio(ratio: number, c: PacejkaShape): number {
  const fn = 'pacejkaSlipForRatio';
  finite(fn, 'ratio', ratio);
  if (Math.abs(ratio) > 1) throw new RangeError(`${fn}: |ratio| must be ≤ 1 (got ${ratio})`);
  checkPacejka(fn, { ...c, D: 1 });
  const k = invertPhi(Math.tan(Math.asin(Math.abs(ratio)) / c.C), c.E) / c.B;
  return noNegZero(Math.sign(ratio) * k);
}

/**
 * Aerodynamic drag D = ½ · ρ · C_dA · v² (magnitude; it always opposes the motion).
 *
 * @param v - speed [m/s] (sign ignored)
 * @param rho - air density [kg/m³], ≥ 0
 * @param CdA - drag area C_d·A [m²], ≥ 0
 * @returns drag [N], ≥ 0
 * @throws RangeError on negative ρ or C_dA, or non-finite input
 * @slide none (extension: vehicle dynamics)
 */
export function aeroDrag(v: number, rho: number, CdA: number): number {
  const fn = 'aeroDrag';
  finite(fn, 'v', v);
  nonNegative(fn, 'rho', rho);
  nonNegative(fn, 'CdA', CdA);
  return 0.5 * rho * CdA * v * v;
}

/**
 * Aerodynamic downforce L = ½ · ρ · C_lA · v² (magnitude, pushing the car onto the road).
 *
 * @param v - speed [m/s] (sign ignored)
 * @param rho - air density [kg/m³], ≥ 0
 * @param ClA - downforce area C_l·A [m²], ≥ 0 (lift is not modelled)
 * @returns downforce [N], ≥ 0
 * @throws RangeError on negative ρ or C_lA, or non-finite input
 * @slide none (extension: vehicle dynamics)
 */
export function aeroDownforce(v: number, rho: number, ClA: number): number {
  const fn = 'aeroDownforce';
  finite(fn, 'v', v);
  nonNegative(fn, 'rho', rho);
  nonNegative(fn, 'ClA', ClA);
  return 0.5 * rho * ClA * v * v;
}

/** Car, tyre and MGU-K data (everything except the speeds of the braking zone). */
export interface CarModel {
  /** Mass [kg], > 0. */
  m: number;
  /** MGU-K ELECTRICAL power cap [W], ≥ 0 (may be +∞) — D8. */
  Pmax: number;
  /** MGU-K mechanical → electrical efficiency η [–], in [0, 1]. */
  eta: number;
  /** Drag area C_d·A [m²], ≥ 0. */
  CdA: number;
  /** Downforce area C_l·A [m²], ≥ 0. */
  ClA: number;
  /** Air density [kg/m³], ≥ 0. */
  rho: number;
  /** Peak tyre–road friction coefficient μ (Pacejka D) [–], > 0. */
  mu: number;
  /** Brake balance β: FRONT share of the total tyre braking force [–], in [0, 1]. */
  brakeBalance: number;
  /** Height of the centre of gravity [m], ≥ 0. */
  h: number;
  /** Wheelbase [m], > 0. */
  L: number;
  /** Static front share of weight and downforce [–], in (0, 1). Default 0,45. */
  weightFront?: number;
  /** Tyre shape (B, C, E). Default {@link PACEJKA_ILLUSTRATIVE}. */
  tyre?: PacejkaShape;
  /** Gravity [m/s²], > 0. Default {@link G_STANDARD}. */
  g?: number;
}

/** Input of {@link simulateBrakingZone}. */
export interface CarBrakingParams extends CarModel {
  /** Speed at the braking point [m/s], ≥ v₂. */
  v1: number;
  /** Speed at the end of the braking zone [m/s], ≥ 0. */
  v2: number;
  /** Integration step [s], > 0. Default {@link PHYSICS_DT} = 1/240 s. */
  dt?: number;
}

type ResolvedModel = Required<CarModel>;

/** Default static front weight share of {@link CarModel.weightFront}. */
export const DEFAULT_WEIGHT_FRONT = 0.45;

function resolveModel(fn: string, p: CarModel): ResolvedModel {
  positive(fn, 'm', p.m);
  if (Number.isNaN(p.Pmax) || p.Pmax < 0) {
    throw new RangeError(`${fn}: Pmax must be ≥ 0 (got ${p.Pmax})`);
  }
  finite(fn, 'eta', p.eta);
  if (p.eta < 0 || p.eta > 1) throw new RangeError(`${fn}: eta must be in [0, 1] (got ${p.eta})`);
  nonNegative(fn, 'CdA', p.CdA);
  nonNegative(fn, 'ClA', p.ClA);
  nonNegative(fn, 'rho', p.rho);
  positive(fn, 'mu', p.mu);
  finite(fn, 'brakeBalance', p.brakeBalance);
  if (p.brakeBalance < 0 || p.brakeBalance > 1) {
    throw new RangeError(`${fn}: brakeBalance must be in [0, 1] (got ${p.brakeBalance})`);
  }
  nonNegative(fn, 'h', p.h);
  positive(fn, 'L', p.L);
  const weightFront = p.weightFront ?? DEFAULT_WEIGHT_FRONT;
  finite(fn, 'weightFront', weightFront);
  if (!(weightFront > 0 && weightFront < 1)) {
    throw new RangeError(`${fn}: weightFront must be in (0, 1) (got ${weightFront})`);
  }
  const g = p.g ?? G_STANDARD;
  positive(fn, 'g', g);
  const tyre = p.tyre ?? PACEJKA_ILLUSTRATIVE;
  checkPacejka(fn, { ...tyre, D: p.mu });
  // At the maximum braking force μ·F_z the rear load is F_z(1 − w_f − μh/L): it must stay > 0.
  if ((p.mu * p.h) / p.L >= 1 - weightFront) {
    throw new RangeError(
      `${fn}: μ·h/L must be < 1 − weightFront, otherwise the rear wheels lift (got ${(p.mu * p.h) / p.L})`,
    );
  }
  return { ...p, weightFront, g, tyre: { B: tyre.B, C: tyre.C, E: tyre.E } };
}

/**
 * Brake balance that makes both axles reach their grip limit together:
 * β_ideal = w_f + μ·h/L (weight and downforce split alike, drag at CoG height).
 *
 * @param mu - peak friction μ [–], > 0
 * @param h - CoG height [m], ≥ 0
 * @param L - wheelbase [m], > 0
 * @param weightFront - static front share w_f [–], in (0, 1); default 0,45
 * @returns β_ideal [–] (may exceed 1 for extreme inputs)
 * @throws RangeError on invalid input
 * @slide none (extension: vehicle dynamics)
 */
export function idealBrakeBalance(
  mu: number,
  h: number,
  L: number,
  weightFront = DEFAULT_WEIGHT_FRONT,
): number {
  const fn = 'idealBrakeBalance';
  positive(fn, 'mu', mu);
  nonNegative(fn, 'h', h);
  positive(fn, 'L', L);
  finite(fn, 'weightFront', weightFront);
  if (!(weightFront > 0 && weightFront < 1)) {
    throw new RangeError(`${fn}: weightFront must be in (0, 1) (got ${weightFront})`);
  }
  return weightFront + (mu * h) / L;
}

/** Which axle limits the braking force (`both` at the ideal brake balance). */
export type BrakeLimit = 'front' | 'rear' | 'both';

/**
 * What limits the MGU-K: `power` (P_max/η reached), `rear-axle` (it already takes
 * the whole rear braking force, set by rear grip and brake balance), `off` (P_max = 0).
 */
export type MgukLimit = 'power' | 'rear-axle' | 'off';

/** Instantaneous forces and powers at speed v (all magnitudes ≥ 0, SI). */
export interface CarBrakingForces {
  /** Speed [m/s]. */
  v: number;
  /** Aerodynamic drag [N]. */
  drag: number;
  /** Aerodynamic downforce [N]. */
  downforce: number;
  /** Weight m·g [N]. */
  weight: number;
  /** Total vertical load m·g + L [N]. */
  fzTotal: number;
  /** Front / rear vertical load with load transfer [N]. */
  fzFront: number;
  fzRear: number;
  /** Total tyre braking force F_x [N] and its front / rear parts (β, 1 − β). */
  fxTotal: number;
  fxFront: number;
  fxRear: number;
  /** Rear braking force taken by the MGU-K [N]. */
  fMguk: number;
  /** Rear braking force of the friction brakes [N]. */
  fBrakesRear: number;
  /** Deceleration (F_x + D)/m [m/s²], > 0. */
  decel: number;
  /** Axle at its grip limit (κ*). */
  limit: BrakeLimit;
  /** What limits the MGU-K force. */
  mgukLimit: MgukLimit;
  /** Slip magnitude of the front / rear tyres [–] (κ* on the limiting axle). */
  kappaFront: number;
  kappaRear: number;
  /** Used friction F_x/F_z on the front / rear axle [–] (μ on the limiting axle). */
  muFront: number;
  muRear: number;
  /** Mechanical power into the MGU-K F_MGU-K·v [W] (≤ P_max/η). */
  pMguk: number;
  /** Electrical power stored η·pMguk [W] (≤ P_max). */
  pStored: number;
  /** MGU-K / converter losses (1 − η)·pMguk [W]. */
  pMgukLoss: number;
  /** Friction-brake heat power, front / rear [W]. */
  pBrakesFront: number;
  pBrakesRear: number;
  /** Power dissipated by drag D·v [W]. */
  pAero: number;
}

function forcesResolved(v: number, p: ResolvedModel, withSlip = true): CarBrakingForces {
  const vv = Math.max(0, v);
  const drag = 0.5 * p.rho * p.CdA * vv * vv;
  const downforce = 0.5 * p.rho * p.ClA * vv * vv;
  const weight = p.m * p.g;
  const fzTotal = weight + downforce;
  const fzF0 = p.weightFront * fzTotal;
  const fzR0 = fzTotal - fzF0;
  const beta = p.brakeBalance;
  const tr = (p.mu * p.h) / p.L; // load transfer per unit braking force × μ
  // Front-limited: βF = μ(F_zf0 + F h/L); rear-limited: (1 − β)F = μ(F_zr0 − F h/L).
  const fFront = beta > tr ? (p.mu * fzF0) / (beta - tr) : Infinity;
  const fRear = (p.mu * fzR0) / (1 - beta + tr);
  const fxTotal = Math.min(fFront, fRear);
  const rel = Math.abs(fFront - fRear) / fxTotal;
  const limit: BrakeLimit = rel <= 1e-9 ? 'both' : fFront < fRear ? 'front' : 'rear';
  const transfer = (fxTotal * p.h) / p.L;
  const fzFront = fzF0 + transfer;
  const fzRear = fzR0 - transfer;
  const fxFront = beta * fxTotal;
  const fxRear = fxTotal - fxFront;

  const capMech = p.Pmax === 0 ? 0 : p.eta === 0 ? Infinity : p.Pmax / p.eta;
  const capForce = capMech === 0 ? 0 : vv === 0 ? Infinity : capMech / vv;
  const fMguk = Math.min(fxRear, capForce);
  const fBrakesRear = fxRear - fMguk;
  const mgukLimit: MgukLimit = p.Pmax === 0 ? 'off' : capForce < fxRear ? 'power' : 'rear-axle';

  const muFront = fzFront > 0 ? fxFront / fzFront : 0;
  const muRear = fzRear > 0 ? fxRear / fzRear : 0;
  const ratio = (x: number): number => Math.min(1, Math.max(0, x / p.mu));
  const pMguk = fMguk * vv;
  return {
    v: vv,
    drag,
    downforce,
    weight,
    fzTotal,
    fzFront,
    fzRear,
    fxTotal,
    fxFront,
    fxRear,
    fMguk,
    fBrakesRear,
    decel: (fxTotal + drag) / p.m,
    limit,
    mgukLimit,
    kappaFront: withSlip ? pacejkaSlipForRatio(ratio(muFront), p.tyre) : Number.NaN,
    kappaRear: withSlip ? pacejkaSlipForRatio(ratio(muRear), p.tyre) : Number.NaN,
    muFront,
    muRear,
    pMguk,
    pStored: p.eta * pMguk,
    pMgukLoss: (1 - p.eta) * pMguk,
    pBrakesFront: fxFront * vv,
    pBrakesRear: fBrakesRear * vv,
    pAero: drag * vv,
  };
}

/**
 * Instantaneous forces and powers of the braking car at speed v (maximum braking
 * with ideal ABS on the limiting axle; model in the module header).
 *
 * F_z = m g + ½ρC_lA v², F_z,f0 = w_f F_z; F_x = min(μF_z,f0/(β − μh/L), μF_z,r0/(1 − β + μh/L));
 * F_x,f = βF_x, F_x,r = (1 − β)F_x; F_MGU-K = min(F_x,r, (P_max/η)/v);
 * a = (F_x + ½ρC_dA v²)/m.
 *
 * @param v - speed [m/s] (negative values are treated as 0)
 * @param p - car model ({@link CarModel})
 * @returns forces [N], powers [W], slips and friction use [–]
 * @throws RangeError on invalid parameters (see {@link simulateBrakingZone})
 * @slide none (extension: vehicle dynamics; energy balance as in slides 16–17)
 */
export function carBrakingForces(v: number, p: CarModel): CarBrakingForces {
  finite('carBrakingForces', 'v', v);
  return forcesResolved(v, resolveModel('carBrakingForces', p));
}

/** Integrated state of the braking zone (SI). */
export interface CarBrakingState {
  /** Time since the braking point [s]. */
  t: number;
  /** Distance since the braking point [m]. */
  x: number;
  /** Speed [m/s]. */
  v: number;
  /** Mechanical energy absorbed by the MGU-K [J] (stored: η·eMguk). */
  eMguk: number;
  /** Heat in the front / rear friction brakes [J]. */
  eBrakesFront: number;
  eBrakesRear: number;
  /** Energy dissipated by drag [J]. */
  eAero: number;
}

const toVec = (s: CarBrakingState): number[] => [
  s.x,
  s.v,
  s.eMguk,
  s.eBrakesFront,
  s.eBrakesRear,
  s.eAero,
];

const fromVec = (t: number, y: readonly number[]): CarBrakingState => ({
  t,
  x: y[0] as number,
  v: y[1] as number,
  eMguk: y[2] as number,
  eBrakesFront: y[3] as number,
  eBrakesRear: y[4] as number,
  eAero: y[5] as number,
});

function rhs(p: ResolvedModel): (t: number, y: readonly number[]) => number[] {
  return (_t, y) => {
    const v = y[1] as number;
    if (!(v > 0)) return [0, 0, 0, 0, 0, 0]; // stopped: static friction holds the car
    const f = forcesResolved(v, p, false); // slips are not needed by the ODE
    return [v, -f.decel, f.pMguk, f.pBrakesFront, f.pBrakesRear, f.pAero];
  };
}

/**
 * One RK4 step ({@link rk4Step}) of the braking ODE:
 * dx/dt = v, dv/dt = −(F_x + D)/m, dE_MGU-K/dt = F_MGU-K·v,
 * dE_brakes,f/dt = F_x,f·v, dE_brakes,r/dt = (F_x,r − F_MGU-K)·v, dE_aero/dt = D·v.
 * A stopped car (v ≤ 0) stays at rest.
 *
 * @param s - current state
 * @param p - car model
 * @param dt - step [s], default {@link PHYSICS_DT}
 * @returns state at t + dt (new object)
 * @throws RangeError on invalid parameters or non-finite dt
 * @slide none (extension: vehicle dynamics; numerical method §4.1)
 */
export function carBrakingStep(s: CarBrakingState, p: CarModel, dt = PHYSICS_DT): CarBrakingState {
  const m = resolveModel('carBrakingStep', p);
  return fromVec(s.t + dt, rk4Step(rhs(m), s.t, toVec(s), dt));
}

/** One sample of the braking-zone trace: state + instantaneous forces. */
export type CarBrakingSample = CarBrakingState & CarBrakingForces;

/** Output of {@link simulateBrakingZone}. */
export interface BrakingZoneResult {
  /** Braking time v₁ → v₂ [s]. */
  tBrake: number;
  /** Braking distance [m]. */
  distance: number;
  /** ΔE_k = ½m(v₁² − v₂²) [J]. */
  dEk: number;
  /** Mechanical energy absorbed by the MGU-K [J]. */
  eMguk: number;
  /** Electrical energy stored η·eMguk [J] (≤ P_max·tBrake). */
  eStored: number;
  /** MGU-K / converter losses (1 − η)·eMguk [J]. */
  eMgukLoss: number;
  /** Friction-brake heat, front / rear / total [J]. */
  eBrakesFront: number;
  eBrakesRear: number;
  eBrakes: number;
  /** Energy dissipated by drag [J]. */
  eAero: number;
  /** eStored / ΔE_k [–] (0 when ΔE_k = 0). */
  recoveredFraction: number;
  /** Relative energy-balance residual (ΔE_k − eMguk − eBrakes − eAero)/ΔE_k (0 when ΔE_k = 0). */
  balanceError: number;
  /** Peak deceleration [m/s²]. */
  peakDecel: number;
  /** Samples at t = 0, after every step and at the end (t = tBrake, v = v₂). */
  trace: CarBrakingSample[];
}

/**
 * Simulates a full braking zone from v₁ to v₂ at maximum braking (ideal ABS),
 * integrating the ODE of {@link carBrakingStep} with RK4 at dt = 1/240 s. The last
 * step is shortened (bisection on its length) so that the zone ends at v = v₂.
 *
 * Checks (tests): ΔE_k = E_MGU-K + E_brakes + E_aero within 10⁻⁶ relative;
 * E_stored ≤ P_max·t; with C_dA = C_lA = 0, β = 0 (all braking on the rear axle)
 * the deceleration is constant and the energies equal {@link kersBrakingEvent}
 * with the same t_brake.
 *
 * @param p - {@link CarBrakingParams}: speeds [m/s] with v₁ ≥ v₂ ≥ 0, car model, dt
 * @returns totals [J, s, m], residual and trace
 * @throws RangeError on m ≤ 0, Pmax < 0 or NaN, η ∉ [0, 1], negative aero areas or
 *   density, μ ≤ 0, β ∉ [0, 1], h < 0, L ≤ 0, w_f ∉ (0, 1), μh/L ≥ 1 − w_f (rear
 *   lift-off), invalid tyre shape, dt ≤ 0, v₂ > v₁, negative or non-finite speeds
 * @slide none (extension: vehicle dynamics; builds on the energy balance of
 * slides 16–17 and on the KERS model of `kersBrakingEvent`)
 */
export function simulateBrakingZone(p: CarBrakingParams): BrakingZoneResult {
  const fn = 'simulateBrakingZone';
  const m = resolveModel(fn, p);
  nonNegative(fn, 'v1', p.v1);
  nonNegative(fn, 'v2', p.v2);
  if (p.v2 > p.v1) throw new RangeError(`${fn}: v2 must be ≤ v1 (got v1=${p.v1}, v2=${p.v2})`);
  const dt = p.dt ?? PHYSICS_DT;
  positive(fn, 'dt', dt);

  const f = rhs(m);
  const sample = (s: CarBrakingState): CarBrakingSample => ({ ...s, ...forcesResolved(s.v, m) });
  let s: CarBrakingState = {
    t: 0,
    x: 0,
    v: p.v1,
    eMguk: 0,
    eBrakesFront: 0,
    eBrakesRear: 0,
    eAero: 0,
  };
  const trace: CarBrakingSample[] = [sample(s)];

  if (p.v1 > p.v2) {
    // Load and drag grow with v, so the deceleration is smallest at v = 0: this
    // bounds the number of steps (the loop always ends with the `break`).
    const minDecel = forcesResolved(0, m).decel;
    const maxSteps = Math.ceil((p.v1 - p.v2) / minDecel / dt) + 10;
    for (let k = 0; k <= maxSteps; k++) {
      const y = toVec(s);
      const next = rk4Step(f, s.t, y, dt);
      if ((next[1] as number) > p.v2) {
        s = fromVec(s.t + dt, next);
        trace.push(sample(s));
        continue;
      }
      // The zone ends inside this step: shorten it so that v = v₂.
      let lo = 0;
      let hi = dt;
      for (let it = 0; it < 80; it++) {
        const mid = 0.5 * (lo + hi);
        if ((rk4Step(f, s.t, y, mid)[1] as number) > p.v2) lo = mid;
        else hi = mid;
      }
      const end = rk4Step(f, s.t, y, hi);
      end[1] = p.v2; // |v − v₂| is at round-off level after the bisection
      s = fromVec(s.t + hi, end);
      trace.push(sample(s));
      break;
    }
  }

  const dEk = 0.5 * m.m * (p.v1 * p.v1 - p.v2 * p.v2);
  const eBrakes = s.eBrakesFront + s.eBrakesRear;
  const balance = dEk - s.eMguk - eBrakes - s.eAero;
  return {
    tBrake: s.t,
    distance: s.x,
    dEk: noNegZero(dEk),
    eMguk: s.eMguk,
    eStored: m.eta * s.eMguk,
    eMgukLoss: (1 - m.eta) * s.eMguk,
    eBrakesFront: s.eBrakesFront,
    eBrakesRear: s.eBrakesRear,
    eBrakes,
    eAero: s.eAero,
    recoveredFraction: dEk > 0 ? (m.eta * s.eMguk) / dEk : 0,
    balanceError: dEk > 0 ? balance / dEk : 0,
    peakDecel: Math.max(...trace.map((x) => x.decel)),
    trace,
  };
}
