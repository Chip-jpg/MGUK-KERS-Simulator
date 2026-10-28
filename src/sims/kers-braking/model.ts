/**
 * Pure, DOM-free model of the `kers-braking` simulator.
 *
 * Every physics number comes from `src/physics` (`kersBrakingEvent`,
 * `kersDissipationSplit`, `kineticEnergyDelta`, `kmhToMs`). This file only adds:
 * - the UI parameter schema (display units: km/h, kW) and its conversion to SI;
 * - the regulation presets, whose numbers come from `docs/OPEN_FACTS.md`;
 * - the state of the braking event at an instant t (speed, distance, power
 *   split, energy stored so far), used by the playback.
 *
 * Assumptions (same as `kersBrakingEvent`, docs/PHYSICS.md §4 and DECISIONS D8):
 * straight-line braking with CONSTANT deceleration a = (v₁ − v₂)/t_f, drag and
 * rolling resistance ignored, constant efficiency η, `Pmax` = ELECTRICAL power cap
 * of the MGU-K (it absorbs at most Pmax/η of mechanical power), no per-lap energy
 * limit and no battery state of charge.
 */
import type { ParamsSchema } from '../../core/types';
import {
  kersBrakingEvent,
  kersDissipationSplit,
  kineticEnergyDelta,
  kmhToMs,
  type KersBrakingResult,
} from '../../physics';

/** Simulator parameters in DISPLAY units (what the sliders show). */
export interface KersUiParams {
  /** Mass [kg]. */
  m: number;
  /** Initial speed [km/h]. */
  v1: number;
  /** Final speed [km/h]. */
  v2: number;
  /** MGU-K electrical power cap [kW]. */
  Pmax: number;
  /** MGU-K efficiency (mechanical → electrical) [–]. */
  eta: number;
  /** Braking duration [s]. */
  tBrake: number;
}

/**
 * Parameter schema. NOTE: values are in display units (km/h, kW), not SI —
 * use {@link toSI} before calling `src/physics`. All other fields are SI.
 * Defaults = the theory example of `content/theory/10-kers-mguk.md`:
 * 800 kg (illustrative), 300 → 100 km/h, t_f = 3 s, P_max = 120 kW, η = 0,9.
 */
export const params = {
  m: { min: 500, max: 1200, step: 1, default: 800, unit: 'kg', labelIT: 'Massa m' },
  v1: { min: 0, max: 360, step: 1, default: 300, unit: 'km/h', labelIT: 'Velocità iniziale v₁' },
  v2: { min: 0, max: 360, step: 1, default: 100, unit: 'km/h', labelIT: 'Velocità finale v₂' },
  Pmax: {
    min: 0,
    max: 500,
    step: 1,
    default: 120,
    unit: 'kW',
    labelIT: 'Potenza massima MGU-K Pₘₐₓ (elettrica)',
  },
  eta: { min: 0, max: 1, step: 0.01, default: 0.9, unit: '', labelIT: 'Rendimento MGU-K η' },
  tBrake: { min: 0.5, max: 10, step: 0.1, default: 3, unit: 's', labelIT: 'Durata della frenata' },
} as const satisfies ParamsSchema<KersUiParams>;

export type ParamKey = keyof KersUiParams;
export const PARAM_KEYS: readonly ParamKey[] = ['m', 'v1', 'v2', 'Pmax', 'eta', 'tBrake'];

/** Default UI values. */
export function defaultParams(): KersUiParams {
  return {
    m: params.m.default,
    v1: params.v1.default,
    v2: params.v2.default,
    Pmax: params.Pmax.default,
    eta: params.eta.default,
    tBrake: params.tBrake.default,
  };
}

/** SI inputs of `kersBrakingEvent` (km/h → m/s, kW → W). */
export function toSI(p: KersUiParams): {
  m: number;
  v1: number;
  v2: number;
  Pmax: number;
  eta: number;
  tBrake: number;
} {
  return {
    m: p.m,
    v1: kmhToMs(p.v1),
    v2: kmhToMs(p.v2),
    Pmax: p.Pmax * 1e3,
    eta: p.eta,
    tBrake: p.tBrake,
  };
}

