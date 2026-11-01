/** Finite energy store; SI units. Positive terminal power is discharge. */
export interface BatterySpec {
  capacity: number;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  chargePower: number;
  dischargePower: number;
  voltage: number;
  resistance: number;
  restartSoc: number;
}

export const DEFAULT_BATTERY: Readonly<BatterySpec> = {
  capacity: 4e6,
  chargeEfficiency: 0.95,
  dischargeEfficiency: 0.95,
  chargePower: 120e3,
  dischargePower: 120e3,
  voltage: 800,
  resistance: 0,
  restartSoc: 0.05,
};

export interface BatteryState {
  energy: number;
  depleted: boolean;
}
export interface BatteryResult {
  state: BatteryState;
  /** Actual terminal power [W], discharge positive. */
  power: number;
  /** Dissipated power [W], including conversion and internal Joule heat. */
  loss: number;
  joule: number;
  soc: number;
}

export function validateBattery(spec: BatterySpec): void {
  for (const value of Object.values(spec))
    if (!Number.isFinite(value)) throw new RangeError('battery: finite parameters required');
  if (
    !(spec.capacity > 0 && spec.voltage > 0) ||
    spec.resistance < 0 ||
    spec.chargePower < 0 ||
    spec.dischargePower < 0 ||
    !(spec.chargeEfficiency > 0 && spec.chargeEfficiency <= 1) ||
    !(spec.dischargeEfficiency > 0 && spec.dischargeEfficiency <= 1) ||
    spec.restartSoc < 0 ||
    spec.restartSoc > 1
  )
    throw new RangeError('battery: invalid parameters');
}

export function createBattery(spec: BatterySpec = DEFAULT_BATTERY, soc = 0.5): BatteryState {
  validateBattery(spec);
  if (!Number.isFinite(soc) || soc < 0 || soc > 1) throw new RangeError('battery: invalid SoC');
  return { energy: spec.capacity * soc, depleted: soc === 0 };
}

/** Constant-voltage equivalent I=P/V. R is optional; no electrochemical claim. */
export function batteryStep(
  state: BatteryState,
  requestedPower: number,
  dt: number,
  spec: BatterySpec = DEFAULT_BATTERY,
): BatteryResult {
  validateBattery(spec);
  if (
    !Number.isFinite(requestedPower) ||
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(state.energy) ||
    state.energy < 0 ||
    state.energy > spec.capacity
  )
    throw new RangeError('batteryStep: invalid state, power or dt');
  const latched =
    (state.depleted || state.energy === 0) &&
    (state.energy === 0 || state.energy / spec.capacity < spec.restartSoc);
  let power =
    requestedPower >= 0
      ? latched
        ? 0
        : Math.min(requestedPower, spec.dischargePower)
      : -Math.min(-requestedPower, spec.chargePower);
  const rate = (p: number): number =>
    p >= 0
      ? p / spec.dischargeEfficiency + spec.resistance * (p / spec.voltage) ** 2
      : p * spec.chargeEfficiency + spec.resistance * (p / spec.voltage) ** 2;
  // Solve the monotone power/energy limit, including I²R, before integration.
  if (power > 0 && rate(power) * dt > state.energy) {
    let lo = 0,
      hi = power;
    for (let i = 0; i < 52; i++) {
      const mid = (lo + hi) / 2;
      if (rate(mid) * dt > state.energy) hi = mid;
      else lo = mid;
    }
    power = lo;
  } else if (power < 0) {
    // Avoid the nonphysical branch where Joule heat exceeds charging input.
    if (spec.resistance > 0)
      power = Math.max(power, (-0.5 * spec.chargeEfficiency * spec.voltage ** 2) / spec.resistance);
    if (-rate(power) * dt > spec.capacity - state.energy) {
      let lo = power,
        hi = 0;
      for (let i = 0; i < 52; i++) {
        const mid = (lo + hi) / 2;
        if (-rate(mid) * dt > spec.capacity - state.energy) lo = mid;
        else hi = mid;
      }
      power = hi;
    }
  }
  const energy = Math.min(spec.capacity, Math.max(0, state.energy - rate(power) * dt));
  const empty = energy <= spec.capacity * 1e-12;
  return {
    state: {
      energy: empty ? 0 : energy,
      depleted: empty || (latched && energy / spec.capacity < spec.restartSoc),
    },
    power,
    loss: rate(power) - power,
    joule: spec.resistance * (power / spec.voltage) ** 2,
    soc: empty ? 0 : energy / spec.capacity,
  };
}
