/**
 * Pure, DOM-free model of the `car-dynamics` simulator.
 *
 * Every physics number comes from `src/physics` (`simulateBrakingZone`,
 * `kersBrakingEvent`, `pacejkaFx`, …). This file only adds:
 * - the UI parameter schema (display units: km/h, kW, % front) and its conversion to SI;
 * - the fixed illustrative data of the car (CoG height, wheelbase, weight split, tyre);
 * - the comparison with the constant-deceleration model of `kers-braking` for the same
 *   v₁, v₂ and braking time;
 * - the state at an instant t of the playback (interpolated from the RK4 trace) and the
 *   Pacejka curve for the plot.
 *
 * Assumptions: docs/PHYSICS.md § 9 and the module header of
 * src/physics/vehicle-dynamics.ts (point mass with longitudinal load transfer, ideal ABS
 * at the tyre peak, MGU-K on the rear axle only, `Pmax` = ELECTRICAL cap — D8).
 */
import type { ParamsSchema } from '../../core/types';
import {
  AIR_DENSITY_STD,
  DEFAULT_WEIGHT_FRONT,
  PACEJKA_ILLUSTRATIVE,
  idealBrakeBalance,
  kersBrakingEvent,
  kersDissipationSplit,
  kmhToMs,
  pacejkaFx,
  pacejkaPeakSlip,
  simulateBrakingZone,
  type BrakingZoneResult,
  type CarBrakingParams,
  type CarBrakingSample,
  type KersBrakingResult,
} from '../../physics';
import { PRESETS as KERS_PRESETS, type Source } from '../kers-braking/model';

export type { Source };

/** Simulator parameters in DISPLAY units (what the sliders show). */
export interface CarUiParams {
  /** Speed at the braking point [km/h]. */
  v1: number;
  /** Speed at the end of the braking zone [km/h]. */
  v2: number;
  /** Mass [kg]. */
  m: number;
  /** MGU-K electrical power cap [kW]. */
  Pmax: number;
  /** MGU-K efficiency η [–]. */
  eta: number;
  /** Peak tyre friction μ [–]. */
  mu: number;
  /** Drag area C_d·A [m²] (shown in Italian notation as Cx·A). */
  CdA: number;
  /** Downforce area C_l·A [m²] (shown in Italian notation as Cz·A). */
  ClA: number;
  /** Brake balance: front share of the braking force [%]. */
  balance: number;
}

/**
 * Parameter schema. NOTE: v₁, v₂ in km/h, P_max in kW and the balance in % (display
 * units) — use {@link toSI}. Every value is illustrative except the 120 / 350 kW presets.
 */
export const params = {
  v1: { min: 100, max: 360, step: 1, default: 300, unit: 'km/h', labelIT: 'Velocità iniziale v₁' },
  v2: { min: 0, max: 300, step: 1, default: 100, unit: 'km/h', labelIT: 'Velocità finale v₂' },
  m: { min: 600, max: 1100, step: 1, default: 800, unit: 'kg', labelIT: 'Massa m' },
  Pmax: {
    min: 0,
    max: 500,
    step: 1,
    default: 120,
    unit: 'kW',
    labelIT: 'Potenza massima MGU-K Pₘₐₓ (elettrica)',
  },
  // η ≥ 0,5: below it the D8 cap Pₘₐₓ/η is meaningless (η → 0 ⇒ infinite MGU-K force, QA-029).
  eta: { min: 0.5, max: 1, step: 0.01, default: 0.9, unit: '', labelIT: 'Rendimento MGU-K η' },
  mu: {
    min: 0.8,
    max: 2,
    step: 0.05,
    default: 1.6,
    unit: '',
    labelIT: 'Aderenza massima μ (picco Pacejka)',
  },
  CdA: {
    min: 0.3,
    max: 2,
    step: 0.05,
    default: 1.2,
    unit: 'm²',
    labelIT: 'Resistenza aerodinamica Cx·A',
  },
  ClA: { min: 0, max: 6, step: 0.1, default: 3.5, unit: 'm²', labelIT: 'Deportanza Cz·A' },
  balance: {
    min: 30,
    max: 80,
    step: 1,
    default: 58,
    unit: '%',
    labelIT: 'Ripartizione di frenata (quota anteriore)',
  },
} as const satisfies ParamsSchema<CarUiParams>;