// --- Presets (numbers from docs/OPEN_FACTS.md) --------------------------------

export interface Source {
  labelIT: string;
  url: string;
}

export interface KersPreset {
  id: '2025' | '2026';
  /** Button label. */
  labelIT: string;
  /** Values applied by the preset. */
  values: KersUiParams;
  /** `true` when OPEN_FACTS marks the power figure "Verificato". */
  verified: boolean;
  /** Short description (Italian). */
  noteIT: string;
  sources: readonly Source[];
}

const FIA_2014: Source = {
  labelIT: 'FIA, Formula One Power Unit Regulations 2014 (leaflet)',
  url: 'https://www.fia.com/sites/default/files/publication/file/FIA%20F1%20Power%20Unit%20leaflet.pdf',
};
const HONDA_MGUK: Source = {
  labelIT: 'Honda, Powertrain MGU-H / MGU-K',
  url: 'https://global.honda/en/tech/motorsports/Formula-1/Powertrain_MGU-H_MGU-K/',
};
const F1_2026: Source = {
  labelIT: 'Formula 1, “7 things you need to know about the 2026 F1 engine regulations”',
  url: 'https://www.formula1.com/en/latest/article/more-efficient-less-fuel-and-carbon-net-zero-7-things-you-need-to-know-about.ZhtzvU3cPCv8QO7jtFxQR',
};
const HONDA_2026: Source = {
  labelIT: 'Honda, 2026 Regulations Overview',
  url: 'https://global.honda/en/F1/features/2026_Commentary/regulations/',
};
const FIA_2026_MASS: Source = {
  labelIT: 'FIA, comunicato sui regolamenti 2026',
  url: 'https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond',
};

/** Common illustrative event: 800 kg, 300 → 100 km/h in 3 s, η = 0,9 (theory file 10). */
const EXAMPLE = { m: 800, v1: 300, v2: 100, eta: 0.9, tBrake: 3 } as const;

/**
 * Regulation presets. OPEN_FACTS #1 (120 kW, 2014–2025) and #5 (≈ 350 kW from
 * 2026) are both "Verificato"; a preset whose figure is not verified must show
 * "valore da verificare" (see {@link KersPreset.verified}).
 */
export const PRESETS: readonly KersPreset[] = [
  {
    id: '2025',
    labelIT: '2025 (120 kW)',
    values: { ...EXAMPLE, Pmax: 120 },
    verified: true,
    noteIT:
      'MGU-K fino al 2025: 120 kW massimi. Massa 800 kg, 300 → 100 km/h in 3 s e η = 0,9 sono valori illustrativi.',
    sources: [FIA_2014, HONDA_MGUK],
  },
  {
    id: '2026',
    labelIT: '2026 (350 kW)',
    values: { ...EXAMPLE, Pmax: 350 },
    verified: true,
    noteIT:
      'MGU-K dal 2026: circa 350 kW, MGU-H eliminata. Massa 800 kg, 300 → 100 km/h in 3 s e η = 0,9 sono valori illustrativi.',
    sources: [F1_2026],
  },
];

/** OPEN_FACTS #7 (Verificato): minimum mass 2026 = 722 kg (car + driver, no fuel) + 46 kg tyres. */
export const MIN_MASS_2026 = {
  kg: 768,
  verified: true,
  noteIT: '768 kg = 722 kg (auto + pilota, senza carburante) + 46 kg di pneumatici stimati.',
  sources: [FIA_2026_MASS] as readonly Source[],
} as const;

/** OPEN_FACTS #2 (Verificato): MGU-K → energy store, max 2 MJ per lap (2014–2025). */
export const LAP_LIMIT_2025 = { joules: 2e6, verified: true, sources: [FIA_2014] } as const;

/** OPEN_FACTS #6 (DA VERIFICARE): energy recoverable per lap in 2026, "circa 7–9 MJ". */
export const LAP_RANGE_2026 = {
  textIT: 'circa 7–9 MJ, variabile per evento e sessione',
  verified: false,
  sources: [HONDA_2026],
} as const;

// --- Event summary --------------------------------------------------------------

