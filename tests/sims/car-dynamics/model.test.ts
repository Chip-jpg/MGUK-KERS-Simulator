import { describe, expect, it } from 'vitest';
import { formatIT } from '../../../src/core/format';
import { parseNumberIT, snapToSpec, stepDigits } from '../../../src/ui/slider';
import {
  kersBrakingEvent,
  kmhToMs,
  pacejkaFx,
  simulateBrakingZone,
  PACEJKA_ILLUSTRATIVE,
} from '../../../src/physics';
import {
  FIXED,
  PARAM_KEYS,
  PEAK_SLIP,
  PRESETS,
  defaultParams,
  energiesOf,
  idealBalancePercent,
  pacejkaCurve,
  params,
  roundTo,
  sampleAt,
  speedDistance,
  summarize,
  toSI,
  withPoints,
} from '../../../src/sims/car-dynamics/model';
import { PRESETS as KERS_PRESETS } from '../../../src/sims/kers-braking/model';
import {
  ARROW_F_REF,
  ARROW_K,
  ARROW_LEGEND,
  ARROW_MAX,
  arrowLength,
} from '../../../src/sims/car-dynamics/forces';

describe('car-dynamics parameters', () => {
  it('schema is complete and defaults lie inside the ranges', () => {
    expect(Object.keys(params).sort()).toEqual([...PARAM_KEYS].sort());
    for (const k of PARAM_KEYS) {
      const s = params[k];
      expect(s.min).toBeLessThan(s.max);
      expect(s.default).toBeGreaterThanOrEqual(s.min);
      expect(s.default).toBeLessThanOrEqual(s.max);
      expect(s.labelIT.length).toBeGreaterThan(3);
      // no ASCII pseudo-notation in UI labels (QA-016)
      expect(s.labelIT).not.toMatch(/[A-Za-z]_[A-Za-z0-9{(]|\^/);
      expect(s.labelIT).not.toContain("'");
    }
  });

  it('η slider stays in a meaningful range: the MGU-K never swallows the whole rear axle (QA-029)', () => {
    expect(params.eta.min).toBe(0.5);
    expect(params.eta.max).toBe(1);
    const z = summarize({ ...defaultParams(), eta: params.eta.min }, true).zone;
    expect(z.eStored).toBeGreaterThan(0);
    expect(z.eStored).toBeGreaterThanOrEqual(z.eMgukLoss); // η ≥ 0,5
    expect(z.eStored).toBeLessThanOrEqual(120e3 * z.tBrake * (1 + 1e-9));
    expect(z.eBrakes).toBeGreaterThan(z.eMguk); // the friction brakes still do most of the work
  });

  it('Italian number round-trip of every slider value (QA-001)', () => {
    for (const [key, spec] of Object.entries(params)) {
      const digits = stepDigits(spec.step);
      for (let v = spec.min; v <= spec.max + 1e-9; v += spec.step) {
        const x = snapToSpec(v, spec);
        expect(parseNumberIT(formatIT(x, digits)), `${key} ${x}`).toBe(x);
      }
    }
  });

  it('converts display units to SI and switches the aero off', () => {
    const p = defaultParams();
    const si = toSI(p, true);
    expect(si.v1).toBeCloseTo(kmhToMs(300), 12);
    expect(si.v2).toBeCloseTo(kmhToMs(100), 12);
    expect(si.Pmax).toBe(120e3);
    expect(si.brakeBalance).toBeCloseTo(0.58, 12);
    expect(si.CdA).toBe(1.2);
    expect(si.ClA).toBe(3.5);
    expect(si.h).toBe(FIXED.h);
    const off = toSI(p, false);
    expect(off.CdA).toBe(0);
    expect(off.ClA).toBe(0);
    // v₂ ≥ v₁ is clamped (no braking)
    expect(toSI({ ...p, v2: 320 }, true).v2).toBe(si.v1);
  });

  it('presets reuse the sourced kers-braking values (120 / 350 kW)', () => {
    expect(PRESETS.map((p) => p.Pmax)).toEqual([120, 350]);
    expect(PRESETS.map((p) => p.Pmax)).toEqual(KERS_PRESETS.map((p) => p.values.Pmax));
    for (const p of PRESETS) {
      expect(p.sources.length).toBeGreaterThan(0);
      for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });

  it('ideal balance and peak slip of the illustrative tyre', () => {
    expect(idealBalancePercent(1.6)).toBeCloseTo(100 * (0.45 + (1.6 * 0.3) / 3.6), 9);
    expect(PEAK_SLIP).toBeGreaterThan(0.1);
    expect(PEAK_SLIP).toBeLessThan(0.11);
    expect(FIXED.tyre).toEqual(PACEJKA_ILLUSTRATIVE);
  });
});

describe('car-dynamics summary', () => {
  it('default zone: energy balance, battery ≤ P_max·t, comparison with kers-braking', () => {
    const s = summarize(defaultParams(), true);
    const z = s.zone;
    expect(s.notBraking).toBe(false);
    expect(z.dEk / 1e6).toBeCloseTo(2.469, 3);
    expect(Math.abs(z.balanceError)).toBeLessThan(1e-6);
    expect(z.eStored + z.eMgukLoss + z.eBrakesFront + z.eBrakesRear + z.eAero).toBeCloseTo(
      z.dEk,
      0,
    );
    expect(z.eStored).toBeLessThanOrEqual(120e3 * z.tBrake * (1 + 1e-9));
    // displayed values (rounded as in the UI)
    expect(roundTo(z.tBrake, 2)).toBe(1.83);
    expect(roundTo(z.distance, 0)).toBe(93);
    expect(roundTo(z.eStored / 1e6, 2)).toBe(0.22);
    expect(roundTo(z.eBrakes / 1e6, 2)).toBe(1.99);
    expect(roundTo(z.eAero / 1e6, 2)).toBe(0.23);
    // comparison: kersBrakingEvent with the same v₁, v₂, t
    const c = s.compare;
    expect(c).not.toBeNull();
    const k = kersBrakingEvent({
      m: 800,
      v1: kmhToMs(300),
      v2: kmhToMs(100),
      Pmax: 120e3,
      eta: 0.9,
      tBrake: z.tBrake,
    });
    expect(c?.result.recovered).toBeCloseTo(k.recovered, 6);
    expect(c?.distance).toBeCloseTo(((kmhToMs(300) + kmhToMs(100)) / 2) * z.tBrake, 9);
    expect((c?.brakes ?? 0) + (c?.mgukLoss ?? 0)).toBeCloseTo(k.dissipated, 6);
    // 120 kW: the MGU-K is power-limited all the time ⇒ same stored energy as kers-braking
    expect(z.eStored).toBeCloseTo(c?.result.recovered ?? 0, 0);
    expect(s.peakTotal).toBeGreaterThan(s.peakBrakesFront);
  });

  it('2026 preset: rear-axle limit makes the dynamic model recover less', () => {
    const s = summarize({ ...defaultParams(), Pmax: 350 }, true);
    expect(roundTo(s.zone.eStored / 1e6, 2)).toBe(0.55);
    expect(roundTo(s.compare?.result.recovered ?? 0, -4) / 1e6).toBeCloseTo(0.64, 2);
    expect(s.zone.eStored).toBeLessThan(s.compare?.result.recovered ?? 0);
  });

  it('aero off: longer and slower braking, no aero energy', () => {
    const on = summarize(defaultParams(), true);
    const off = summarize(defaultParams(), false);
    expect(off.zone.eAero).toBe(0);
    expect(off.zone.distance).toBeGreaterThan(on.zone.distance * 1.5);
    expect(roundTo(off.zone.tBrake, 2)).toBe(3.56);
    expect(Math.round(off.zone.distance)).toBe(198);
  });

  it('v₂ ≥ v₁ is not a braking zone', () => {
    const s = summarize({ ...defaultParams(), v1: 150, v2: 200 }, true);
    expect(s.notBraking).toBe(true);
    expect(s.compare).toBeNull();
    expect(s.zone.dEk).toBe(0);
    expect(s.zone.tBrake).toBe(0);
    const sd = speedDistance(s);
    expect(sd.x).toEqual([0]);
  });

  it('matches simulateBrakingZone directly for random UI values', () => {
    for (const [v1, v2, Pmax, bal] of [
      [250, 80, 200, 55],
      [340, 0, 0, 70],
      [180, 120, 500, 40],
    ] as const) {
      const p = { ...defaultParams(), v1, v2, Pmax, balance: bal };
      const s = summarize(p, true);
      const z = simulateBrakingZone(toSI(p, true));
      expect(s.zone.tBrake).toBe(z.tBrake);
      expect(s.zone.eStored).toBe(z.eStored);
    }
  });
});

describe('car-dynamics playback and plots', () => {
  it('sampleAt interpolates the trace and clamps to [0, t_brake]', () => {
    const s = summarize(defaultParams(), true);
    const z = s.zone;
    expect(sampleAt(z, -1)).toBe(z.trace[0]);
    expect(sampleAt(z, 99)).toBe(z.trace[z.trace.length - 1]);
    const a = z.trace[10];
    const b = z.trace[11];
    if (!a || !b) throw new Error('short trace');
    const mid = sampleAt(z, 0.5 * (a.t + b.t));
    expect(mid.v).toBeCloseTo(0.5 * (a.v + b.v), 9);
    expect(mid.eMguk).toBeCloseTo(0.5 * (a.eMguk + b.eMguk), 6);
    expect(mid.limit).toBe(a.limit);
    // monotone speed and distance
    let prev = sampleAt(z, 0);
    for (let t = 0.05; t < z.tBrake; t += 0.05) {
      const cur = sampleAt(z, t);
      expect(cur.v).toBeLessThan(prev.v);
      expect(cur.x).toBeGreaterThan(prev.x);
      prev = cur;
    }
    const e = energiesOf(z.trace[z.trace.length - 1] ?? a, 0.9, 800, s.si.v1);
    expect(e.released).toBeCloseTo(z.dEk, 3);
    expect(e.stored + e.mgukLoss + e.brakesFront + e.brakesRear + e.aero).toBeCloseTo(z.dEk, 0);
    const single = summarize({ ...defaultParams(), v2: 300 }, true);
    expect(sampleAt(single.zone, 1)).toBe(single.zone.trace[0]);
  });

  it('Pacejka curve and operating points', () => {
    const c = pacejkaCurve(1.6);
    expect(c.k[0]).toBe(0);
    expect(c.k[c.k.length - 1]).toBe(40);
    expect(Math.max(...c.mu)).toBeLessThanOrEqual(1.6 + 1e-12);
    expect(Math.max(...c.mu)).toBeGreaterThan(1.59);
    const kStar = PEAK_SLIP * 100;
    const w = withPoints(c.k, c.mu, [{ x: kStar, y: 1.6 }], 0.4);
    expect(w.xs.length).toBe(w.curve.length);
    expect(w.cols[0]?.length).toBe(w.xs.length);
    const iStar = w.xs.indexOf(kStar);
    expect(w.cols[0]?.[iStar]).toBe(1.6);
    expect(w.curve[iStar]).toBeCloseTo(pacejkaFx(PEAK_SLIP, 1, { ...FIXED.tyre, D: 1.6 }), 3);
    expect(w.cols[0]?.filter((v) => Number.isFinite(v)).length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < w.xs.length; i++) {
      expect(w.xs[i] as number).toBeGreaterThan(w.xs[i - 1] as number);
    }
    // a point beyond the curve end is clamped
    const end = withPoints(c.k, c.mu, [{ x: 45, y: 1 }], 0.4);
    expect(end.xs[end.xs.length - 1]).toBe(40);
  });

  it('speed–distance curves start at v₁ and end at v₂', () => {
    const s = summarize(defaultParams(), false);
    const sd = speedDistance(s);
    expect(sd.v[0]).toBeCloseTo(300, 9);
    expect(sd.v[sd.v.length - 1]).toBeCloseTo(100, 9);
    expect(sd.vConst[0]).toBeCloseTo(300, 9);
    // without aero and with β < β_ideal the deceleration is constant: same distance
    expect(s.compare?.distance).toBeCloseTo(s.zone.distance, 3);
    const aero = speedDistance(summarize(defaultParams(), true));
    // with aero the constant-deceleration model needs more distance in the same time
    expect(aero.x[aero.x.length - 1]).toBeGreaterThan(93);
    expect(aero.vConst[aero.vConst.length - 1]).toBeCloseTo(100, 6);
  });

  it('arrow lengths follow the stated log scale and are capped', () => {
    expect(arrowLength(ARROW_F_REF * 9)).toBeCloseTo(ARROW_K, 12);
    expect(arrowLength(1000)).toBeCloseTo(0.27, 2);
    expect(arrowLength(10e3)).toBeCloseTo(0.94, 2);
    expect(arrowLength(40e3)).toBeCloseTo(1.45, 2);
    expect(arrowLength(20e3)).toBeGreaterThan(arrowLength(10e3));
    expect(ARROW_LEGEND.map((l) => l.f)).toEqual([1e3, 10e3, 40e3]);
    expect(arrowLength(0)).toBe(0);
    expect(arrowLength(-5)).toBe(0);
    expect(arrowLength(1e7)).toBe(ARROW_MAX);
  });
});
