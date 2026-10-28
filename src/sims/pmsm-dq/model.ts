/**
 * Pure (DOM-free) model of the `pmsm-dq` simulator, composed from the PMSM
 * functions of `src/physics` (d-q model, limits, PI current dynamics).
 *
 * Assumptions (also in the model note):
 * - linear d-q model, no saturation, iron losses neglected, ideal inverter whose
 *   voltage is limited to V_max = V_DC/√3;
 * - the shaft speed is imposed from outside (car / test bench): the machine
 *   torque does not change the speed in this simulator;
 * - machine parameters are **illustrative** (didactic example), not the data of
 *   any real MGU-K (type and data are not public, see docs/OPEN_FACTS.md #8);
 * - the animation runs in slow motion: the electrical model advances by
 *   k·dt per physics step dt = 1/240 s, with k = f_display/fₑ (see
 *   {@link timeScale}), so the three-phase sinusoids are visible at any speed.
 */
import {
  PHYSICS_DT,
  dqToAbc,
  pmsmBaseSpeed,
  pmsmControllerVoltages,
  pmsmCopperLoss,
  pmsmCurrentControllerGains,
  pmsmDynamicsStep,
  pmsmEfficiency,
  pmsmElectricalPower,
  pmsmMaxTorque,
  pmsmMtpa,
  pmsmSteadyDynState,
  pmsmTorque,
  pmsmTorqueSpeedEnvelope,
  pmsmVoltageLimit,
  type PmsmCurrentController,
  type PmsmDynState,
  type PmsmMode,
  type PmsmParams,
  type PmsmRegion,
} from '../../physics';
import type { ParamsSchema } from '../../core/types';

export type MachineMode = PmsmMode;
export type PresetId = 'ipm' | 'spm';

/** Numeric parameters exposed as sliders (display units: giri/min, A, V). */
export interface PmsmSimParams {
  speedRpm: number;
  iRef: number;
  idRef: number;
  iqRef: number;
  iMax: number;
  vdc: number;
}

export const params = {
  speedRpm: {
    min: 500,
    max: 20000,
    step: 100,
    default: 4000,
    unit: 'giri/min',
    labelIT: 'Velocità del rotore n',
  },
  iRef: {
    min: 0,
    max: 500,
    step: 5,
    default: 300,
    unit: 'A',
    labelIT: 'Corrente richiesta |I| (MTPA)',
  },
  idRef: {
    min: -500,
    max: 200,
    step: 5,
    default: -100,
    unit: 'A',
    labelIT: 'Corrente asse d richiesta',
  },
  iqRef: {
    min: 0,
    max: 500,
    step: 5,
    default: 250,
    unit: 'A',
    labelIT: 'Corrente asse q richiesta (modulo)',
  },
  iMax: {
    min: 50,
    max: 600,
    step: 10,
    default: 400,
    unit: 'A',
    labelIT: 'Corrente massima Iₘₐₓ',
  },
  vdc: {
    min: 100,
    max: 1000,
    step: 10,
    default: 600,
    unit: 'V',
    labelIT: 'Tensione del bus in continua (DC)',
  },
} satisfies ParamsSchema<PmsmSimParams>;

export interface Preset {
  id: PresetId;
  labelIT: string;
  machine: PmsmParams;
}

/**
 * Didactic machines with illustrative parameters (NOT the MGU-K's). Both have
 * characteristic current ψₘ/L_d = 400 A, so above base speed the power stays
 * roughly constant up to I_max = 400 A.
 */
export const PRESETS: Record<PresetId, Preset> = {
  ipm: {
    id: 'ipm',
    labelIT: 'Magneti interni (anisotropa)',
    machine: { Rs: 0.02, Ld: 0.2e-3, Lq: 0.35e-3, psiM: 0.08, p: 4 },
  },
  spm: {
    id: 'spm',
    labelIT: 'Magneti superficiali (isotropa)',
    machine: { Rs: 0.02, Ld: 0.25e-3, Lq: 0.25e-3, psiM: 0.1, p: 4 },
  },
};