export interface EventSummary {
  /** `kersBrakingEvent` result (SI). */
  result: KersBrakingResult;
  /** Disc-brake heat [J]. */
  brakes: number;
  /** MGU-K / converter losses [J]. */
  mgukLoss: number;
  /** Mean braking power ΔE_k / t_f [W] (0 when not braking). */
  meanPower: number;
  /** Peak total braking power (at t = 0) [W]. */
  peakPower: number;
  /** v₂ > v₁: not a braking event. */
  notBraking: boolean;
  /** v₁ = v₂: nothing to brake. */
  noChange: boolean;
  /** Recovered / ΔE_k (0 … 1), 0 when not braking. */
  recoveredFraction: number;
}

/** Full braking event for the UI parameters. */
export function summarize(p: KersUiParams): EventSummary {
  const si = toSI(p);
  const result = kersBrakingEvent(si);
  const split = kersDissipationSplit(result);
  const braking = result.dEk > 0;
  const first = result.powerTrace[0];
  return {
    result,
    brakes: split.brakes,
    mgukLoss: split.mguk,
    meanPower: braking ? result.dEk / si.tBrake : 0,
    peakPower: first ? first.pKers + first.pBrakes : 0,
    notBraking: p.v2 > p.v1,
    noChange: p.v2 === p.v1,
    recoveredFraction: braking ? result.recovered / result.dEk : 0,
  };
}

// --- State at an instant (playback) -------------------------------------------

export interface InstantState {
  /** Time since braking started, clamped to [0, t_f] [s]. */
  t: number;
  /** Speed v(t) = v₁ − a·t [m/s]. */
  v: number;
  /** Distance travelled since t = 0: x = v₁t − ½at² [m]. */
  x: number;
  /** Electrical power into the battery at t [W]. */
  pKers: number;
  /** Power not stored at t (disc brakes + MGU-K losses) [W]. */
  pBrakes: number;
  /** Electrical energy stored on [0, t] [J]. */
  stored: number;
  /** Disc-brake heat on [0, t] [J]. */
  brakesHeat: number;
  /** MGU-K losses on [0, t] [J]. */
  mgukLoss: number;
  /** Kinetic energy released on [0, t] [J]. */
  released: number;
}

/**
 * State of the braking event at time `t`. The energies on [0, t] are obtained
 * by calling `kersBrakingEvent` on the sub-event v₁ → v(t) of duration t: with
 * constant deceleration it has the same deceleration and the same P_b(τ) on
 * [0, t], so its totals are exactly the integrals up to t, and the last sample
 * of its trace is the instantaneous power split at t.
 */
export function stateAt(p: KersUiParams, t: number): InstantState {
  const si = toSI(p);
  const tc = Math.min(Math.max(t, 0), si.tBrake);
  const a = (si.v1 - si.v2) / si.tBrake; // [m/s²] (negative when v₂ > v₁)
  const v = tc >= si.tBrake ? si.v2 : Math.max(0, si.v1 - a * tc);
  const x = si.v1 * tc - 0.5 * a * tc * tc;
  if (tc <= 0 || !(si.v1 > si.v2)) {
    // Start of the event, or not a braking event (powers and energies are 0).
    const at0 = tc <= 0 && si.v1 > si.v2 ? kersBrakingEvent(si).powerTrace[0] : undefined;
    return {
      t: tc,
      v,
      x,
      pKers: at0?.pKers ?? 0,
      pBrakes: at0?.pBrakes ?? 0,
      stored: 0,
      brakesHeat: 0,
      mgukLoss: 0,
      released: 0,
    };
  }
  const sub = kersBrakingEvent({ ...si, v2: v, tBrake: tc });
  const split = kersDissipationSplit(sub);
  const last = sub.powerTrace[sub.powerTrace.length - 1];
  return {
    t: tc,
    v,
    x,
    pKers: last?.pKers ?? 0,
    pBrakes: last?.pBrakes ?? 0,
    stored: sub.recovered,
    brakesHeat: split.brakes,
    mgukLoss: split.mguk,
    released: kineticEnergyDelta(si.m, si.v1, v),
  };
}

/** Round to the number of decimals shown in the UI (same rule as `formatIT`). */
export function roundTo(n: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
