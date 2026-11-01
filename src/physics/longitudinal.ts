/**
 * Longitudinal (1-D) car model with ICE, MGU-K and energy store (fix round 1,
 * F1/F3): acceleration AND braking, so the KERS simulators can show deploy and
 * harvest in the same run. Pure, SI units, deterministic.
 *
 * Modello semplificato (docs/PHYSICS.md §14): point mass on a straight, flat
 * road; no tyre slip (forces reach the road as commanded), no gears, no
 * weight transfer, no downforce, no reverse (v ≥ 0). Forces at speed v:
 *
 * - aero drag F_d = ½·ρ·C_dA·v², rolling F_r = c_rr·m·g;
 * - ICE F_ice = throttle·min(fDriveMax, pEngineMax / max(v, v_s));
 * - MGU-K deploy F_dep = throttle·min(fDriveMax, P_dep / max(v, v_s)), with
 *   P_dep = min(mguk.pDeployMax, η·battery deploy limit): mechanical power at
 *   the wheels; electrical draw = mechanical / η;
 * - braking: requested force F_req = brake·(fBrakeMax + F_hcap), F_hcap =
 *   min(fDriveMax, P_harv / max(v, v_s)), P_harv = min(mguk.pHarvestMax,
 *   battery harvest limit / η); the MGU-K takes min(F_req, F_hcap) first (stored
 *   electrical = η·mechanical), the discs take the rest;
 * - below v_s = {@link DRIVE_V_STOP} the friction-like forces (discs, MGU-K
 *   harvest, rolling) fade linearly to 0 so that the car stops without
 *   reversing and a car at rest with the brake pressed stays at rest (a = 0,
 *   no harvest).
 *
 * Integration: classical RK4 ({@link rk4Step}) over dt on the state
 * [x, v, E_engine, E_deploy, E_harvest, E_brakes, E_drag, E_roll]; the MGU-K
 * power caps are frozen over the step (zero-order hold, like a controller
 * running at the physics rate) and the battery receives the step's exact
 * electrical energy. The speed at the end of a (sub)step is reconstructed from
 * the integrated work (½mv'² = ½mv² + ΣW), so the energy balance
 *
 *   E_k + E_stored + E_brakes + E_drag + E_roll + E_mgukLoss + E_battLoss
 *     = E_k,0 + E_stored,0 + E_engine
 *
 * closes to rounding error. Stiff cases (tiny mass, huge forces) are split in
 * equal substeps automatically.
 */
import {
  batteryLimits,
  batteryStep,
  createBattery,
  DEFAULT_RESTART_SOC,
  type BatteryParams,
  type BatteryState,
} from './battery';
import { createRk4Work, rk4Step } from './ode';
import { AIR_DENSITY_STD, G_STANDARD } from './vehicle-dynamics';
import { finite, noNegZero, nonNegative, positive } from './validate';

/** Car body and conventional powertrain (docs/FIX_ROUND_1.md §6.1). */
export interface VehicleParams {
  /** Mass [kg], > 0. */
  m: number;
  /** Drag area C_d·A [m²], ≥ 0. */
  cdA: number;
  /** Air density [kg/m³], ≥ 0. */
  rho: number;
  /** Rolling-resistance coefficient [-], ≥ 0. */
  crr: number;
  /** Traction force limit at the wheels [N], ≥ 0 (ICE; also caps the MGU-K force). */
  fDriveMax: number;
  /** ICE maximum power at the wheels [W], ≥ 0. */
  pEngineMax: number;
  /** Disc-brake maximum force [N], ≥ 0. */
  fBrakeMax: number;
}

/** MGU-K limits: MECHANICAL power at the wheels [W] and efficiency (§6.1). */
export interface MgukParams {
  /** Maximum mechanical deploy power at the wheels [W], ≥ 0. */
  pDeployMax: number;
  /** Maximum mechanical harvest power taken from the wheels [W], ≥ 0. */
  pHarvestMax: number;
  /** Mechanical ↔ electrical efficiency of MGU-K + converter, (0, 1]. */
  eta: number;
}

/** Full parameter set of {@link kersDriveStep}. */
export interface DriveParams {
  vehicle: VehicleParams;
  mguk: MgukParams;
  battery: BatteryParams;
}

/** Driver input, each pedal in [0, 1]. */
export interface DriveInput {
  throttle: number;
  brake: number;
}

