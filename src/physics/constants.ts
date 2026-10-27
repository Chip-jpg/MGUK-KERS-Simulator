/**
 * Physical constants and unit conversions. Internally everything is SI (§4.1);
 * the conversion helpers are meant for the UI boundary only (km/h, degrees).
 */

/** Fixed physics time step in seconds (§4.1): 1/240 s. */
export const PHYSICS_DT = 1 / 240;

/**
 * Vacuum magnetic permeability used by default in the app [H/m].
 *
 * μ₀ = 4π · 10⁻⁷ H/m — the value written in the slides (exact in the pre-2019 SI).
 * The 2019-SI value {@link MU_0_SI2019} differs by ≈ 5.5 · 10⁻¹⁰ (relative), far
 * below any precision shown in the UI.
 *
 * @slide 14
 */
export const MU_0 = 4 * Math.PI * 1e-7;

/**
 * Vacuum magnetic permeability, CODATA 2018 recommended value (2019 SI, where μ₀
 * is measured and no longer exact) [H/m]. Reference only, not used by default.
 *
 * @slide none (extension: reference value)
 */
export const MU_0_SI2019 = 1.25663706212e-6;

/**
 * Converts km/h to m/s: v[m/s] = v[km/h] / 3.6.
 *
 * @param kmh - speed [km/h]
 * @returns speed [m/s]
 * @slide none (extension: unit conversion)
 */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

/**
 * Converts m/s to km/h: v[km/h] = 3.6 · v[m/s].
 *
 * @param ms - speed [m/s]
 * @returns speed [km/h]
 * @slide none (extension: unit conversion)
 */
export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/**
 * Converts degrees to radians: α[rad] = α[°] · π / 180.
 *
 * @param deg - angle [°]
 * @returns angle [rad]
 * @slide none (extension: unit conversion)
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Converts radians to degrees: α[°] = α[rad] · 180 / π.
 *
 * @param rad - angle [rad]
 * @returns angle [°]
 * @slide none (extension: unit conversion)
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