/** Closed-loop current-control bandwidth ω_c [rad/s] (200 Hz). */
export const CURRENT_BANDWIDTH = 2 * Math.PI * 200;
/** Electrical revolutions shown per real second in the slow-motion animation [Hz]. */
export const DISPLAY_ELECTRICAL_HZ = 0.75;
/** Highest speed of the torque–speed map [giri/min]. */
export const MAP_RPM_MAX = params.speedRpm.max;
/** Samples of the torque–speed map. */
export const MAP_SAMPLES = 81;

export const rpmToRad = (n: number): number => (n * Math.PI) / 30;
export const radToRpm = (w: number): number => (w * 30) / Math.PI;

/** Everything the user can set. */
export interface Settings extends PmsmSimParams {
  mode: MachineMode;
  /** "MTPA automatico": set-points from {@link pmsmMaxTorque} with |I| ≤ min(iRef, iMax). */
  auto: boolean;
  preset: PresetId;
}

export function defaultSettings(): Settings {
  return {
    mode: 'motor',
    auto: true,
    preset: 'ipm',
    speedRpm: params.speedRpm.default,
    iRef: params.iRef.default,
    idRef: params.idRef.default,
    iqRef: params.iqRef.default,
    iMax: params.iMax.default,
    vdc: params.vdc.default,
  };
}

/** Quantities derived from the settings (constant until a setting changes). */
export interface Derived {
  machine: PmsmParams;
  ctl: PmsmCurrentController;
  omegaMech: number;
  omegaE: number;
  vMax: number;
  idRef: number;
  iqRef: number;
  /** Region of the automatic set-point, or 'manual'. */
  region: PmsmRegion | 'manual';
  /** Simulated seconds per real second (≤ 1). */
  k: number;
  baseRpm: number;
}

/**
 * Slow-motion factor k = f_display / fₑ (fₑ = p·n/60): simulated seconds per
 * real second, so that one electrical revolution lasts 1/f_display real seconds.
 * Capped at 1 (never faster than real time).
 */
export function timeScale(speedRpm: number, p: number): number {
  const fe = (p * Math.abs(speedRpm)) / 60;
  return fe > DISPLAY_ELECTRICAL_HZ ? DISPLAY_ELECTRICAL_HZ / fe : 1;
}

/** Current set-points for the settings: automatic (MTPA + field weakening) or manual. */
export function setpoint(
  s: Settings,
  machine: PmsmParams,
  vMax: number,
): { id: number; iq: number; region: PmsmRegion | 'manual' } {
  if (!s.auto) {
    return { id: s.idRef, iq: s.mode === 'motor' ? s.iqRef : -s.iqRef, region: 'manual' };
  }
  const iAmp = Math.min(s.iRef, s.iMax);
  if (iAmp <= 0) return { id: 0, iq: 0, region: 'mtpa' };
  const r = pmsmMaxTorque(rpmToRad(s.speedRpm), machine, iAmp, vMax, s.mode);
  return { id: r.id, iq: r.iq, region: r.region };
}

export function derive(s: Settings): Derived {
  const machine = PRESETS[s.preset].machine;
  const vMax = pmsmVoltageLimit(s.vdc);
  const omegaMech = rpmToRad(s.speedRpm);
  const sp = setpoint(s, machine, vMax);
  return {
    machine,
    ctl: pmsmCurrentControllerGains(machine, CURRENT_BANDWIDTH),
    omegaMech,
    omegaE: machine.p * omegaMech,
    vMax,
    idRef: sp.id,
    iqRef: sp.iq,
    region: sp.region,
    k: timeScale(s.speedRpm, machine.p),
    baseRpm: radToRpm(pmsmBaseSpeed(machine, s.iMax, vMax)),
  };
}

