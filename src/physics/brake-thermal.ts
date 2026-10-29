/**
 * Lumped thermal model of a carbon-carbon brake disc (extension: heat visualisation
 * of the car simulators, `@slide none`). Pure functions, SI units.
 *
 * One thermal node per disc (uniform temperature T, heat capacity C = m·c):
 *
 *   C · dT/dt = P_in − Q̇_loss(T, v)
 *   Q̇_loss = h(v)·A·(T − T_amb) + ε·σ·A·(T⁴ − T_amb⁴)
 *   h(v)   = h₀ + h_ref · (v / v_ref)^0,8      (forced convection, Nu ∝ Re^0,8)
 *
 * P_in is the friction-brake power of the disc, taken from the simulator's model
 * (all of it goes into the disc: pads, caliper and hub are not modelled, so the
 * disc temperature is an upper bound). The node is integrated with a scalar RK4
 * step that also integrates the heat lost, Q, with the SAME stage values, so that
 *
 *   C·(T₁ − T₀) + Q_loss = P_in · dt
 *
 * holds to rounding (energy conservation by construction, tested).
 *
 * Every number in {@link BRAKE_DISC_ILLUSTRATIVE} is ILLUSTRATIVE (order of
 * magnitude of a racing carbon-carbon disc), not data of a real car.
 */
import { finite, nonNegative, positive } from './validate';

/** Stefan–Boltzmann constant [W·m⁻²·K⁻⁴] (exact, SI 2019 derived). */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Thermal data of one disc. */
export interface DiscThermalSpec {
  /** Disc mass [kg]. */
  mass: number;
  /** Specific heat [J/(kg·K)] (mean value over the working range). */
  c: number;
  /** Wetted area for convection and radiation [m²]. */
  area: number;
  /** Convective coefficient at rest [W/(m²·K)]. */
  h0: number;
  /** Additional forced-convection coefficient at v_ref [W/(m²·K)]. */
  hRef: number;
  /** Reference speed of hRef [m/s]. */
  vRef: number;
  /** Hemispherical emissivity [–] (0 = no radiation). */
  emissivity: number;
}

/**
 * Illustrative carbon-carbon discs (documented in docs/PHYSICS.md):
 * - front Ø ≈ 330 mm × 32 mm, ≈ 1,2 kg; rear Ø ≈ 280 mm × 32 mm, ≈ 0,9 kg
 *   (ventilated C/C, density ≈ 1,8 g/cm³ with ≈ 60 % of holes and vents);
 * - c = 1400 J/(kg·K): mean specific heat of C/C between ≈ 300 and 1000 °C
 *   (it grows from ≈ 0,7 kJ/(kg·K) at room temperature);
 * - area = both faces + vents exposed to the cooling flow;
 * - h₀ = 20 W/(m²·K) (still air), h_ref = 180 W/(m²·K) at 80 m/s with brake ducts;
 * - ε = 0,85 (carbon).
 * Ambient 25 °C. Front/rear C = 1680 / 1260 J/K.
 */
export const BRAKE_DISC_ILLUSTRATIVE = {
  front: { mass: 1.2, c: 1400, area: 0.14, h0: 20, hRef: 180, vRef: 80, emissivity: 0.85 },
  rear: { mass: 0.9, c: 1400, area: 0.1, h0: 20, hRef: 180, vRef: 80, emissivity: 0.85 },
  /** Ambient air [K]. */
  Tamb: 298.15,
} as const satisfies {
  front: DiscThermalSpec;
  rear: DiscThermalSpec;
  Tamb: number;
};

/**
 * Heat capacity of a disc C = m·c.
 *
 * @param d - disc data
 * @returns C [J/K]
 * @throws RangeError for mass ≤ 0 or c ≤ 0
 * @slide none (extension: heat visualisation)
 */
export function discHeatCapacity(d: DiscThermalSpec): number {
  positive('discHeatCapacity', 'mass', d.mass);
  positive('discHeatCapacity', 'c', d.c);
  return d.mass * d.c;
}

