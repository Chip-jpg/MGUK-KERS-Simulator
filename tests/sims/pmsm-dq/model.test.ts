import { describe, expect, it } from 'vitest';
import {
  pmsmMaxTorque,
  pmsmMtpa,
  pmsmOperatingPoint,
  pmsmTorque,
  pmsmVoltages,
  rotatingLoop,
} from '../../../src/physics';
import {
  DISPLAY_ELECTRICAL_HZ,
  MAP_SAMPLES,
  PRESETS,
  currentCircle,
  defaultSettings,
  derive,
  initialState,
  instant,
  mtpaCurve,
  params,
  radToRpm,
  rpmToRad,
  setpoint,
  step,
  timeScale,
  torqueCurve,
  torqueSpeedMap,
  voltageEllipse,
  withOperatingPoint,
  type Settings,
} from '../../../src/sims/pmsm-dq/model';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...o });

describe('pmsm-dq model', () => {
  it('params satisfy min ≤ default ≤ max and step divides the range', () => {
    for (const [k, p] of Object.entries(params)) {
      expect(p.min, k).toBeLessThanOrEqual(p.default);
      expect(p.default, k).toBeLessThanOrEqual(p.max);
      const n = (p.max - p.min) / p.step;
      expect(Math.abs(n - Math.round(n)), k).toBeLessThan(1e-9);
    }
  });

  it('rpm conversions and slow-motion factor', () => {
    expect(rpmToRad(60)).toBeCloseTo(2 * Math.PI, 12);
    expect(radToRpm(rpmToRad(4321))).toBeCloseTo(4321, 9);
    // 4000 giri/min, p = 4 → fₑ = 266,7 Hz → k = 0,75/266,7
    expect(timeScale(4000, 4)).toBeCloseTo(DISPLAY_ELECTRICAL_HZ / ((4 * 4000) / 60), 12);
    expect(timeScale(5, 1)).toBe(1); // never faster than real time
  });

  it('automatic set-point = maximum torque at |I| = min(I_ref, I_max), signed by the mode', () => {
    const d = derive(settings());
    const m = PRESETS.ipm.machine;
    const r = pmsmMaxTorque(rpmToRad(4000), m, 300, d.vMax);
    expect(d.idRef).toBeCloseTo(r.id, 12);
    expect(d.iqRef).toBeCloseTo(r.iq, 12);
    expect(d.region).toBe('mtpa');
    const mt = pmsmMtpa(300, m);
    expect(d.idRef).toBeCloseTo(mt.id, 9);
    const g = derive(settings({ mode: 'generator' }));
    expect(g.iqRef).toBeLessThan(0);
    expect(pmsmTorque(g.idRef, g.iqRef, m)).toBeLessThan(0);
    // I_ref above I_max is clamped
    const c = derive(settings({ iRef: 500, iMax: 200 }));
    expect(Math.hypot(c.idRef, c.iqRef)).toBeCloseTo(200, 6);
    expect(setpoint(settings({ iRef: 0 }), m, d.vMax)).toEqual({ id: 0, iq: 0, region: 'mtpa' });
    // SPM preset: MTPA → i_d = 0 at low speed
    const spm = derive(settings({ preset: 'spm', speedRpm: 1000 }));
    expect(spm.idRef).toBe(0);
  });

  it('field weakening at high speed; manual set-points pass through', () => {
    const d = derive(settings({ speedRpm: 12000 }));
    expect(d.region).toBe('field-weakening');
    expect(d.idRef).toBeLessThan(-200);
    expect(d.baseRpm).toBeGreaterThan(5000);
    const man = derive(settings({ auto: false, idRef: -50, iqRef: 120, mode: 'generator' }));
    expect(man.region).toBe('manual');
    expect(man.idRef).toBe(-50);
    expect(man.iqRef).toBe(-120);
  });

  it('starts in steady state: readouts satisfy the power balance and the torque formula', () => {
    for (const mode of ['motor', 'generator'] as const) {
      const d = derive(settings({ mode }));
      let s = initialState(d);
      for (let k = 0; k < 240; k++) s = step(s, d);
      const q = instant(s, d);
      expect(q.id).toBeCloseTo(d.idRef, 6);
      expect(q.iq).toBeCloseTo(d.iqRef, 6);
      const op = pmsmOperatingPoint(q.id, q.iq, d.omegaMech, d.machine);
      expect(q.torque).toBeCloseTo(op.torque, 9);
      expect(Math.abs(q.pElec - q.pMech - q.pCu) / Math.abs(q.pMech)).toBeLessThan(1e-6);
      expect(q.vRatio).toBeLessThan(1);
      expect(q.saturated).toBe(false);
      expect(q.eta).toBeGreaterThan(0.9);
      expect(Math.sign(q.pMech)).toBe(mode === 'motor' ? 1 : -1);
      // phase currents: balanced, amplitude |i|
      expect(Math.abs(q.ia + q.ib + q.ic)).toBeLessThan(1e-9);
      expect(Math.max(Math.abs(q.ia), Math.abs(q.ib), Math.abs(q.ic))).toBeLessThanOrEqual(
        q.iMag + 1e-9,
      );
    }
  });

  it('one physics step advances simulated time by k·dt and θₑ by ωₑ·k·dt; transient after a set-point change', () => {
    const d = derive(settings());
    const s0 = initialState(d);
    const s1 = step(s0, d);
    expect(s1.t).toBeCloseTo(d.k / 240, 15);
    expect(s1.thetaE).toBeCloseTo((d.omegaE * d.k) / 240, 12);
    // one electrical turn per 1/f_display real seconds
    let s = s0;
    for (let k = 0; k < Math.round(240 / DISPLAY_ELECTRICAL_HZ); k++) s = step(s, d);
    expect(s.thetaE / (2 * Math.PI)).toBeCloseTo(1, 6);
    // raise the current: the controller tracks it with a first-order transient
    const d2 = derive(settings({ iRef: 400 }));
    let t = step(s, d2);
    expect(t.dyn.iq).toBeLessThan(d2.iqRef);
    for (let k = 0; k < 2400; k++) t = step(t, d2);
    expect(t.dyn.iq).toBeCloseTo(d2.iqRef, 3);
  });

  it('unreachable manual set-point saturates the inverter voltage', () => {
    const d = derive(settings({ auto: false, idRef: 0, iqRef: 400, speedRpm: 15000 }));
    let s = initialState(d);
    for (let k = 0; k < 600; k++) s = step(s, d);
    const q = instant(s, d);
    expect(q.saturated).toBe(true);
    expect(q.vRatio).toBeCloseTo(1, 9);
  });

  it('d-q plane curves', () => {
    const c = currentCircle(400, 8);
    expect(c).toHaveLength(9);
    for (const [x, y] of c) expect(Math.hypot(x, y)).toBeCloseTo(400, 9);
    const m = PRESETS.ipm.machine;
    const w = rpmToRad(8000) * m.p;
    const vMax = derive(settings()).vMax;
    for (const [id, iq] of voltageEllipse(m, w, vMax, 24)) {
      const v = pmsmVoltages(id, iq, w, m);
      expect(Math.hypot(v.vd, v.vq)).toBeCloseTo(vMax, 6);
    }
    expect(voltageEllipse({ ...m, Rs: 0 }, 0, vMax)).toEqual([]);
    const mt = mtpaCurve(m, 400, 10);
    expect(mt.motor[0]).toEqual([0, 0]);
    const last = mt.motor[10] as [number, number];
    expect(last[1]).toBeGreaterThan(0);
    expect((mt.generator[10] as [number, number])[1]).toBeCloseTo(-last[1], 12);
    for (const [id, iq] of torqueCurve(m, 150, -500, 300, 20)) {
      expect(pmsmTorque(id, iq, m)).toBeCloseTo(150, 6);
    }
    // denominator ≤ 0 for i_d > ψ/(Lq − Ld) ≈ 533 A: points skipped
    expect(torqueCurve(m, 10, 0, 1000, 10).length).toBeLessThan(11);
  });

  it('torque–speed map in display units, consistent with physics', () => {
    const d = derive(settings());
    const map = torqueSpeedMap(d.machine, 400, d.vMax);
    expect(map.rpm).toHaveLength(MAP_SAMPLES);
    expect(map.rpm[MAP_SAMPLES - 1]).toBeCloseTo(params.speedRpm.max, 6);
    expect(map.baseRpm).toBeCloseTo(d.baseRpm, 6);
    map.rpm.forEach((n, k) => {
      expect(map.pMotorKw[k]).toBeCloseTo(((map.tMotor[k] as number) * rpmToRad(n)) / 1e3, 6);
      expect(map.tGen[k]).toBeLessThanOrEqual(0);
    });
  });

  it('operating-point mark: three samples at n ± δ, envelope interpolated, grid duplicates removed', () => {
    const r = withOperatingPoint([0, 1000, 2000, 3000], [[0, 10, 20, 30]], 2000, 7, 500);
    expect(r.xs).toEqual([0, 1000, 1500, 2000, 2500, 3000]);
    expect(r.cols[0]).toEqual([0, 10, 15, 20, 25, 30]);
    expect(r.op.map((v) => (Number.isNaN(v) ? null : v))).toEqual([null, null, 7, 7, 7, null]);
    const edge = withOperatingPoint([0, 1000], [[0, 10]], 1000, 3, 500);
    expect(edge.xs).toEqual([0, 500, 1000, 1000]);
    expect(edge.cols[0]?.[3]).toBe(10);
  });

  it('link to slides 18–19: no-load phase-voltage amplitude ωₑψₘ = NBSω with ψₘ = NBS', () => {
    const d = derive(settings({ auto: true, iRef: 0 }));
    const s = initialState(d);
    const q = instant(s, d);
    expect(q.vMag).toBeCloseTo(d.omegaE * d.machine.psiM, 9);
    // the same number from the single-loop alternator formula with N·B·S = ψₘ
    expect(q.vMag).toBeCloseTo(rotatingLoop(1, d.machine.psiM, 1, d.omegaE, 0).V0, 9);
  });
});