/** Simulation state. */
export interface SimState {
  /** Simulated time [s]. */
  t: number;
  /** Electrical angle θₑ [rad], accumulated (not wrapped). */
  thetaE: number;
  dyn: PmsmDynState;
}

/** Start in the steady state of the set-point (no start-up transient). */
export function initialState(d: Derived): SimState {
  return { t: 0, thetaE: 0, dyn: pmsmSteadyDynState(d.idRef, d.iqRef, d.machine, d.ctl) };
}

/** Advance by one physics step `dtReal` (default 1/240 s) of animation time. */
export function step(s: SimState, d: Derived, dtReal: number = PHYSICS_DT): SimState {
  const h = d.k * dtReal;
  const dyn = pmsmDynamicsStep(
    s.dyn,
    { idRef: d.idRef, iqRef: d.iqRef, omegaE: d.omegaE, vMax: d.vMax },
    d.machine,
    d.ctl,
    h,
  );
  return { t: s.t + h, thetaE: s.thetaE + d.omegaE * h, dyn };
}

/** Instantaneous quantities shown in readouts, formulas, plots and scene. */
export interface Instant {
  id: number;
  iq: number;
  vd: number;
  vq: number;
  vMag: number;
  iMag: number;
  vRatio: number;
  saturated: boolean;
  torque: number;
  pMech: number;
  pElec: number;
  pCu: number;
  eta: number;
  ia: number;
  ib: number;
  ic: number;
  va: number;
  /** Angle of the stator current vector in the stationary frame [rad] (θₑ + ∠(i_d, i_q)). */
  currentAngle: number;
}

export function instant(s: SimState, d: Derived): Instant {
  const { id, iq } = s.dyn;
  const v = pmsmControllerVoltages(
    s.dyn,
    { idRef: d.idRef, iqRef: d.iqRef, omegaE: d.omegaE, vMax: d.vMax },
    d.machine,
    d.ctl,
  );
  const torque = pmsmTorque(id, iq, d.machine);
  const pMech = torque * d.omegaMech;
  const pElec = pmsmElectricalPower(v.vd, v.vq, id, iq);
  const pCu = pmsmCopperLoss(id, iq, d.machine.Rs);
  const abc = dqToAbc(id, iq, s.thetaE);
  const vabc = dqToAbc(v.vd, v.vq, s.thetaE);
  const vMag = Math.hypot(v.vd, v.vq);
  return {
    id,
    iq,
    vd: v.vd,
    vq: v.vq,
    vMag,
    iMag: Math.hypot(id, iq),
    vRatio: vMag / d.vMax,
    saturated: v.saturated,
    torque,
    pMech,
    pElec,
    pCu,
    eta: pmsmEfficiency(pElec, pMech),
    ia: abc.a,
    ib: abc.b,
    ic: abc.c,
    va: vabc.a,
    currentAngle: s.thetaE + Math.atan2(iq, id),
  };
}

// ---------------------------------------------------------------------------
// Curves of the d-q plane and of the torque–speed map
// ---------------------------------------------------------------------------

export type Pt = [number, number];

/** Current-limit circle √(i_d² + i_q²) = I_max. */
export function currentCircle(iMax: number, n = 96): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const g = (2 * Math.PI * k) / n;
    out.push([iMax * Math.cos(g), iMax * Math.sin(g)]);
  }
  return out;
}

/**
 * Steady-state voltage-limit ellipse |v(i_d, i_q, ωₑ)| = V_max in the current
 * plane: i = A⁻¹(V_max·(cos t, sin t) − b), A = [[Rₛ, −ωₑL_q], [ωₑL_d, Rₛ]],
 * b = (0, ωₑψₘ). Empty when ωₑ = Rₛ = 0 (no limit).
 */
export function voltageEllipse(m: PmsmParams, omegaE: number, vMax: number, n = 120): Pt[] {
  const det = m.Rs * m.Rs + omegaE * omegaE * m.Ld * m.Lq;
  if (!(det > 0)) return [];
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n;
    const x = vMax * Math.cos(t);
    const y = vMax * Math.sin(t) - omegaE * m.psiM;
    out.push([(m.Rs * x + omegaE * m.Lq * y) / det, (-omegaE * m.Ld * x + m.Rs * y) / det]);
  }
  return out;
}

