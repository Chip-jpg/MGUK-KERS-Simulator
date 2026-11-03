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
 * 800 kg (2025 minimum), 300 → 100 km/h, t_f = 3 s, P_max = 120 kW, η = 0.95.
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 4.1, 5.3.3, 5.3.2.
 * η is the FIA's fixed policing correction used as an efficiency proxy, not a measured efficiency.
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
  eta: { min: 0, max: 1, step: 0.01, default: 0.95, unit: '', labelIT: 'Rendimento MGU-K η' },
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
  /** Era limits; torque is crank-referenced, rpm is the regulatory machine limit. */
  maxRpm: number;
  maxTorqueCrankNm: number;
  lapLimitJoules: number;
  /** MGU-K path only; battery terminal charge/discharge limit [W]. */
  batteryPower: number;
  /** `true` when OPEN_FACTS marks the power figure "Verificato". */
  verified: boolean;
  /** Short description (Italian). */
  noteIT: string;
  sources: readonly Source[];
}

const TR25: Source = {
  labelIT:
    'FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 4.1, 5.3.2 (diagram), 5.3.3',
  url: 'https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf',
};
const C26: Source = {
  labelIT:
    'FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C4.1, C4.7, C5.2.7, C5.2.10, C5.2.11, C5.2.21, C5.18.5',
  url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf',
};

/**
 * FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C4.1, C4.7:
 * 724 kg + Nominal Tyre Mass. The retained 46 kg tyre estimate is secondary,
 * not verified in an FIA document; neither is the resulting 770 kg total.
 */
export const MIN_MASS_2026 = {
  kg: 724 + 46,
  baseKg: 724,
  nominalTyreMassKg: 46,
  verified: false,
  noteIT:
    '724 kg + massa nominale pneumatici (C4.1). Stima secondaria pneumatici 46 kg: totale 770 kg, da verificare; in qualifica 726 kg + pneumatici.',
  sources: [C26] as readonly Source[],
} as const;

/** FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2 diagram. */
export const LAP_LIMIT_2025 = { joules: 2e6, verified: true, sources: [TR25] } as const;

/** FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.10. */
export const LAP_LIMIT_2026 = {
  joules: 8.5e6,
  textIT:
    '8,5 MJ/giro al bus HV DC CU-K; 7 MJ in alcuni eventi, almeno 4 MJ in qualifica, fino a +0,5 MJ ai sensi di B7.2 (massimo 9 MJ); C5.2.10. B7.2 non verificato separatamente.',
  verified: true,
  sources: [C26],
} as const;
/** Compatible name for existing panel imports. */
export const LAP_RANGE_2026 = LAP_LIMIT_2026;

/**
 * Hypothetical constant-deceleration event. 800 kg is the regulatory 2025 minimum:
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 4.1.
 */
const EXAMPLE = { m: 800, v1: 300, v2: 100, tBrake: 3 } as const;

/**
 * Era constants from TR25 / C26 sources above. η is the FIA's fixed policing
 * correction used as an efficiency proxy, not a measured efficiency:
 * FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2;
 * FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.21.
 * The 2025 electrical-cap interpretation remains the D8 modelling convention:
 * TR25 does not establish whether 120 kW is before or after the correction.
 */
export const PRESETS: readonly KersPreset[] = [
  {
    id: '2025',
    labelIT: '2025 (120 kW)',
    values: { ...EXAMPLE, Pmax: 120, eta: 0.95 },
    maxRpm: 50_000,
    maxTorqueCrankNm: 200,
    lapLimitJoules: LAP_LIMIT_2025.joules,
    batteryPower: 120e3,
    verified: true,
    noteIT:
      'MGU-K 2014–2025: 120 kW (Art. 5.3.3); 800 kg minimo regolamentare (Art. 4.1, salvo incremento caldo). η = 0,95: correzione fissa FIA usata come stima del rendimento, non un rendimento misurato (Art. 5.3.2). Frenata 300 → 100 km/h in 3 s ipotetica.',
    sources: [TR25],
  },
  {
    id: '2026',
    labelIT: '2026 (350 kW)',
    values: { ...EXAMPLE, m: MIN_MASS_2026.kg, Pmax: 350, eta: 0.97 },
    maxRpm: 60_000,
    maxTorqueCrankNm: 500,
    lapLimitJoules: LAP_LIMIT_2026.joules,
    batteryPower: 350e3,
    verified: true,
    noteIT:
      '350 kW potenza elettrica DC (C5.2.7); 60.000 rpm (C5.18.5), 500 Nm riferiti all’albero motore (C5.2.11), 8,5 MJ/giro (C5.2.10). Massa 724 kg + pneumatici (C4.1): 770 kg con stima secondaria di 46 kg, da verificare. η = 0,97: correzione fissa FIA usata come stima del rendimento, non un rendimento misurato (C5.2.21). Frenata ipotetica; MGU-H non simulata.',
    sources: [C26],
  },
];

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

// --- Instantaneous powers (allocation-free, for the scene and the disc model) ----------

/**
 * Fixed split of the disc-brake power between the axles in the scene's thermal model:
 * 60 % front, 40 % rear (illustrative; the constant-deceleration model has no axles).
 */
export const FRONT_BRAKE_SHARE = 0.6;

export interface InstantPowers {
  /** Speed [m/s]. */
  v: number;
  /** Total braking power m·a·v [W]. */
  pBrake: number;
  /** Mechanical power absorbed by the MGU-K, min(P_b, Pₘₐₓ/η) [W]. */
  pMech: number;
  /** Electrical power stored, η·pMech (≤ Pₘₐₓ) [W]. */
  pElec: number;
  /** MGU-K / converter losses, (1 − η)·pMech [W]. */
  pLoss: number;
  /** Disc-brake (friction) power, P_b − pMech [W]. */
  pDiscs: number;
}

/**
 * Powers at time t of the event (same model as `kersBrakingEvent`, D8), written into
 * `out`. After t_f (or when not braking) the car runs at v₂ with every power at 0.
 */
export function powersAt(
  si: ReturnType<typeof toSI>,
  t: number,
  out: InstantPowers,
): InstantPowers {
  const braking = si.v1 > si.v2 && si.tBrake > 0;
  if (!braking || t >= si.tBrake || t < 0) {
    out.v = t < 0 ? si.v1 : si.v2;
    out.pBrake = out.pMech = out.pElec = out.pLoss = out.pDiscs = 0;
    return out;
  }
  const a = (si.v1 - si.v2) / si.tBrake;
  const v = si.v1 - a * t;
  const pB = si.m * a * v;
  const cap = si.Pmax === 0 ? 0 : si.eta === 0 ? Infinity : si.Pmax / si.eta;
  const pMech = Math.min(pB, cap);
  out.v = v;
  out.pBrake = pB;
  out.pMech = pMech;
  out.pElec = si.eta * pMech;
  out.pLoss = pMech - out.pElec;
  out.pDiscs = pB - pMech;
  return out;
}
