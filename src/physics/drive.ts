/** Educational one-dimensional vehicle; no change to the existing Pacejka model. */
import {
  batteryStep,
  createBattery,
  DEFAULT_BATTERY,
  validateBattery,
  type BatterySpec,
  type BatteryState,
} from './battery';
import { rk4Step } from './ode';

export interface DriveSpec {
  mass: number;
  rho: number;
  CdA: number;
  rolling: number;
  engineForce: number;
  enginePower: number;
  motorForce: number;
  brakeForce: number;
  deployPower: number;
  harvestPower: number;
  efficiency: number;
  battery: BatterySpec;
}
/** Illustrative vehicle; only regulation presets use verified OPEN_FACTS figures. */
export const DEFAULT_DRIVE: Readonly<DriveSpec> = {
  mass: 800,
  rho: 1.225,
  CdA: 0.8,
  rolling: 0.012,
  engineForce: 10000,
  enginePower: 500e3,
  motorForce: 5000,
  brakeForce: 16000,
  deployPower: 120e3,
  harvestPower: 120e3,
  /**
   * FIA fixed correction used as an efficiency proxy, not a measured efficiency.
   * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2.
   */
  efficiency: 0.95,
  battery: { ...DEFAULT_BATTERY },
};
export interface DriveInput {
  throttle: number;
  brake: number;
}
export interface DriveState {
  t: number;
  x: number;
  v: number;
  battery: BatteryState;
  engineWork: number;
  dissipated: number;
  discEnergy: number;
  harvested: number;
  deployed: number;
}
export interface DriveTelemetry {
  a: number;
  v: number;
  pKers: number;
  pBrakes: number;
  soc: number;
  pEngine: number;
  pAero: number;
  pRolling: number;
  pLoss: number;
}
export interface DriveResult extends DriveTelemetry {
  state: DriveState;
}

export function createDriveState(spec: DriveSpec = DEFAULT_DRIVE, v = 0, soc = 0.5): DriveState {
  validateDrive(spec);
  if (!Number.isFinite(v) || v < 0) throw new RangeError('drive: invalid speed');
  return {
    t: 0,
    x: 0,
    v,
    battery: createBattery(spec.battery, soc),
    engineWork: 0,
    dissipated: 0,
    discEnergy: 0,
    harvested: 0,
    deployed: 0,
  };
}

function validateDrive(p: DriveSpec): void {
  validateBattery(p.battery);
  const { battery: _battery, ...values } = p;
  if (
    Object.values(values).some((v) => !Number.isFinite(v) || v < 0) ||
    p.mass <= 0 ||
    p.efficiency <= 0 ||
    p.efficiency > 1
  )
    throw new RangeError('drive: invalid parameters');
}

/** Signed MGU-K mechanical power: + motor, − generator. Brakes have priority. */
function forces(s: DriveState, input: DriveInput, dt: number, p: DriveSpec): DriveTelemetry {
  const v = Math.max(0, s.v);
  const braking = input.brake > 0;
  const throttle = braking ? 0 : Math.min(1, Math.max(0, input.throttle));
  const brake = Math.min(1, Math.max(0, input.brake));
  const engine = throttle * Math.min(p.engineForce, p.enginePower / Math.max(v, 0.1));
  const requestedBrake = Math.min(brake * p.brakeForce, (p.mass * v) / dt);
  const wanted = braking
    ? -Math.min(p.harvestPower, requestedBrake * v * p.efficiency)
    : Math.min(p.deployPower, (throttle * p.motorForce * v) / p.efficiency);
  const b = batteryStep(s.battery, wanted, dt, p.battery);
  const pKers = b.power >= 0 ? b.power * p.efficiency : b.power / p.efficiency;
  // v→0 motor force is finite; battery power follows actual shaft work.
  const motor =
    v > 1e-9
      ? pKers / v
      : s.battery.depleted ||
          s.battery.energy <= 0 ||
          p.deployPower === 0 ||
          p.battery.dischargePower === 0
        ? 0
        : throttle * p.motorForce;
  const discs = Math.max(0, requestedBrake + Math.min(0, motor));
  const drag = 0.5 * p.rho * p.CdA * v * v;
  const roll = v > 0 ? p.rolling * p.mass * 9.80665 : 0;
  // All resisting forces vanish at rest; prevent numerical reverse motion.
  const resistance = Math.min(drag + roll, Math.max(0, engine + motor - discs + (p.mass * v) / dt));
  const ratio = drag + roll > 0 ? resistance / (drag + roll) : 0;
  return {
    a: (engine + motor - discs - resistance) / p.mass,
    v,
    pKers,
    pBrakes: discs * v,
    soc: s.battery.energy / p.battery.capacity,
    pEngine: engine * v,
    pAero: drag * v * ratio,
    pRolling: roll * v * ratio,
    pLoss: b.loss + Math.abs(b.power - pKers),
  };
}

/** Fixed-step RK4, with work/heat integrated in the same stages as velocity. */
export function kersDriveStep(
  s: DriveState,
  input: DriveInput,
  dt: number,
  p: DriveSpec = DEFAULT_DRIVE,
): DriveResult {
  validateDrive(p);
  if (
    !(dt > 0) ||
    !Number.isFinite(dt) ||
    !Number.isFinite(input.throttle) ||
    !Number.isFinite(input.brake)
  )
    throw new RangeError('kersDriveStep: invalid step or pedals');
  const y = [
    s.x,
    s.v,
    s.battery.energy,
    s.engineWork,
    s.dissipated,
    s.discEnergy,
    s.harvested,
    s.deployed,
  ];
  const out = rk4Step(
    (_t, z) => {
      const state = { ...s, v: Math.max(0, z[1]!), battery: s.battery };
      const q = forces(state, input, dt, p);
      const terminal = q.pKers >= 0 ? q.pKers / p.efficiency : q.pKers * p.efficiency;
      const b = batteryStep(s.battery, terminal, dt, p.battery);
      return [
        q.v,
        q.a,
        -b.power - b.loss,
        q.pEngine,
        q.pBrakes + q.pAero + q.pRolling + q.pLoss,
        q.pBrakes,
        Math.max(0, -b.power - b.loss),
        Math.max(0, b.power + b.loss),
      ];
    },
    s.t,
    y,
    dt,
  );
  const energy = Math.min(p.battery.capacity, Math.max(0, out[2]!));
  const depleted =
    energy <= p.battery.capacity * 1e-12 ||
    (s.battery.depleted && energy / p.battery.capacity < p.battery.restartSoc);
  const state: DriveState = {
    t: s.t + dt,
    x: out[0]!,
    v: Math.max(0, out[1]!),
    battery: { energy, depleted },
    engineWork: out[3]!,
    dissipated: out[4]!,
    discEnergy: out[5]!,
    harvested: out[6]!,
    deployed: out[7]!,
  };
  return { state, ...forces(state, input, dt, p) };
}
