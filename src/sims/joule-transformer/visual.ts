/**
 * Visual and thermal scales of the `joule-transformer` scene (pure, no Three.js),
 * shared by the scene, the legend and the model note. Every number here is
 * ILLUSTRATIVE (order of magnitude of a real overhead line), stated in the UI.
 *
 * - Line conductor: an aluminium conductor Ø 28 mm, 1,5 kg/m (c = 900 J/(kg·K)),
 *   cooled by natural convection h = 12 W/(m²·K); the line is 50 km long
 *   (go + return conductors ⇒ R' = R / 100 km). Lumped model per metre:
 *   C'·dT/dt = R'·I² − h·π·D·(T − T_amb). Real time constant ≈ 21 min, played
 *   {@link THERMAL_SPEEDUP}× faster.
 * - Sag: catenary on a 300 m span, horizontal tension 20 kN at 20 °C, thermal
 *   expansion α = 23·10⁻⁶ /K (elastic stretch neglected); drawn at
 *   {@link SAG_DRAW} scene units per metre (spans and pylons are not to scale).
 * - AC: 50 Hz played 200× slower; current particles oscillate with velocity ∝ the
 *   instantaneous current i(t) = √2·I·sin ωt; the core flux Φ(t) = Φ̂·cos ωt
 *   (ideal transformer: the flux lags the voltage by 90°).
 */
import { G_STANDARD, catenarySag, coreFluxPeak, thermalSag } from '../../physics';
import { niceCeil } from '../../render';

export const LINE = {
  /** Span between pylons [m]. */
  span: 300,
  /** Line length (one way) [m]. */
  length: 50_000,
  /** Conductor diameter [m]. */
  diameter: 0.028,
  /** Mass per metre [kg/m]. */
  massPerMetre: 1.5,
  /** Specific heat of aluminium [J/(kg·K)]. */
  specificHeat: 900,
  /** Convective coefficient [W/(m²·K)]. */
  h: 12,
  /** Linear thermal expansion [1/K]. */
  alpha: 23e-6,
  /** Horizontal tension at the reference temperature [N]. */
  tension: 20_000,
  /** Ambient / reference temperature [K]. */
  Tamb: 293.15,
} as const;

/** Heat capacity per metre C' = m'·c [J/(m·K)]. */
export const LINE_C = LINE.massPerMetre * LINE.specificHeat;
/** Convective conductance per metre h·π·D [W/(m·K)]. */
export const LINE_HA = LINE.h * Math.PI * LINE.diameter;
/** Catenary parameter at the reference temperature a₀ = H / (m'·g) [m]. */
export const LINE_A0 = LINE.tension / (LINE.massPerMetre * G_STANDARD);
/** Thermal time is played this many times faster than real time. */
export const THERMAL_SPEEDUP = 300;

/** Resistance per metre of conductor R' = R / (2·length) [Ω/m] (go + return). */
export function resistancePerMetre(Rline: number): number {
  return Rline / (2 * LINE.length);
}

/** Joule heat per metre of conductor q' = R'·I² [W/m]. */
export function heatPerMetre(Rline: number, I: number): number {
  return resistancePerMetre(Rline) * I * I;
}

/** Sag at conductor temperature T [m] (catenary + thermal elongation). */
export function sagAt(T: number): number {
  const dT = T - LINE.Tamb;
  if (dT === 0) return catenarySag(LINE.span, LINE_A0);
  return thermalSag(LINE.span, LINE_A0, LINE.alpha, dT).sag;
}

/** Drawn sag: scene units per metre of real sag. */
export const SAG_DRAW = 0.1;

/** Real AC frequency [Hz] and the slowed frequency shown [Hz]. */
export const AC_HZ = 50;
export const AC_VISUAL_HZ = 0.25;

/**
 * Current particles (QA-034): ONE speed scale per state for the three sections, so the
 * section speeds keep the current ratios exactly (generator : line = N₂ : N₁). The full
 * scale is the largest section RMS current rounded up to 1-2-5 ({@link particleFullScale});
 * its peak instantaneous current √2·I_fs moves at {@link PARTICLE_V_FS} units/s. Never
 * saturates: every section stays ≤ the full-scale speed.
 */
export const PARTICLE_V_FS = 2.4;

/** Particle full-scale current [A RMS]: 1-2-5 ceiling of the largest section current. */
export function particleFullScale(I1: number, Iline: number, Iout: number): number {
  return niceCeil(Math.max(I1, Iline, Iout), 1);
}

/** Particle speed per ampere of instantaneous current [units/(s·A)] for a full scale. */
export function particleSpeedPerAmp(fullScale: number): number {
  return PARTICLE_V_FS / (Math.SQRT2 * fullScale);
}

/** Town: one lit window per this delivered power [W]; windows in the town. */
export const WINDOW_W = 0.5e6;
export const TOTAL_WINDOWS = 200;

/** Lit windows for a delivered power [W] (∝ P, capped at the town size). */
export function litWindows(delivered: number): number {
  if (!(delivered > 0)) return 0;
  return Math.min(TOTAL_WINDOWS, Math.round(delivered / WINDOW_W));
}

/** Flux loops drawn in a core at most, and the flux that shows all of them [Wb]. */
export const FLUX_LOOPS = 12;
/** Largest peak flux the sliders allow: V₁ max, N₁ min (25 kV, 50 turns). */
export const FLUX_REF_WB = coreFluxPeak(25_000, AC_HZ, 50);

/** Fraction of the core flux loops shown (∝ Φ̂). */
export function fluxFraction(phiPeak: number): number {
  if (!(phiPeak > 0)) return 0;
  return Math.min(1, phiPeak / FLUX_REF_WB);
}

/**
 * Drawn wire radius at equal current density (J = I/A ⇒ r ∝ √I), relative to a
 * reference current drawn with radius rRef; clamped to [rMin, rMax].
 */
export function wireRadius(I: number, Iref: number, rRef: number, rMin: number, rMax: number) {
  if (!(I > 0) || !(Iref > 0)) return rMin;
  return Math.min(rMax, Math.max(rMin, rRef * Math.sqrt(I / Iref)));
}

/** Thermal false-colour scale [°C]. */
export const T_SCALE_C = [20, 120] as const;
/** Typical maximum design temperature of an overhead conductor [°C] (legend mark). */
export const T_LIMIT_C = 80;

/** Heat haze: per-metre power that gives the full effect [W/m]. */
export const HAZE_REF_W_PER_M = 40;

/** Live counters of the scene's own (non-kit) resources, for the leak check. */
export const sceneStats = { liveScenes: 0, liveGeometries: 0, liveMaterials: 0 };