/** State of the drive model; all `e*` are cumulative energies [J]. */
export interface DriveState {
  /** Time [s]. */
  t: number;
  /** Distance travelled [m]. */
  x: number;
  /** Speed [m/s], ≥ 0. */
  v: number;
  battery: BatteryState;
  /** Work done by the ICE on the car. */
  eEngine: number;
  /** Mechanical work done by the MGU-K (deploy) on the car. */
  eDeploy: number;
  /** Mechanical energy taken by the MGU-K (harvest) from the car. */
  eHarvest: number;
  /** Disc-brake heat. */
  eBrakes: number;
  /** Aerodynamic drag dissipation. */
  eDrag: number;
  /** Rolling-resistance dissipation. */
  eRoll: number;
  /** MGU-K + converter losses (both directions). */
  eMgukLoss: number;
}

/** What the MGU-K did in a step (sign of the net mechanical power). */
export type MgukMode = 'deploy' | 'harvest' | 'idle';

/** Result of {@link kersDriveStep}; powers are averages over the step [W]. */
export interface DriveStepResult {
  state: DriveState;
  /** Average acceleration over the step Δv/dt [m/s²]. */
  a: number;
  /** Speed at the end of the step [m/s]. */
  v: number;
  /** MGU-K mechanical power at the wheels [W], + deploy, − harvest. */
  pKers: number;
  /** Disc-brake dissipation [W] ≥ 0. */
  pBrakes: number;
  /** ICE power at the wheels [W] ≥ 0. */
  pEngine: number;
  /** Drag dissipation [W] ≥ 0. */
  pDrag: number;
  /** Rolling dissipation [W] ≥ 0. */
  pRoll: number;
  /** State of charge at the end of the step [-]. */
  soc: number;
  mode: MgukMode;
}

/** Target speed [m/s] at time [s] for {@link speedProfileInput}. */
export interface SpeedProfilePoint {
  t: number;
  v: number;
}

/**
 * Speed below which discs, MGU-K harvest and rolling resistance fade linearly
 * to zero, and the floor of the speed used in P/v force limits [m/s].
 * Numerical regularisation of the stop (Coulomb-like friction), not physics.
 */
export const DRIVE_V_STOP = 0.1;

/** Below this speed with no throttle the car is snapped to rest [m/s]. */
const V_SNAP = 0.01;

/** Upper bound on automatic substeps per {@link kersDriveStep}. */
const MAX_SUBSTEPS = 4096;

/** RK4 must stay well inside its stability region: dt·k ≤ this per substep. */
const STIFF_LIMIT = 1;

/** Default proportional gain of {@link speedProfileInput} [1/(m/s)]. */
export const SPEED_PROFILE_GAIN = 0.5;

/**
 * Illustrative 800 kg single-seater (the deck's "m = 800 kg" example, not a
 * real car): C_dA = 1,1 m², c_rr = 0,015, traction 12 kN (≈ 1,5 g), ICE 400 kW
 * at the wheels, discs 31,4 kN (≈ 4 g; no downforce in this model). All values
 * illustrative ("valori illustrativi").
 *
 * @slide none (extension: illustrative parameters)
 */
export const DEMO_CAR_800KG: Readonly<VehicleParams> = Object.freeze({
  m: 800,
  cdA: 1.1,
  rho: AIR_DENSITY_STD,
  crr: 0.015,
  fDriveMax: 12_000,
  pEngineMax: 400_000,
  fBrakeMax: 31_400,
});

/**
 * MGU-K limited to 120 kW (regulations 2014–2025, OPEN_FACTS row 1, verified);
 * η = 0,9 illustrative.
 *
 * @slide none (extension: OPEN_FACTS row 1)
 */
export const DEMO_MGUK_120KW: Readonly<MgukParams> = Object.freeze({
  pDeployMax: 120_000,
  pHarvestMax: 120_000,
  eta: 0.9,
});

/**
 * MGU-K limited to 350 kW (regulations from 2026, OPEN_FACTS row 5,
 * verified); η = 0,9 illustrative.
 *
 * @slide none (extension: OPEN_FACTS row 5)
 */
export const DEMO_MGUK_350KW: Readonly<MgukParams> = Object.freeze({
  pDeployMax: 350_000,
  pHarvestMax: 350_000,
  eta: 0.9,
});

/**
 * Energy store with 4 MJ usable energy — **valore da verificare** (OPEN_FACTS
 * row 4, DA VERIFICARE). Efficiencies 0,95, R = 0,05 Ω at 800 V, terminal
 * limits 400 kW: illustrative. Restart threshold 5 %.
 *
 * @slide none (extension: OPEN_FACTS row 4, da verificare)
 */
