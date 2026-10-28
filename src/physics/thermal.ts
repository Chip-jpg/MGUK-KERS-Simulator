/**
 * Lumped thermal model and black-body colour (extension: heat visualisation).
 * Pure functions, SI units (K, W, J/K, W/K, s, m).
 *
 * The render layer uses these to colour hot parts (brake discs, resistors,
 * windings) from a temperature that is itself COMPUTED from the dissipated power,
 * instead of an arbitrary "glow" factor.
 */
import { finite, nonNegative, positive } from './validate';

/**
 * One exact step of the lumped (single-node) thermal model
 *
 * C · dT/dt = P − hA · (T − T_amb)
 *
 * with constant P over the step. Exact solution (no integration error, stable for
 * any dt): T∞ = T_amb + P/hA, T(t+dt) = T∞ + (T − T∞) · e^{−hA·dt/C}.
 * For hA = 0 (adiabatic): T + P·dt/C.
 *
 * Energy balance over the step: C·ΔT = P·dt − ∫ hA (T − T_amb) dt (see
 * {@link thermalStepLoss}).
 *
 * @param T - temperature at the start of the step [K]
 * @param P - power dissipated into the body [W]
 * @param C - heat capacity [J/K], > 0
 * @param hA - heat-transfer coefficient × area [W/K], ≥ 0
 * @param Tamb - ambient temperature [K]
 * @param dt - step [s], ≥ 0
 * @returns temperature after dt [K]
 * @throws RangeError for C ≤ 0, hA < 0, dt < 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function thermalStep(
  T: number,
  P: number,
  C: number,
  hA: number,
  Tamb: number,
  dt: number,
): number {
  const fn = 'thermalStep';
  finite(fn, 'T', T);
  finite(fn, 'P', P);
  positive(fn, 'C', C);
  nonNegative(fn, 'hA', hA);
  finite(fn, 'Tamb', Tamb);
  nonNegative(fn, 'dt', dt);
  if (hA === 0) return T + (P * dt) / C;
  const Tinf = Tamb + P / hA;
  return Tinf + (T - Tinf) * Math.exp((-hA * dt) / C);
}

/**
 * Heat released to the ambient during one {@link thermalStep} (exact integral):
 *
 * Q_loss = ∫₀^dt hA (T(t) − T_amb) dt = hA·(T∞ − T_amb)·dt + C·(T − T∞)·(1 − e^{−hA·dt/C})
 *
 * so that C·(T(dt) − T) = P·dt − Q_loss holds exactly (energy conservation).
 *
 * @param T - temperature at the start of the step [K]
 * @param P - power [W]
 * @param C - heat capacity [J/K], > 0
 * @param hA - heat-transfer coefficient × area [W/K], ≥ 0
 * @param Tamb - ambient temperature [K]
 * @param dt - step [s], ≥ 0
 * @returns heat lost to the ambient [J]
 * @throws RangeError as {@link thermalStep}
 * @slide none (extension: heat visualisation)
 */
export function thermalStepLoss(
  T: number,
  P: number,
  C: number,
  hA: number,
  Tamb: number,
  dt: number,
): number {
  const T1 = thermalStep(T, P, C, hA, Tamb, dt);
  return P * dt - C * (T1 - T);
}

