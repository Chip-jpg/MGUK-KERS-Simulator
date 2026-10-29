/**
 * Heat glow from a COMPUTED temperature (render side of `physics/thermal`).
 *
 * The emissive colour is the black-body chromaticity at T (Planck × CIE 1931 →
 * linear sRGB, `blackbodyRGB`); the intensity follows the black body's visible
 * luminance, mapped logarithmically for display: zero below ≈ 700 K (nothing
 * visible), a dull red at 800–900 K, bright orange-white near 2000 K.
 * Use `createHeatBody` to integrate the lumped model per physics step and drive
 * a material.
 */
import * as THREE from 'three';
import { blackbodyLuminance, blackbodyRGB, thermalStep } from '../physics';

/** Temperature below which nothing glows [K]. */
export const GLOW_ONSET_K = 700;

const lumCache = new Map<number, number>();

/**
 * Display intensity of the glow at T: with L = log₁₀(Y(T)/Y(700 K)) (visible
 * luminance ratio, ≈ 11,6 decades from 700 K to 2500 K), intensity =
 * 2,6 · (L / 11,6)^1,5 — 0 below {@link GLOW_ONSET_K}, ≈ 0,2 at 800 K,
 * ≈ 1,7 at 1500 K, 2,6 at 2500 K (emissive intensity, blooms in alta).
 * Cached per kelvin.
 */
export function glowIntensity(T: number): number {
  if (!(T > GLOW_ONSET_K)) return 0;
  const k = Math.round(Math.min(T, 2500));
  let v = lumCache.get(k);
  if (v === undefined) {
    const L = Math.log10(blackbodyLuminance(k) / blackbodyLuminance(GLOW_ONSET_K));
    const L2500 = Math.log10(blackbodyLuminance(2500) / blackbodyLuminance(GLOW_ONSET_K));
    v = 2.6 * Math.pow(Math.max(0, L / L2500), 1.5);
    lumCache.set(k, v);
  }
  return Math.max(0, v);
}

const rgb: [number, number, number] = [0, 0, 0];

/** Write the black-body glow at T into a material's emissive colour/intensity. */
export function applyHeatGlow(
  mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial,
  T: number,
): void {
  const k = glowIntensity(T);
  blackbodyRGB(T, rgb);
  mat.emissive.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
  mat.emissiveIntensity = k;
}

export interface HeatBodyParams {
  /** Heat capacity [J/K]. */
  C: number;
  /** Heat-transfer coefficient × area [W/K]. */
  hA: number;
  /** Ambient temperature [K] (default 293,15 K). */
  Tamb?: number;
}

export interface HeatBody {
  /** Temperature [K]. */
  readonly T: number;
  /** Advance the lumped model by dt with dissipated power P [W] (exact step). */
  step(P: number, dt: number): number;
  reset(T?: number): void;
  /** Drive a material's emissive glow from the current T. */
  apply(mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial): void;
}

export function createHeatBody(p: HeatBodyParams): HeatBody {
  const Tamb = p.Tamb ?? 293.15;
  let T = Tamb;
  return {
    get T() {
      return T;
    },
    step(P, dt) {
      T = thermalStep(T, P, p.C, p.hA, Tamb, dt);
      return T;
    },
    reset(t = Tamb) {
      T = t;
    },
    apply(mat) {
      applyHeatGlow(mat, T);
    },
  };
}

// --- thermal false colour ----------------------------------------------------------------

/**
 * "Ironbow" thermal-camera palette stops (sRGB 0–255), from cold to hot:
 * near-black navy → violet → magenta-red → orange → yellow → near-white.
 * A FALSE colour (an instrument's display), never confused with incandescence:
 * the sims show it only behind a labelled toggle, with a °C scale.
 */
export const IRONBOW_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 18, 10, 52],
  [0.2, 86, 18, 130],
  [0.42, 182, 32, 112],
  [0.62, 232, 92, 36],
  [0.82, 250, 178, 30],
  [1, 255, 246, 214],
];

/**
 * Ironbow false colour of x ∈ [0, 1] (clamped) as sRGB components in [0, 1].
 * Piecewise linear between {@link IRONBOW_STOPS}.
 */
export function ironbow(
  x: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const t = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
  let k = 1;
  type Stop = readonly [number, number, number, number];
  while (k < IRONBOW_STOPS.length - 1 && (IRONBOW_STOPS[k] as Stop)[0] < t) k++;
  const a = IRONBOW_STOPS[k - 1] as Stop;
  const b = IRONBOW_STOPS[k] as Stop;
  const f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  out[0] = (a[1] + f * (b[1] - a[1])) / 255;
  out[1] = (a[2] + f * (b[2] - a[2])) / 255;
  out[2] = (a[3] + f * (b[3] - a[3])) / 255;
  return out;
}

/** CSS `linear-gradient` of the ironbow palette (for the °C legend bar). */
export function ironbowGradientCss(direction = 'to right'): string {
  const stops = IRONBOW_STOPS.map(
    ([p, r, g, b]) => `rgb(${r} ${g} ${b}) ${Math.round(p * 100)}%`,
  ).join(', ');
  return `linear-gradient(${direction}, ${stops})`;
}