export const DEMO_BATTERY_4MJ: Readonly<BatteryParams> = Object.freeze({
  capacityJ: 4e6,
  etaCharge: 0.95,
  etaDischarge: 0.95,
  rInternal: 0.05,
  vNominal: 800,
  pChargeMax: 400_000,
  pDischargeMax: 400_000,
  restartSoc: DEFAULT_RESTART_SOC,
});

function checkDrive(fn: string, p: DriveParams): void {
  const vh = p.vehicle;
  positive(fn, 'vehicle.m', vh.m);
  nonNegative(fn, 'vehicle.cdA', vh.cdA);
  nonNegative(fn, 'vehicle.rho', vh.rho);
  nonNegative(fn, 'vehicle.crr', vh.crr);
  nonNegative(fn, 'vehicle.fDriveMax', vh.fDriveMax);
  nonNegative(fn, 'vehicle.pEngineMax', vh.pEngineMax);
  nonNegative(fn, 'vehicle.fBrakeMax', vh.fBrakeMax);
  nonNegative(fn, 'mguk.pDeployMax', p.mguk.pDeployMax);
  nonNegative(fn, 'mguk.pHarvestMax', p.mguk.pHarvestMax);
  finite(fn, 'mguk.eta', p.mguk.eta);
  if (!(p.mguk.eta > 0 && p.mguk.eta <= 1)) {
    throw new RangeError(`${fn}: mguk.eta must be in (0, 1] (got ${p.mguk.eta})`);
  }
}

function pedal(fn: string, name: string, x: number): number {
  finite(fn, name, x);
  if (x < 0 || x > 1) throw new RangeError(`${fn}: ${name} must be in [0, 1] (got ${x})`);
  return x;
}

/**
 * Initial state of the drive model: t = x = 0, all cumulative energies 0.
 *
 * @param p - drive parameters
 * @param v0 - initial speed [m/s], ≥ 0
 * @param soc0 - initial state of charge [-] in [0, 1]
 * @returns a fresh {@link DriveState}
 * @throws RangeError on invalid parameters, v0 < 0 or soc0 ∉ [0, 1]
 * @slide none (extension: KERS drive model, fix round 1)
 */
export function createDriveState(p: DriveParams, v0: number, soc0: number): DriveState {
  const fn = 'createDriveState';
  checkDrive(fn, p);
  nonNegative(fn, 'v0', v0);
  return {
    t: 0,
    x: 0,
    v: noNegZero(v0),
    battery: createBattery(p.battery, soc0),
    eEngine: 0,
    eDeploy: 0,
    eHarvest: 0,
    eBrakes: 0,
    eDrag: 0,
    eRoll: 0,
    eMgukLoss: 0,
  };
}

// RK4 state layout
const X = 0;
const V = 1;
const E_ENG = 2;
const E_DEP = 3;
const E_HARV = 4;
const E_BRK = 5;
const E_DRAG = 6;
const E_ROLL = 7;
const N = 8;

/**
 * One step of the longitudinal model (forces in the module header).
 *
 * a = (F_ice + F_dep − F_mguk,harv − F_disc − F_r − F_d) / m, v ≥ 0;
 * battery terminal power = (E_dep/η − η·E_harv)/dt (net, one battery step);
 * E_mgukLoss += E_harv + E_terminal − E_dep.
 *
 * At soc = 0 (or while `depleted`) the deploy cap is 0: the MGU-K stops
 * pushing and only the ICE drives; harvest stays available.
 *
 * @param s - current state (not mutated)
 * @param input - pedals `throttle`, `brake` in [0, 1] (both may be > 0)
 * @param p - drive parameters
 * @param dt - step [s], > 0 (use PHYSICS_DT)
 * @returns new state, average powers over the step [W], a [m/s²], v [m/s],
 *   soc [-] and the MGU-K mode
 * @throws RangeError on invalid parameters, pedals ∉ [0, 1] or dt ≤ 0
 * @slide none (extension: KERS drive model; energy balance as in slides 16–17,
 *   alternator/motor of slides 18–19)
 */
