/** Pure analytical braking readouts; no simulator entry point or rendering dependencies. */
import { createBattery, DEFAULT_BATTERY } from '../../physics/battery';
import { rpm } from '../alternator-motor/model';
import {
  defaultParams,
  params as kersParams,
  powersAt,
  stateAt,
  summarize,
  toSI,
  type KersUiParams,
} from '../kers-braking/model';

/** FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3. */
export const MGUK_MAX_RPM = 50_000;
/**
 * 2025: FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3.
 * 2026: FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.18.5:
 * relative rotational speed between any two parts, represented here by rotor rpm.
 */
export const MGUK_MAX_RPM_BY_ERA = { '2025': MGUK_MAX_RPM, '2026': 60_000 } as const;
/**
 * Crank-referenced caps, not rotor torque:
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3;
 * FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.11.
 */
export const MGUK_MAX_TORQUE_CRANK_NM_BY_ERA = { '2025': 200, '2026': 500 } as const;
export type MgukEra = keyof typeof MGUK_MAX_RPM_BY_ERA;

/**
 * Rotor angular speed / vehicle speed [rad/m]: didactic single-gear simplification.
 * In reality the link has a fixed speed ratio to the crankshaft, so rotor rpm
 * follows engine rpm and the selected gear, not vehicle speed:
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3;
 * FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.18.2.
 * Gear ratios are not public. This maps the slider maximum to the era's max rpm.
 */
export const ROTOR_SPEED_PER_VEHICLE_SPEED =
  (MGUK_MAX_RPM * 2 * Math.PI) / 60 / toSI({ ...defaultParams(), v1: kersParams.v1.max }).v1;

/**
 * Assumed DC-equivalent machine constant [V·s/rad], no public winding/flux data.
 * Assumed DC bus voltage, below the 1000 V ceiling:
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.13.5;
 * FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.17.6.
 * EMF reaches DEFAULT_BATTERY.voltage at the era's maximum rpm.
 */
export const K_E_BY_ERA = {
  '2025': DEFAULT_BATTERY.voltage / ((MGUK_MAX_RPM_BY_ERA['2025'] * 2 * Math.PI) / 60),
  '2026': DEFAULT_BATTERY.voltage / ((MGUK_MAX_RPM_BY_ERA['2026'] * 2 * Math.PI) / 60),
} as const;
export const K_E = K_E_BY_ERA['2025'];

export interface BrakingState {
  /** Time since braking started [s]. */
  readonly t: number;
  /** Vehicle speed [m/s]. */
  readonly v: number;
  /** Distance travelled since braking started [m]. */
  readonly x: number;
  /** MGU-K electrical power into the battery [W]. */
  readonly pKers: number;
  /** Mechanical power absorbed by the MGU-K [W]. */
  readonly pMech: number;
  /** Friction-brake power, excluding MGU-K losses [W]. */
  readonly pBrakes: number;
  /** Rotor angular speed from the illustrative fixed coupling [rad/s]. */
  readonly omega: number;
  /** Rotor speed [rpm]. */
  readonly rpm: number;
  /**
   * Rotor-side torque pMech / omega; zero at rest [N·m]. FIA caps are crank-side
   * (see MGUK_MAX_TORQUE_CRANK_NM_BY_ERA). No torqueCapActive flag is honest
   * without an assumed crank-to-rotor ratio; that engine/gear model is deferred.
   */
  readonly torque: number;
  /**
   * Induced EMF = K_E * omega [V], following Faraday's speed dependence.
   * Illustrative permanent-magnet DC-equivalent machine assumption.
   */
  readonly emf: number;
  /** DC-equivalent machine current magnitude pKers / emf [A]; zero near zero EMF. */
  readonly current: number;
  /** Virtual battery energy, initial energy plus recovery, without extra losses [J]. */
  readonly batteryEnergy: number;
  /** Virtual battery state of charge, energy / DEFAULT_BATTERY.capacity [0..1]. */
  readonly soc: number;
  /** Electrical energy recovered since braking started [J]. */
  readonly recovered: number;
  /** Friction-brake heat since braking started [J]. */
  readonly brakeHeat: number;
  /** MGU-K / converter losses since braking started [J]. */
  readonly mgukLoss: number;
  /** Kinetic energy released since braking started [J]. */
  readonly released: number;
  /** Positive electrical power cap is reached during active braking [boolean]. */
  readonly powerCapActive: boolean;
}

/**
 * One input controls all readouts: elapsed fraction [0..1], clamped at both ends.
 * Params use the existing KERS display units (km/h, kW); readouts use SI except rpm.
 * At phase 1 the event is complete: powers, current and torque are zero, while
 * accumulated energies retain their final values (the powersAt convention).
 * initialSoc defaults to createBattery's initial charge. The virtual battery
 * adds analytical recovery without batteryStep's extra losses.
 *
 * @throws RangeError for NaN phase, invalid event parameters or initialSoc
 * outside [0,1], or an event whose initial energy plus recovery exceeds capacity. Rejecting that event keeps
 * SoC in [0,1] without changing the existing analytical recovery/heat ledger.
 */
export function brakingStateAt(
  phase: number,
  params: KersUiParams = defaultParams(),
  initialSoc = createBattery().energy / DEFAULT_BATTERY.capacity,
  era: MgukEra = '2025',
): BrakingState {
  if (Number.isNaN(phase)) throw new RangeError('brakingStateAt: phase must not be NaN');
  const initialEnergy = createBattery(DEFAULT_BATTERY, initialSoc).energy;
  const summary = summarize(params);
  if (initialEnergy + summary.result.recovered > DEFAULT_BATTERY.capacity) {
    throw new RangeError(
      'brakingStateAt: initial energy plus recovered energy exceeds battery capacity',
    );
  }
  const si = toSI(params);
  const state = stateAt(params, Math.min(1, Math.max(0, phase)) * si.tBrake);
  const power = powersAt(si, state.t, {
    v: 0,
    pBrake: 0,
    pMech: 0,
    pElec: 0,
    pLoss: 0,
    pDiscs: 0,
  });
  // powersAt can exceed the cap by a rounding ulp when multiplying by eta.
  const pKers = Math.min(si.Pmax, power.pElec);
  const omega = state.v * ROTOR_SPEED_PER_VEHICLE_SPEED * (MGUK_MAX_RPM_BY_ERA[era] / MGUK_MAX_RPM);
  const emf = K_E_BY_ERA[era] * omega;
  const batteryEnergy = initialEnergy + state.stored;
  return Object.freeze({
    t: state.t,
    v: state.v,
    x: state.x,
    pKers,
    pMech: power.pMech,
    pBrakes: power.pDiscs,
    omega,
    rpm: rpm(omega),
    torque: omega > 0 ? power.pMech / omega : 0,
    emf,
    current: emf > 1e-9 ? pKers / emf : 0,
    batteryEnergy,
    soc: batteryEnergy / DEFAULT_BATTERY.capacity,
    recovered: state.stored,
    brakeHeat: state.brakesHeat,
    mgukLoss: state.mgukLoss,
    released: state.released,
    powerCapActive: si.Pmax > 0 && pKers >= si.Pmax,
  });
}

/** Time-based convenience wrapper; t [s] is clamped to the braking event. */
export function brakingStateAtTime(
  t: number,
  params: KersUiParams = defaultParams(),
  initialSoc = createBattery().energy / DEFAULT_BATTERY.capacity,
  era: MgukEra = '2025',
): BrakingState {
  return brakingStateAt(t / params.tBrake, params, initialSoc, era);
}