/** MTPA trajectory from 0 to iTo, motor (i_q ≥ 0) and generator (i_q ≤ 0) branches. */
export function mtpaCurve(m: PmsmParams, iTo: number, n = 40): { motor: Pt[]; generator: Pt[] } {
  const motor: Pt[] = [];
  const generator: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const r = pmsmMtpa((iTo * k) / n, m, 'motor');
    motor.push([r.id, r.iq]);
    generator.push([r.id, -r.iq]);
  }
  return { motor, generator };
}

/**
 * Constant-torque curve T(i_d, i_q) = T through the d-q plane:
 * i_q = T / [(3/2) p (ψₘ + (L_d − L_q) i_d)], for i_d in [idMin, idMax]
 * (points where the denominator changes sign or vanishes are skipped).
 */
export function torqueCurve(
  m: PmsmParams,
  torque: number,
  idMin: number,
  idMax: number,
  n = 80,
): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const id = idMin + ((idMax - idMin) * k) / n;
    const den = 1.5 * m.p * (m.psiM + (m.Ld - m.Lq) * id);
    if (den > 1e-9) out.push([id, torque / den]);
  }
  return out;
}

/** Torque–speed map in display units (giri/min, N·m, kW). */
export interface MapData {
  rpm: number[];
  tMotor: number[];
  tGen: number[];
  pMotorKw: number[];
  pGenKw: number[];
  baseRpm: number;
}

export function torqueSpeedMap(m: PmsmParams, iMax: number, vMax: number): MapData {
  const env = pmsmTorqueSpeedEnvelope(m, iMax, vMax, rpmToRad(MAP_RPM_MAX), MAP_SAMPLES);
  return {
    rpm: env.points.map((q) => radToRpm(q.omegaMech)),
    tMotor: env.points.map((q) => q.tMotor),
    tGen: env.points.map((q) => q.tGen),
    pMotorKw: env.points.map((q) => q.pMotor / 1e3),
    pGenKw: env.points.map((q) => q.pGen / 1e3),
    baseRpm: radToRpm(env.baseSpeed),
  };
}

/**
 * Map columns plus an "operating point" series: three extra x samples at
 * n ± δ carry the operating value (a short thick mark), all other samples NaN.
 * Envelope values at the inserted x are linearly interpolated.
 */
export function withOperatingPoint(
  xs: readonly number[],
  cols: readonly (readonly number[])[],
  xOp: number,
  yOp: number,
  delta: number,
): { xs: number[]; cols: number[][]; op: number[] } {
  const interp = (col: readonly number[], x: number): number => {
    for (let k = 1; k < xs.length; k++) {
      const x0 = xs[k - 1] as number;
      const x1 = xs[k] as number;
      if (x <= x1) {
        const a = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
        return (col[k - 1] as number) + a * ((col[k] as number) - (col[k - 1] as number));
      }
    }
    return col[col.length - 1] as number;
  };
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 0;
  const extra = [xOp - delta, xOp, xOp + delta].map((x) => Math.min(xMax, Math.max(xMin, x)));
  const grid = xs.filter(
    (x) => !extra.some((e) => Math.abs(e - x) <= 1e-9 * Math.max(1, Math.abs(x))),
  );
  const all = [...grid.map((x) => ({ x, op: false })), ...extra.map((x) => ({ x, op: true }))].sort(
    (a, b) => a.x - b.x || Number(a.op) - Number(b.op),
  );
  const outXs = all.map((e) => e.x);
  const outCols = cols.map((col) => outXs.map((x) => interp(col, x)));
  const op = all.map((e) => (e.op ? yOp : Number.NaN));
  return { xs: outXs, cols: outCols, op };
}