export function kersDriveStep(
  s: DriveState,
  input: DriveInput,
  p: DriveParams,
  dt: number,
): DriveStepResult {
  const fn = 'kersDriveStep';
  checkDrive(fn, p);
  positive(fn, 'dt', dt);
  nonNegative(fn, 'v', s.v);
  const u = pedal(fn, 'throttle', input.throttle);
  const b = pedal(fn, 'brake', input.brake);
  const { m, cdA, rho, crr, fDriveMax, pEngineMax, fBrakeMax } = p.vehicle;
  const eta = p.mguk.eta;

  // MGU-K caps frozen over the step (mechanical, at the wheels).
  const lim = batteryLimits(p.battery, s.battery, dt);
  const pDepCap = Math.min(p.mguk.pDeployMax, eta * lim.pDeployMax);
  const pHarvCap = Math.min(p.mguk.pHarvestMax, lim.pHarvestMax / eta);
  const fRollMax = crr * m * G_STANDARD;
  const halfRhoCdA = 0.5 * rho * cdA;

  const rhs = (_t: number, y: readonly number[]): number[] => {
    const out = new Array<number>(N); // fresh: RK4 keeps k₁…k₄
    const v = Math.max(0, y[V] as number);
    const ve = Math.max(v, DRIVE_V_STOP);
    const fade = Math.min(1, v / DRIVE_V_STOP);
    const fIce = u * Math.min(fDriveMax, pEngineMax / ve);
    const fDep = u * Math.min(fDriveMax, pDepCap / ve);
    const fHcap = Math.min(fDriveMax, pHarvCap / ve);
    const fReq = b * (fBrakeMax + fHcap);
    const fHarv = Math.min(fReq, fHcap) * fade;
    const fDisc = (fReq - Math.min(fReq, fHcap)) * fade;
    const fRoll = fRollMax * fade;
    const fDrag = halfRhoCdA * v * v;
    out[X] = v;
    out[V] = (fIce + fDep - fHarv - fDisc - fRoll - fDrag) / m;
    out[E_ENG] = fIce * v;
    out[E_DEP] = fDep * v;
    out[E_HARV] = fHarv * v;
    out[E_BRK] = fDisc * v;
    out[E_DRAG] = fDrag * v;
    out[E_ROLL] = fRoll * v;
    return out;
  };

  // Substeps: bound on |∂a/∂v| (fade slopes, P/v² terms, drag).
  const vMax = s.v + (dt * 2 * u * fDriveMax) / m;
  const stiff =
    (b * (fBrakeMax + 2 * fDriveMax) + fRollMax + 2 * u * fDriveMax) / (m * DRIVE_V_STOP) +
    (2 * halfRhoCdA * vMax) / m;
  const nSub = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil((dt * stiff) / STIFF_LIMIT)));
  const h = dt / nSub;

  const work = createRk4Work(N);
  const y = new Array<number>(N).fill(0);
  y[V] = s.v;
  let x = s.x;
  let v = s.v;
  let eEng = 0;
  let eDep = 0;
  let eHarv = 0;
  let eBrk = 0;
  let eDrag = 0;
  let eRoll = 0;
  for (let k = 0; k < nSub; k++) {
    y[X] = 0;
    y[V] = v;
    for (let i = E_ENG; i < N; i++) y[i] = 0;
    const r = rk4Step(rhs, s.t + k * h, y, h, work);
    let dEng = Math.max(0, r[E_ENG] as number);
    let dDep = Math.max(0, r[E_DEP] as number);
    let dHarv = Math.max(0, r[E_HARV] as number);
    let dBrk = Math.max(0, r[E_BRK] as number);
    let dDrag = Math.max(0, r[E_DRAG] as number);
    let dRoll = Math.max(0, r[E_ROLL] as number);
    // Speed from the integrated work: ½mv'² = ½mv² + W_net.
    let ek = 0.5 * m * v * v + dEng + dDep - dHarv - dBrk - dDrag - dRoll;
    if (ek < 0) {
      // Overshoot past rest: the dissipations took more than was available.
      let deficit = -ek;
      const take = (e: number): number => {
        const d = Math.min(e, deficit);
        deficit -= d;
        return e - d;
      };
      dBrk = take(dBrk);
      dRoll = take(dRoll);
      dDrag = take(dDrag);
      dHarv = take(dHarv);
      if (deficit > 0) {
        // Only possible through rounding: remove it from the work inputs.
        dDep = take(dDep);
        dEng = take(dEng);
      }
      ek = 0;
    }
    let vNew = Math.sqrt((2 * ek) / m);
    if (vNew < V_SNAP && u === 0) {
      // Snap to rest; the residual kinetic energy goes to the active friction.
      if (b > 0) dBrk += ek;
      else dRoll += ek;
      vNew = 0;
    }
    x += Math.max(0, r[X] as number);
    v = vNew;
    eEng += dEng;
    eDep += dDep;
    eHarv += dHarv;
    eBrk += dBrk;
    eDrag += dDrag;
    eRoll += dRoll;
  }

  // Battery: one step with the net electrical power at its terminals.
  const pRequest = (eDep / eta - eta * eHarv) / dt;
  const bat = batteryStep(p.battery, s.battery, pRequest, dt);
  const eMgukLossStep = eHarv + bat.pTerminal * dt - eDep;

  const state: DriveState = {
    t: s.t + dt,
    x,
    v: noNegZero(v),
    battery: bat.state,
    eEngine: s.eEngine + eEng,
    eDeploy: s.eDeploy + eDep,
    eHarvest: s.eHarvest + eHarv,
    eBrakes: s.eBrakes + eBrk,
    eDrag: s.eDrag + eDrag,
    eRoll: s.eRoll + eRoll,
    eMgukLoss: s.eMgukLoss + eMgukLossStep,
  };
  const pKers = noNegZero((eDep - eHarv) / dt);
  return {
    state,
    a: noNegZero((state.v - s.v) / dt),
    v: state.v,
    pKers,
    pBrakes: eBrk / dt,
    pEngine: eEng / dt,
    pDrag: eDrag / dt,
    pRoll: eRoll / dt,
    soc: bat.state.soc,
    mode: pKers > 0 ? 'deploy' : pKers < 0 ? 'harvest' : 'idle',
  };
}