export type ParamKey = keyof CarUiParams;
export const PARAM_KEYS: readonly ParamKey[] = [
  'v1',
  'v2',
  'm',
  'Pmax',
  'eta',
  'mu',
  'CdA',
  'ClA',
  'balance',
];

/** Default UI values. */
export function defaultParams(): CarUiParams {
  const out = {} as CarUiParams;
  for (const k of PARAM_KEYS) out[k] = params[k].default;
  return out;
}

/** Fixed illustrative data of the car (not sliders). Not the data of a real car. */
export const FIXED = {
  /** Height of the centre of gravity [m]. */
  h: 0.3,
  /** Wheelbase [m]. */
  L: 3.6,
  /** Static front share of weight and downforce [–]. */
  weightFront: DEFAULT_WEIGHT_FRONT,
  /** Air density, ISA sea level [kg/m³]. */
  rho: AIR_DENSITY_STD,
  /** Tyre shape (B, C, E). */
  tyre: PACEJKA_ILLUSTRATIVE,
} as const;

/** SI inputs of `simulateBrakingZone`; v₂ is clamped to v₁ (no braking when v₂ ≥ v₁). */
export function toSI(p: CarUiParams, aero: boolean): CarBrakingParams {
  const v1 = kmhToMs(p.v1);
  return {
    m: p.m,
    v1,
    v2: Math.min(v1, kmhToMs(p.v2)),
    Pmax: p.Pmax * 1e3,
    eta: p.eta,
    CdA: aero ? p.CdA : 0,
    ClA: aero ? p.ClA : 0,
    rho: FIXED.rho,
    mu: p.mu,
    brakeBalance: p.balance / 100,
    h: FIXED.h,
    L: FIXED.L,
    weightFront: FIXED.weightFront,
    tyre: FIXED.tyre,
  };
}

/** Ideal brake balance for μ (both axles at the grip limit together) [%]. */
export function idealBalancePercent(mu: number): number {
  return 100 * idealBrakeBalance(mu, FIXED.h, FIXED.L, FIXED.weightFront);
}

/** Peak slip κ* of the illustrative tyre [–]. */
export const PEAK_SLIP = pacejkaPeakSlip(FIXED.tyre);

// --- Presets (MGU-K power only; numbers and sources from kers-braking / OPEN_FACTS) ---

export interface CarPreset {
  id: '2025' | '2026';
  labelIT: string;
  /** MGU-K electrical cap [kW]. */
  Pmax: number;
  noteIT: string;
  sources: readonly Source[];
}

/**
 * The 2025 (120 kW) and 2026 (≈ 350 kW) presets reuse the sourced values of the
 * `kers-braking` presets (OPEN_FACTS #1 and #5, both "Verificato"). They change only
 * P_max; every other parameter stays illustrative.
 */
export const PRESETS: readonly CarPreset[] = KERS_PRESETS.map((p) => ({
  id: p.id,
  labelIT: p.labelIT,
  Pmax: p.values.Pmax,
  noteIT:
    p.id === '2025'
      ? 'MGU-K fino al 2025: 120 kW massimi (potenza elettrica).'
      : 'MGU-K dal 2026: circa 350 kW (potenza elettrica).',
  sources: p.sources,
}));

// --- Zone summary + comparison ------------------------------------------------------

export interface ConstantDecelComparison {
  /** `kersBrakingEvent` for the same v₁, v₂, t_brake. */
  result: KersBrakingResult;
  /** Disc-brake heat [J]. */
  brakes: number;
  /** MGU-K losses [J]. */
  mgukLoss: number;
  /** Distance with constant deceleration (v₁ + v₂)/2 · t [m]. */
  distance: number;
  /** Recovered / ΔE_k [–]. */
  recoveredFraction: number;
}

export interface ZoneSummary {
  /** Physics result (SI). */
  zone: BrakingZoneResult;
  /** Constant-deceleration model with the same t_brake (null when not braking). */
  compare: ConstantDecelComparison | null;
  /** v₂ ≥ v₁ in the UI: nothing to brake. */
  notBraking: boolean;
  /** Peak friction-brake power front / rear and peak total braking power [W] (for the glow scale). */
  peakBrakesFront: number;
  peakBrakesRear: number;
  peakTotal: number;
  /** SI inputs used. */
  si: CarBrakingParams;
}