/**
 * Convective coefficient with forced airflow: h(v) = h₀ + h_ref·(|v|/v_ref)^0,8.
 *
 * @param d - disc data
 * @param v - car speed [m/s]
 * @returns h [W/(m²·K)]
 * @throws RangeError for non-finite v
 * @slide none (extension: heat visualisation)
 */
export function discConvectionCoefficient(d: DiscThermalSpec, v: number): number {
  finite('discConvectionCoefficient', 'v', v);
  return d.h0 + d.hRef * Math.pow(Math.abs(v) / d.vRef, 0.8);
}

/**
 * Heat lost by the disc: Q̇ = h(v)·A·(T − T_amb) + ε·σ·A·(T⁴ − T_amb⁴).
 *
 * @param T - disc temperature [K], > 0
 * @param v - car speed [m/s]
 * @param d - disc data
 * @param Tamb - ambient temperature [K], > 0
 * @returns lost power [W] (negative when T < T_amb)
 * @throws RangeError for T ≤ 0, Tamb ≤ 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function discLossPower(T: number, v: number, d: DiscThermalSpec, Tamb: number): number {
  positive('discLossPower', 'T', T);
  positive('discLossPower', 'Tamb', Tamb);
  const hA = discConvectionCoefficient(d, v) * d.area;
  return hA * (T - Tamb) + d.emissivity * STEFAN_BOLTZMANN * d.area * (T ** 4 - Tamb ** 4);
}

/** Result of {@link discThermalStep} (reusable output object). */
export interface DiscStepResult {
  /** Temperature after the step [K]. */
  T: number;
  /** Heat lost to the air during the step [J]. */
  qLoss: number;
}

/**
 * One RK4 step of C·dT/dt = P − Q̇_loss(T, v), with P and v constant over the step.
 * The lost heat uses the same four stage values, so C·ΔT + qLoss = P·dt exactly
 * (up to rounding). Allocation-free when `out` is passed.
 *
 * @param T - temperature at the start of the step [K], > 0
 * @param P - friction-brake power into the disc [W], ≥ 0
 * @param v - car speed [m/s]
 * @param d - disc data
 * @param Tamb - ambient temperature [K]
 * @param dt - step [s], ≥ 0 (use PHYSICS_DT)
 * @param out - optional output object (written in place)
 * @returns `{ T, qLoss }`
 * @throws RangeError for T ≤ 0, P < 0, dt < 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function discThermalStep(
  T: number,
  P: number,
  v: number,
  d: DiscThermalSpec,
  Tamb: number,
  dt: number,
  out: DiscStepResult = { T: 0, qLoss: 0 },
): DiscStepResult {
  const fn = 'discThermalStep';
  positive(fn, 'T', T);
  nonNegative(fn, 'P', P);
  nonNegative(fn, 'dt', dt);
  const C = discHeatCapacity(d);
  const loss = (t: number): number => discLossPower(Math.max(t, 1), v, d, Tamb);
  const h2 = dt / 2;
  const l1 = loss(T);
  const l2 = loss(T + (h2 * (P - l1)) / C);
  const l3 = loss(T + (h2 * (P - l2)) / C);
  const l4 = loss(T + (dt * (P - l3)) / C);
  const qLoss = (dt / 6) * (l1 + 2 * l2 + 2 * l3 + l4);
  out.T = T + (P * dt - qLoss) / C;
  out.qLoss = qLoss;
  return out;
}

/**
 * Adiabatic temperature rise of a disc that absorbs the energy E: ΔT = E / (m·c).
 *
 * @param E - energy into the disc [J]
 * @param d - disc data
 * @returns ΔT [K]
 * @slide none (extension: heat visualisation)
 */
export function discAdiabaticRise(E: number, d: DiscThermalSpec): number {
  finite('discAdiabaticRise', 'E', E);
  return E / discHeatCapacity(d);
}

/** Celsius → kelvin. */
export function celsiusToKelvin(c: number): number {
  return c + 273.15;
}

/** Kelvin → Celsius. */
export function kelvinToCelsius(k: number): number {
  return k - 273.15;
}