/**
 * Energy account of a drive state (for balance checks and energy bars).
 *
 * kinetic = ½ m v²; stored = soc·capacityJ; dissipated = eBrakes + eDrag +
 * eRoll + eMgukLoss + battery.eLoss; engine = eEngine.
 * Balance: kinetic + stored + dissipated − engine is constant in time.
 *
 * @param s - drive state
 * @param p - drive parameters
 * @returns energies [J]
 * @slide none (extension: energy balance as in slides 16–17)
 */
export function driveEnergyAccount(
  s: DriveState,
  p: DriveParams,
): { kinetic: number; stored: number; dissipated: number; engine: number } {
  return {
    kinetic: 0.5 * p.vehicle.m * s.v * s.v,
    stored: s.battery.soc * p.battery.capacityJ,
    dissipated: s.eBrakes + s.eDrag + s.eRoll + s.eMgukLoss + s.battery.eLoss,
    engine: s.eEngine,
  };
}

/**
 * Pedals from a target-speed profile with a deterministic proportional
 * controller.
 *
 * v_target(t): piecewise-linear interpolation of `profile` (held constant
 * before the first and after the last point); e = v_target − v;
 * throttle = clamp(K·e, 0, 1), brake = clamp(−K·e, 0, 1).
 *
 * @param profile - points sorted by non-decreasing `t` [s], `v` [m/s] ≥ 0;
 *   at least one point
 * @param t - time [s]
 * @param v - current speed [m/s]
 * @param gain - K [1/(m/s)], > 0 (default {@link SPEED_PROFILE_GAIN}: full pedal
 *   at 2 m/s of error)
 * @returns pedals in [0, 1] (never both > 0)
 * @throws RangeError on an empty or unsorted profile, non-finite values or gain ≤ 0
 * @slide none (extension: driver model for the drive simulators)
 */
export function speedProfileInput(
  profile: readonly SpeedProfilePoint[],
  t: number,
  v: number,
  gain: number = SPEED_PROFILE_GAIN,
): DriveInput {
  const fn = 'speedProfileInput';
  finite(fn, 't', t);
  finite(fn, 'v', v);
  positive(fn, 'gain', gain);
  if (profile.length === 0) throw new RangeError(`${fn}: profile must not be empty`);
  let prevT = -Infinity;
  for (const pt of profile) {
    finite(fn, 'profile.t', pt.t);
    nonNegative(fn, 'profile.v', pt.v);
    if (pt.t < prevT) throw new RangeError(`${fn}: profile must be sorted by t`);
    prevT = pt.t;
  }
  const first = profile[0] as SpeedProfilePoint;
  const last = profile[profile.length - 1] as SpeedProfilePoint;
  let target: number;
  if (t <= first.t) target = first.v;
  else if (t >= last.t) target = last.v;
  else {
    let i = 1;
    while ((profile[i] as SpeedProfilePoint).t < t) i++;
    const a = profile[i - 1] as SpeedProfilePoint;
    const c = profile[i] as SpeedProfilePoint;
    const span = c.t - a.t;
    target = span > 0 ? a.v + ((c.v - a.v) * (t - a.t)) / span : c.v;
  }
  const e = gain * (target - v);
  return {
    throttle: noNegZero(Math.min(1, Math.max(0, e))),
    brake: noNegZero(Math.min(1, Math.max(0, -e))),
  };
}