/** Full braking zone for the UI parameters. */
export function summarize(p: CarUiParams, aero: boolean): ZoneSummary {
  const si = toSI(p, aero);
  const zone = simulateBrakingZone(si);
  const braking = zone.dEk > 0;
  let compare: ConstantDecelComparison | null = null;
  if (braking) {
    const result = kersBrakingEvent({
      m: si.m,
      v1: si.v1,
      v2: si.v2,
      Pmax: si.Pmax,
      eta: si.eta,
      tBrake: zone.tBrake,
    });
    const split = kersDissipationSplit(result);
    compare = {
      result,
      brakes: split.brakes,
      mgukLoss: split.mguk,
      distance: ((si.v1 + si.v2) / 2) * zone.tBrake,
      recoveredFraction: result.recovered / result.dEk,
    };
  }
  let peakBrakesFront = 0;
  let peakBrakesRear = 0;
  let peakTotal = 0;
  for (const s of zone.trace) {
    peakBrakesFront = Math.max(peakBrakesFront, s.pBrakesFront);
    peakBrakesRear = Math.max(peakBrakesRear, s.pBrakesRear);
    peakTotal = Math.max(peakTotal, s.pMguk + s.pBrakesFront + s.pBrakesRear + s.pAero);
  }
  return {
    zone,
    compare,
    notBraking: p.v2 >= p.v1,
    peakBrakesFront,
    peakBrakesRear,
    peakTotal,
    si,
  };
}

// --- Playback --------------------------------------------------------------------------

/** Cumulative energies on [0, t] [J]. */
export interface InstantEnergies {
  stored: number;
  mgukLoss: number;
  brakesFront: number;
  brakesRear: number;
  aero: number;
  released: number;
}

/** Trace sample at time t (linear interpolation between RK4 samples, clamped to [0, t_brake]). */
export function sampleAt(zone: BrakingZoneResult, t: number): CarBrakingSample {
  const tr = zone.trace;
  const first = tr[0] as CarBrakingSample;
  if (tr.length === 1 || t <= 0) return first;
  const last = tr[tr.length - 1] as CarBrakingSample;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = tr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((tr[mid] as CarBrakingSample).t <= t) lo = mid;
    else hi = mid;
  }
  const a = tr[lo] as CarBrakingSample;
  const b = tr[hi] as CarBrakingSample;
  const w = (t - a.t) / (b.t - a.t);
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof CarBrakingSample)[]) {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      (out as Record<string, unknown>)[key] = va + w * (vb - va);
    }
  }
  // Discrete labels follow the nearer sample.
  const near = w < 0.5 ? a : b;
  out.limit = near.limit;
  out.mgukLimit = near.mgukLimit;
  return out;
}

/** Cumulative energies of a sample. */
export function energiesOf(
  s: CarBrakingSample,
  eta: number,
  m: number,
  v1: number,
): InstantEnergies {
  return {
    stored: eta * s.eMguk,
    mgukLoss: (1 - eta) * s.eMguk,
    brakesFront: s.eBrakesFront,
    brakesRear: s.eBrakesRear,
    aero: s.eAero,
    released: 0.5 * m * (v1 * v1 - s.v * s.v),
  };
}

// --- Plot data ---------------------------------------------------------------------------

/** Pacejka curve F_x/F_z(κ) for κ ∈ [0, κ_max] (κ in %, n intervals). */
export function pacejkaCurve(mu: number, kMaxPercent = 40, n = 160): { k: number[]; mu: number[] } {
  const k: number[] = [];
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const kp = (kMaxPercent * i) / n;
    k.push(kp);
    out.push(pacejkaFx(kp / 100, 1, { ...FIXED.tyre, D: mu }));
  }
  return { k, mu: out };
}

/**
 * Inserts operating points into a curve for uPlot (one shared x array): returns the
 * curve on the merged grid and one column per point (NaN except a short segment
 * of half-width `delta` around the point, drawn thick).
 */
