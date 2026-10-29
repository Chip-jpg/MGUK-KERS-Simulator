/**
 * Visual and thermal scales of the `rl-energy` bench scene (pure, no Three.js),
 * shared by the scene, the legend and the model note. Illustrative values are
 * stated in the UI.
 *
 * - Current particles: velocity ∝ i ({@link PARTICLE_SPEED_PER_AMP} scene
 *   units/s per ampere, capped at {@link PARTICLE_VMAX}).
 * - Field lines: computed for a finite solenoid (sum of coaxial loops,
 *   `solenoidField`): the SHAPE of the field is fixed, its magnitude ∝ i, so the
 *   number of lines drawn (each line = the same flux) is ∝ i / I_ref.
 * - Stored energy ½·L·i²: purple glow inside the solenoid, intensity ∝ U / U_ref
 *   with U_ref = ½·L·I₀² (the steady-state energy; ∝ i²: it lags the field lines).
 * - Energy ribbons: radius ∝ power / P_ref with P_ref = E·I_ref; the trunk
 *   (generator E·i) splits into Joule R·i² and field L·i·di/dt = (E − R·i)·i, so the
 *   two branch radii add up to the trunk radius.
 * - Resistor wire: lumped thermal model C·dT/dt = R·i² − hA·(T − T_amb) with an
 *   ILLUSTRATIVE wire (C = 0,25 J/K, hA = 0,5 W/K: τ = 0,5 s); black-body glow only
 *   above 700 K (reached only with large currents for several τ), a labelled
 *   false-colour overlay below.
 */
import { niceCeil } from '../../render';

export const PARTICLE_SPEED_PER_AMP = 0.4;
export const PARTICLE_VMAX = 3.0;

/** Volts per battery cell drawn; at most this many cells. */
export const CELL_VOLTS = 1.5;
export const MAX_CELLS = 16;

/** Cells drawn for an emf E (∝ E, 1,5 V per cell, at least 1). */
export function cellCount(E: number): number {
  if (!(E > 0)) return 1;
  return Math.max(1, Math.min(MAX_CELLS, Math.round(E / CELL_VOLTS)));
}

/** Reference current of the visual scales: 1-2-5 full scale above I₀. */
export function currentRef(I0: number): number {
  return niceCeil(Math.abs(I0), 1e-6);
}

/** Fraction of the field lines drawn: |i| / I_ref, in [0, 1]. */
export function lineFraction(i: number, Iref: number): number {
  if (!(Iref > 0)) return 0;
  return Math.min(1, Math.abs(i) / Iref);
}

/** Powers of the circuit at current i [W]: generator, Joule, into the field. */
export function circuitPowers(
  E: number,
  R: number,
  i: number,
): {
  gen: number;
  joule: number;
  field: number;
} {
  const joule = R * i * i;
  return { gen: E * i, joule, field: E * i - joule };
}

/** Illustrative resistor wire (lumped thermal model). */
export const RESISTOR_THERMAL = { C: 0.25, hA: 0.5, Tamb: 293.15 } as const;
/** False-colour scale of the resistor [°C]. */
export const RES_T_SCALE_C = [20, 220] as const;

/** Visual turns of the solenoid winding. */
export const SOLENOID_TURNS = { alta: 30, bilanciata: 24, base: 16 } as const;

/** Live counters of the scene's own (non-kit) resources, for the leak check. */
export const sceneStats = { liveScenes: 0, liveGeometries: 0, liveMaterials: 0 };