/**
 * Steady-state temperature of the lumped model: T∞ = T_amb + P / hA.
 *
 * @param P - power [W]
 * @param hA - heat-transfer coefficient × area [W/K], > 0
 * @param Tamb - ambient temperature [K]
 * @returns T∞ [K]
 * @throws RangeError for hA ≤ 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function thermalSteadyState(P: number, hA: number, Tamb: number): number {
  finite('thermalSteadyState', 'P', P);
  positive('thermalSteadyState', 'hA', hA);
  finite('thermalSteadyState', 'Tamb', Tamb);
  return Tamb + P / hA;
}

// --- black-body colour ------------------------------------------------------------

const PLANCK_H = 6.62607015e-34; // J·s (exact, SI 2019)
const LIGHT_C = 299792458; // m/s (exact)
const BOLTZMANN_K = 1.380649e-23; // J/K (exact, SI 2019)

/**
 * Planck's law, spectral radiance per unit wavelength:
 *
 * B_λ(λ, T) = 2 h c² / λ⁵ · 1 / (e^{h c /(λ k_B T)} − 1)
 *
 * @param lambda - wavelength [m], > 0
 * @param T - temperature [K], > 0
 * @returns spectral radiance [W·sr⁻¹·m⁻³]
 * @throws RangeError for λ ≤ 0, T ≤ 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function planckRadiance(lambda: number, T: number): number {
  positive('planckRadiance', 'lambda', lambda);
  positive('planckRadiance', 'T', T);
  const x = (PLANCK_H * LIGHT_C) / (lambda * BOLTZMANN_K * T);
  return (2 * PLANCK_H * LIGHT_C * LIGHT_C) / lambda ** 5 / Math.expm1(x);
}

/** Piecewise Gaussian of the Wyman–Sloan–Shirley fit. */
function g(l: number, mu: number, s1: number, s2: number): number {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/**
 * CIE 1931 2° colour-matching functions x̄, ȳ, z̄ at wavelength λ [nm], from the
 * multi-lobe analytic fit of Wyman, Sloan & Shirley (JCGT 2(2), 2013), accurate to
 * ≈ 1 % of the tabulated CIE data in the visible range.
 *
 * @param lambdaNm - wavelength [nm]
 * @returns [x̄, ȳ, z̄] [-]
 * @throws RangeError for non-finite input
 * @slide none (extension: heat visualisation)
 */
export function cie1931(lambdaNm: number): [number, number, number] {
  finite('cie1931', 'lambdaNm', lambdaNm);
  const l = lambdaNm;
  const x =
    1.056 * g(l, 599.8, 37.9, 31.0) +
    0.362 * g(l, 442.0, 16.0, 26.7) -
    0.065 * g(l, 501.1, 20.4, 26.2);
  const y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
  const z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Integration grid of the visible spectrum [nm]. */
const LAMBDA_MIN = 380;
const LAMBDA_MAX = 780;
const LAMBDA_STEP = 5;

/**
 * CIE XYZ tristimulus of a black body at temperature T: X = ∫ B_λ(λ,T) x̄(λ) dλ
 * (and likewise Y, Z), trapezoidal rule on 380–780 nm in 5 nm steps.
 * Absolute scale: W·sr⁻¹·m⁻² (Y is proportional to the luminance).
 *
 * @param T - temperature [K], > 0
 * @returns [X, Y, Z]
 * @throws RangeError for T ≤ 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function blackbodyXYZ(T: number): [number, number, number] {
  positive('blackbodyXYZ', 'T', T);
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let l = LAMBDA_MIN; l <= LAMBDA_MAX; l += LAMBDA_STEP) {
    const w = l === LAMBDA_MIN || l === LAMBDA_MAX ? 0.5 : 1;
    const b = planckRadiance(l * 1e-9, T) * w * LAMBDA_STEP * 1e-9;
    const [x, y, z] = cie1931(l);
    X += b * x;
    Y += b * y;
    Z += b * z;
  }
  return [X, Y, Z];
}

/**
 * CIE XYZ → linear sRGB (IEC 61966-2-1, D65 white), no chromatic adaptation.
 *
 * @param xyz - tristimulus [X, Y, Z]
 * @returns linear [R, G, B] (may be negative out of gamut)
 * @slide none (extension: heat visualisation)
 */
export function xyzToLinearSRGB(xyz: readonly [number, number, number]): [number, number, number] {
  const [X, Y, Z] = xyz;
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}

/** Range and resolution of the cached colour table [K]. */
export const BLACKBODY_LUT_MIN = 300;
export const BLACKBODY_LUT_MAX = 2500;
const LUT_STEP = 10;
let lut: Float64Array | null = null;

function exactBlackbodyRGB(T: number): [number, number, number] {
  const rgb = xyzToLinearSRGB(blackbodyXYZ(T));
  const r = Math.max(0, rgb[0]);
  const gg = Math.max(0, rgb[1]);
  const b = Math.max(0, rgb[2]);
  const m = Math.max(r, gg, b);
  return [r / m, gg / m, b / m];
}

function table(): Float64Array {
  if (lut) return lut;
  const n = (BLACKBODY_LUT_MAX - BLACKBODY_LUT_MIN) / LUT_STEP + 1;
  const t = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = exactBlackbodyRGB(BLACKBODY_LUT_MIN + i * LUT_STEP);
    t[3 * i] = c[0];
    t[3 * i + 1] = c[1];
    t[3 * i + 2] = c[2];
  }
  lut = t;
  return t;
}

/**
 * Chromaticity of black-body emission as LINEAR sRGB, normalised so that the
 * largest channel is 1 (brightness is separate: see {@link blackbodyLuminance}).
 * Computed by integrating Planck's law against the CIE 1931 colour-matching
 * functions ({@link blackbodyXYZ}) and converting to sRGB (negative channels
 * clipped to 0). Values come from a table cached on first use (300–2500 K,
 * 10 K steps, linear interpolation); T outside the range is clamped.
 *
 * Hue goes from deep red (≈ 800 K) through orange (≈ 1500 K) to warm white.
 *
 * @param T - temperature [K]
 * @param out - optional output (written in place)
 * @returns [r, g, b] linear, max channel = 1
 * @throws RangeError for non-finite T
 * @slide none (extension: heat visualisation)
 */
export function blackbodyRGB(
  T: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  finite('blackbodyRGB', 'T', T);
  const t = table();
  const x =
    (Math.min(Math.max(T, BLACKBODY_LUT_MIN), BLACKBODY_LUT_MAX) - BLACKBODY_LUT_MIN) / LUT_STEP;
  const i = Math.min(Math.floor(x), (BLACKBODY_LUT_MAX - BLACKBODY_LUT_MIN) / LUT_STEP - 1);
  const f = x - i;
  for (let c = 0; c < 3; c++) {
    const a = t[3 * i + c] as number;
    const b = t[3 * (i + 1) + c] as number;
    out[c] = a + (b - a) * f;
  }
  return out;
}

/**
 * Visible luminance of a black body relative to the one at `Tref`:
 * Y(T) / Y(Tref), with Y from {@link blackbodyXYZ}. Grows by many orders of
 * magnitude between 700 K (just visible in the dark, "Draper point" ≈ 798 K) and
 * 2500 K, which is why the renderer maps it logarithmically.
 *
 * @param T - temperature [K], > 0
 * @param Tref - reference temperature [K], > 0 (default 2500 K)
 * @returns Y(T)/Y(Tref) [-]
 * @throws RangeError for T ≤ 0, Tref ≤ 0 or non-finite input
 * @slide none (extension: heat visualisation)
 */
export function blackbodyLuminance(T: number, Tref = BLACKBODY_LUT_MAX): number {
  positive('blackbodyLuminance', 'T', T);
  positive('blackbodyLuminance', 'Tref', Tref);
  return blackbodyXYZ(T)[1] / blackbodyXYZ(Tref)[1];
}