export function withPoints(
  xs: readonly number[],
  ys: readonly number[],
  points: readonly { x: number; y: number }[],
  delta: number,
): { xs: number[]; curve: number[]; cols: number[][] } {
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 0;
  const interp = (x: number): number => {
    for (let k = 1; k < xs.length; k++) {
      const x0 = xs[k - 1] as number;
      const x1 = xs[k] as number;
      if (x <= x1) {
        const a = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
        return (ys[k - 1] as number) + a * ((ys[k] as number) - (ys[k - 1] as number));
      }
    }
    return ys[ys.length - 1] as number;
  };
  const extra = points.map((p) =>
    [p.x - delta, p.x, p.x + delta].map((x) => Math.min(xMax, Math.max(xMin, x))),
  );
  const all = [...new Set([...xs, ...extra.flat()])].sort((a, b) => a - b);
  const cols = points.map((p, i) => {
    const seg = extra[i] as number[];
    const lo = seg[0] as number;
    const hi = seg[2] as number;
    return all.map((x) => (x >= lo && x <= hi ? (x === p.x ? p.y : interp(x)) : Number.NaN));
  });
  return { xs: all, curve: all.map(interp), cols };
}

/**
 * Speed–distance curves: the dynamic model (trace) and the constant-deceleration model
 * with the same t_brake, v(x) = √(v₁² − 2ax), on the trace's distance grid (km/h).
 */
export function speedDistance(s: ZoneSummary): { x: number[]; v: number[]; vConst: number[] } {
  const { v1, v2 } = s.si;
  const a = s.zone.tBrake > 0 ? (v1 - v2) / s.zone.tBrake : 0;
  const xEnd = s.compare?.distance ?? 0;
  const step = Math.max(1, Math.floor(s.zone.trace.length / 300));
  const pts = s.zone.trace.filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
  const x = pts.map((p) => p.x);
  const v = pts.map((p) => p.v * 3.6);
  const vConst = x.map((xx) =>
    a > 0 && xx <= xEnd * (1 + 1e-9)
      ? Math.sqrt(Math.max(v2 * v2, v1 * v1 - 2 * a * xx)) * 3.6
      : Number.NaN,
  );
  // Extend with the end point of the constant-deceleration model when it brakes longer.
  if (a > 0 && xEnd > (x[x.length - 1] ?? 0) * (1 + 1e-9)) {
    x.push(xEnd);
    v.push(Number.NaN);
    vConst.push(v2 * 3.6);
  }
  return { x, v, vConst };
}

/** Round to the number of decimals shown in the UI (same rule as `formatIT`). */
export function roundTo(n: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}

// --- Instantaneous powers (allocation-free, for the disc model and the scene) ---------------

export interface AxlePowers {
  /** Speed [m/s] and distance [m]. */
  v: number;
  x: number;
  /** Friction-brake power of the front / rear axle [W]. */
  pBrakesFront: number;
  pBrakesRear: number;
  /** Mechanical power into the MGU-K, electrical power stored, MGU-K losses [W]. */
  pMech: number;
  pElec: number;
  pLoss: number;
}

/**
 * Powers at time t (linear interpolation of the RK4 trace, like {@link sampleAt}) written
 * into `out` without allocating. After t_brake the car runs at v₂ with every power at 0.
 */
export function axlePowersAt(
  zone: BrakingZoneResult,
  eta: number,
  t: number,
  out: AxlePowers,
): AxlePowers {
  const tr = zone.trace;
  const last = tr[tr.length - 1] as CarBrakingSample;
  if (zone.dEk <= 0 || t >= last.t) {
    out.v = last.v;
    out.x = last.x;
    out.pBrakesFront = out.pBrakesRear = out.pMech = out.pElec = out.pLoss = 0;
    return out;
  }
  let lo = 0;
  let hi = tr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((tr[mid] as CarBrakingSample).t <= t) lo = mid;
    else hi = mid;
  }
  const a = tr[lo] as CarBrakingSample;
  const b = tr[hi] as CarBrakingSample;
  const w = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const lerp = (p: number, q: number): number => p + w * (q - p);
  out.v = lerp(a.v, b.v);
  out.x = lerp(a.x, b.x);
  out.pBrakesFront = lerp(a.pBrakesFront, b.pBrakesFront);
  out.pBrakesRear = lerp(a.pBrakesRear, b.pBrakesRear);
  out.pMech = lerp(a.pMguk, b.pMguk);
  out.pElec = eta * out.pMech;
  out.pLoss = out.pMech - out.pElec;
  return out;
}
