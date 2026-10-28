import { describe, expect, it } from 'vitest';
import {
  AIR_DENSITY_STD,
  G_STANDARD,
  PACEJKA_ILLUSTRATIVE,
  PHYSICS_DT,
  aeroDownforce,
  aeroDrag,
  carBrakingForces,
  carBrakingStep,
  idealBrakeBalance,
  kersBrakingEvent,
  kmhToMs,
  pacejkaFx,
  pacejkaPeakSlip,
  pacejkaSlipForRatio,
  simulateBrakingZone,
} from '../../src/physics';
import type { CarBrakingParams, CarBrakingState, PacejkaCoeffs } from '../../src/physics';
import { mulberry32, trapz, uniform } from './prng';

/** Illustrative car of the `car-dynamics` simulator (not a real F1 car). */
const base: CarBrakingParams = {
  m: 800,
  v1: kmhToMs(300),
  v2: kmhToMs(100),
  Pmax: 120e3,
  eta: 0.9,
  CdA: 1.2,
  ClA: 3.5,
  rho: AIR_DENSITY_STD,
  mu: 1.6,
  brakeBalance: 0.58,
  h: 0.3,
  L: 3.6,
};

const tyre: PacejkaCoeffs = { ...PACEJKA_ILLUSTRATIVE, D: 1.6 };

describe('Pacejka magic formula', () => {
  it('peaks at κ* with Fx = μ·F_z and is odd in κ', () => {
    const ks = pacejkaPeakSlip(PACEJKA_ILLUSTRATIVE);
    expect(ks).toBeGreaterThan(0.09);
    expect(ks).toBeLessThan(0.12);
    const Fz = 5000;
    expect(pacejkaFx(ks, Fz, tyre)).toBeCloseTo(1.6 * Fz, 6);
    for (const k of [0.3, 0.6, 0.9, 1.1, 1.5, 3]) {
      expect(pacejkaFx(ks * k, Fz, tyre)).toBeLessThan(1.6 * Fz);
    }
    // rising before the peak, falling after it
    expect(pacejkaFx(ks * 0.9, Fz, tyre)).toBeGreaterThan(pacejkaFx(ks * 0.5, Fz, tyre));
    expect(pacejkaFx(ks * 2, Fz, tyre)).toBeLessThan(pacejkaFx(ks * 1.2, Fz, tyre));
    for (const k of [0.01, 0.05, ks, 0.3]) {
      expect(pacejkaFx(-k, Fz, tyre)).toBeCloseTo(-pacejkaFx(k, Fz, tyre), 9);
    }
    expect(Object.is(pacejkaFx(0, Fz, tyre), 0)).toBe(true);
    expect(pacejkaFx(0.05, 0, tyre)).toBe(0);
    // linear in F_z and in D
    expect(pacejkaFx(0.05, 2 * Fz, tyre)).toBeCloseTo(2 * pacejkaFx(0.05, Fz, tyre), 9);
  });

  it('E = 0: closed-form peak κ* = tan(π/2C)/B', () => {
    const c = { B: 10, C: 1.9, E: 0 };
    expect(pacejkaPeakSlip(c)).toBeCloseTo(Math.tan(Math.PI / 3.8) / 10, 12);
    expect(pacejkaPeakSlip({ B: 10, C: 2, E: 0 })).toBeCloseTo(0.1, 12);
  });

  it('slip for a force ratio inverts the formula on the stable branch', () => {
    const ks = pacejkaPeakSlip(PACEJKA_ILLUSTRATIVE);
    expect(pacejkaSlipForRatio(1, PACEJKA_ILLUSTRATIVE)).toBeCloseTo(ks, 12);
    expect(Object.is(pacejkaSlipForRatio(0, PACEJKA_ILLUSTRATIVE), 0)).toBe(true);
    for (const r of [0.1, 0.4, 0.75, 0.99]) {
      const k = pacejkaSlipForRatio(r, PACEJKA_ILLUSTRATIVE);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(ks);
      expect(pacejkaFx(k, 1000, tyre) / (1000 * 1.6)).toBeCloseTo(r, 10);
      expect(pacejkaSlipForRatio(-r, PACEJKA_ILLUSTRATIVE)).toBeCloseTo(-k, 12);
    }
  });

  it('rejects invalid coefficients and inputs', () => {
    expect(() => pacejkaFx(Number.NaN, 1, tyre)).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, -1, tyre)).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, B: 0 })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, C: 1 })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, C: 2.1 })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, C: Number.NaN })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, D: 0 })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, E: 1 })).toThrow(RangeError);
    expect(() => pacejkaFx(0.1, 1, { ...tyre, E: Number.NaN })).toThrow(RangeError);
    expect(() => pacejkaPeakSlip({ B: 10, C: 0.9, E: 0 })).toThrow(RangeError);
    expect(() => pacejkaSlipForRatio(1.01, PACEJKA_ILLUSTRATIVE)).toThrow(RangeError);
    expect(() => pacejkaSlipForRatio(Number.NaN, PACEJKA_ILLUSTRATIVE)).toThrow(RangeError);
  });
});

describe('aerodynamics', () => {
  it('drag and downforce are ½ρ(C·A)v², even in v', () => {
    expect(aeroDrag(10, 1.2, 2)).toBeCloseTo(120, 12);
    expect(aeroDownforce(10, 1.2, 3)).toBeCloseTo(180, 12);
    expect(aeroDrag(-10, 1.2, 2)).toBe(aeroDrag(10, 1.2, 2));
    expect(aeroDownforce(-10, 1.2, 3)).toBe(aeroDownforce(10, 1.2, 3));
    expect(aeroDrag(20, 1.2, 2)).toBeCloseTo(4 * aeroDrag(10, 1.2, 2), 9);
    expect(aeroDrag(50, 0, 2)).toBe(0);
    expect(aeroDownforce(50, 1.2, 0)).toBe(0);
  });

  it('rejects invalid inputs', () => {
    expect(() => aeroDrag(Number.POSITIVE_INFINITY, 1, 1)).toThrow(RangeError);
    expect(() => aeroDrag(1, -1, 1)).toThrow(RangeError);
    expect(() => aeroDrag(1, 1, -1)).toThrow(RangeError);
    expect(() => aeroDownforce(Number.NaN, 1, 1)).toThrow(RangeError);
    expect(() => aeroDownforce(1, 1, -0.1)).toThrow(RangeError);
  });
});

describe('carBrakingForces', () => {
  it('loads, load transfer and per-axle forces are consistent', () => {
    const v = kmhToMs(250);
    const f = carBrakingForces(v, base);
    const q = 0.5 * base.rho * v * v;
    expect(f.drag).toBeCloseTo(q * base.CdA, 9);
    expect(f.downforce).toBeCloseTo(q * base.ClA, 9);
    expect(f.weight).toBeCloseTo(base.m * G_STANDARD, 9);
    expect(f.fzFront + f.fzRear).toBeCloseTo(f.fzTotal, 6);
    expect(f.fzFront - 0.45 * f.fzTotal).toBeCloseTo((f.fxTotal * base.h) / base.L, 6);
    expect(f.fxFront).toBeCloseTo(base.brakeBalance * f.fxTotal, 6);
    expect(f.fxFront + f.fxRear).toBeCloseTo(f.fxTotal, 6);
    expect(f.fMguk + f.fBrakesRear).toBeCloseTo(f.fxRear, 6);
    expect(f.decel).toBeCloseTo((f.fxTotal + f.drag) / base.m, 9);
    // β = 0,58 < β_ideal ≈ 0,583: the rear axle reaches its grip limit first
    expect(f.limit).toBe('rear');
    expect(f.muRear).toBeCloseTo(base.mu, 9);
    expect(f.muFront).toBeLessThan(base.mu);
    expect(f.kappaRear).toBeCloseTo(pacejkaPeakSlip(PACEJKA_ILLUSTRATIVE), 9);
    expect(f.kappaFront).toBeLessThan(f.kappaRear);
    // MGU-K: mechanical power capped at P_max/η, stored power at P_max
    expect(f.mgukLimit).toBe('power');
    expect(f.pMguk).toBeCloseTo(base.Pmax / base.eta, 6);
    expect(f.pStored).toBeCloseTo(base.Pmax, 6);
    expect(f.pMgukLoss).toBeCloseTo(f.pMguk - f.pStored, 6);
    expect(f.pBrakesFront + f.pBrakesRear + f.pMguk).toBeCloseTo(f.fxTotal * v, 4);
    expect(f.pAero).toBeCloseTo(f.drag * v, 9);
  });

  it('front-limited, ideal balance and β = 0 cases', () => {
    const front = carBrakingForces(60, { ...base, brakeBalance: 0.7 });
    expect(front.limit).toBe('front');
    expect(front.muFront).toBeCloseTo(base.mu, 9);
    const beta = idealBrakeBalance(base.mu, base.h, base.L);
    expect(beta).toBeCloseTo(0.45 + (1.6 * 0.3) / 3.6, 12);
    const ideal = carBrakingForces(60, { ...base, brakeBalance: beta });
    expect(ideal.limit).toBe('both');
    expect(ideal.fxTotal).toBeCloseTo(base.mu * ideal.fzTotal, 6);
    // the ideal balance gives the largest braking force
    for (const b of [0, 0.3, 0.5, 0.6, 0.8, 1]) {
      expect(carBrakingForces(60, { ...base, brakeBalance: b }).fxTotal).toBeLessThanOrEqual(
        ideal.fxTotal * (1 + 1e-12),
      );
    }
    const rearOnly = carBrakingForces(60, { ...base, brakeBalance: 0 });
    expect(rearOnly.fxFront).toBe(0);
    expect(rearOnly.limit).toBe('rear');
    const frontOnly = carBrakingForces(60, { ...base, brakeBalance: 1 });
    expect(frontOnly.fxRear).toBe(0);
    expect(frontOnly.fMguk).toBe(0);
    // β ≤ μh/L: the front axle can never be the limit
    expect(carBrakingForces(60, { ...base, brakeBalance: 0.1 }).limit).toBe('rear');
  });

  it('MGU-K is limited by the rear axle at low speed and switched off with P_max = 0', () => {
    const low = carBrakingForces(kmhToMs(80), { ...base, Pmax: 350e3 });
    expect(low.mgukLimit).toBe('rear-axle');
    expect(low.fMguk).toBeCloseTo(low.fxRear, 9);
    expect(low.fBrakesRear).toBe(0);
    const off = carBrakingForces(80, { ...base, Pmax: 0 });
    expect(off.mgukLimit).toBe('off');
    expect(off.fMguk).toBe(0);
    expect(off.pStored).toBe(0);
    const unlimited = carBrakingForces(80, { ...base, Pmax: Number.POSITIVE_INFINITY });
    expect(unlimited.fMguk).toBeCloseTo(unlimited.fxRear, 9);
    const eta0 = carBrakingForces(80, { ...base, eta: 0 });
    expect(eta0.fMguk).toBeCloseTo(eta0.fxRear, 9);
    expect(eta0.pStored).toBe(0);
    expect(eta0.pMgukLoss).toBeCloseTo(eta0.pMguk, 9);
    const stopped = carBrakingForces(-1, base);
    expect(stopped.v).toBe(0);
    expect(stopped.pMguk).toBe(0);
    expect(stopped.drag).toBe(0);
  });

  it('rejects invalid parameters with RangeError', () => {
    const bad: Array<Partial<CarBrakingParams>> = [
      { m: 0 },
      { Pmax: -1 },
      { Pmax: Number.NaN },
      { eta: 1.1 },
      { eta: -0.1 },
      { eta: Number.NaN },
      { CdA: -1 },
      { ClA: -1 },
      { rho: -1 },
      { mu: 0 },
      { brakeBalance: -0.1 },
      { brakeBalance: 1.1 },
      { brakeBalance: Number.NaN },
      { h: -0.1 },
      { L: 0 },
      { weightFront: 0 },
      { weightFront: 1 },
      { weightFront: Number.NaN },
      { g: 0 },
      { tyre: { B: 10, C: 3, E: 0 } },
      { h: 2 }, // μh/L ≥ 1 − w_f: rear wheels would lift
    ];
    for (const b of bad) {
      expect(() => carBrakingForces(50, { ...base, ...b }), JSON.stringify(b)).toThrow(RangeError);
      expect(() => simulateBrakingZone({ ...base, ...b }), JSON.stringify(b)).toThrow(RangeError);
    }
    expect(() => carBrakingForces(Number.NaN, base)).toThrow(RangeError);
    expect(() => idealBrakeBalance(0, 0.3, 3.6)).toThrow(RangeError);
    expect(() => idealBrakeBalance(1, -1, 3.6)).toThrow(RangeError);
    expect(() => idealBrakeBalance(1, 0.3, 0)).toThrow(RangeError);
    expect(() => idealBrakeBalance(1, 0.3, 3.6, 1)).toThrow(RangeError);
  });
});

describe('carBrakingStep', () => {
  it('advances the state with RK4 and conserves energy', () => {
    const s0: CarBrakingState = {
      t: 0,
      x: 0,
      v: 80,
      eMguk: 0,
      eBrakesFront: 0,
      eBrakesRear: 0,
      eAero: 0,
    };
    let s = s0;
    for (let k = 0; k < 120; k++) s = carBrakingStep(s, base);
    expect(s.t).toBeCloseTo(120 * PHYSICS_DT, 12);
    expect(s.v).toBeLessThan(80);
    expect(s.x).toBeGreaterThan(0);
    const dEk = 0.5 * base.m * (80 * 80 - s.v * s.v);
    const sum = s.eMguk + s.eBrakesFront + s.eBrakesRear + s.eAero;
    expect(Math.abs(dEk - sum) / dEk).toBeLessThan(1e-9);
    expect(base.eta * s.eMguk).toBeLessThanOrEqual(base.Pmax * s.t * (1 + 1e-12));
    // a stopped car stays at rest
    const rest = carBrakingStep({ ...s0, v: 0 }, base, 0.1);
    expect(rest.v).toBe(0);
    expect(rest.x).toBe(0);
    expect(() => carBrakingStep(s0, base, Number.NaN)).toThrow(RangeError);
  });
});

describe('simulateBrakingZone', () => {
  it('energy balance ΔE_k = E_MGU-K + E_brakes + E_aero within 1e-6 (random cases)', () => {
    const rnd = mulberry32(17);
    for (let i = 0; i < 25; i++) {
      const v1 = uniform(rnd, 20, 95);
      const p: CarBrakingParams = {
        ...base,
        m: uniform(rnd, 600, 1100),
        v1,
        v2: uniform(rnd, 0, v1 * 0.9),
        Pmax: uniform(rnd, 0, 500e3),
        eta: uniform(rnd, 0.5, 1),
        CdA: uniform(rnd, 0, 1.6),
        ClA: uniform(rnd, 0, 5),
        mu: uniform(rnd, 0.8, 1.8),
        brakeBalance: uniform(rnd, 0, 1),
      };
      const r = simulateBrakingZone(p);
      const sum = r.eMguk + r.eBrakes + r.eAero;
      expect(Math.abs(r.dEk - sum) / r.dEk, JSON.stringify(p)).toBeLessThan(1e-6);
      expect(Math.abs(r.balanceError)).toBeLessThan(1e-6);
      expect(r.eStored).toBeLessThanOrEqual(p.Pmax * r.tBrake * (1 + 1e-9));
      expect(r.eStored + r.eMgukLoss).toBeCloseTo(r.eMguk, 6);
      expect(r.eBrakesFront + r.eBrakesRear).toBeCloseTo(r.eBrakes, 6);
      const last = r.trace[r.trace.length - 1];
      expect(last?.v).toBe(p.v2);
      expect(last?.t).toBeCloseTo(r.tBrake, 12);
      expect(r.recoveredFraction).toBeCloseTo(r.eStored / r.dEk, 12);
      // trace powers integrate to the totals (trapezoid, 1 %)
      const t = r.trace.map((s) => s.t);
      const eStoredTrace = trapz(
        t,
        r.trace.map((s) => s.pStored),
      );
      if (r.eStored > 1e3)
        expect(Math.abs(eStoredTrace - r.eStored) / r.eStored).toBeLessThan(0.01);
    }
  });

  it('without aero and with all braking on the rear axle it matches kersBrakingEvent', () => {
    for (const Pmax of [0, 60e3, 120e3, 200e3, 350e3, 1e6]) {
      const p: CarBrakingParams = { ...base, Pmax, CdA: 0, ClA: 0, brakeBalance: 0, h: 0 };
      const r = simulateBrakingZone(p);
      // constant deceleration: only the rear grip matters, a = μ·F_z,r/m
      const a = (base.mu * (1 - 0.45) * base.m * G_STANDARD) / base.m;
      for (const s of r.trace) expect(s.decel).toBeCloseTo(a, 9);
      expect(r.tBrake).toBeCloseTo((p.v1 - p.v2) / a, 9);
      expect(r.distance).toBeCloseTo(((p.v1 + p.v2) / 2) * r.tBrake, 6);
      const k = kersBrakingEvent({
        m: p.m,
        v1: p.v1,
        v2: p.v2,
        Pmax,
        eta: p.eta,
        tBrake: r.tBrake,
      });
      expect(r.dEk).toBeCloseTo(k.dEk, 3);
      const rel = (x: number, y: number): number => Math.abs(x - y) / Math.max(1, Math.abs(y));
      expect(rel(r.eMguk, k.recoverable)).toBeLessThan(1e-6);
      expect(rel(r.eStored, k.recovered)).toBeLessThan(1e-6);
      expect(rel(r.eBrakes + r.eMgukLoss, k.dissipated)).toBeLessThan(1e-6);
    }
  });

  it('downforce shortens the braking distance at high speed', () => {
    const noAero = simulateBrakingZone({ ...base, ClA: 0 });
    const aero = simulateBrakingZone(base);
    expect(aero.distance).toBeLessThan(noAero.distance * 0.75);
    expect(aero.tBrake).toBeLessThan(noAero.tBrake);
    // drag alone also helps
    const dragOnly = simulateBrakingZone({ ...base, ClA: 0, CdA: 1.2 });
    const none = simulateBrakingZone({ ...base, ClA: 0, CdA: 0 });
    expect(dragOnly.distance).toBeLessThan(none.distance);
    expect(none.eAero).toBe(0);
    // at low speed the aero effect is small
    const slowAero = simulateBrakingZone({ ...base, v1: kmhToMs(60), v2: 0 });
    const slowNone = simulateBrakingZone({ ...base, v1: kmhToMs(60), v2: 0, ClA: 0, CdA: 0 });
    expect(slowAero.distance / slowNone.distance).toBeGreaterThan(0.9);
  });

  it('example values: 800 kg, 300 → 100 km/h (illustrative car)', () => {
    const r = simulateBrakingZone(base);
    expect(r.dEk / 1e6).toBeCloseTo(2.469, 3);
    expect(r.tBrake).toBeGreaterThan(1.7);
    expect(r.tBrake).toBeLessThan(2.0);
    expect(r.distance).toBeGreaterThan(85);
    expect(r.distance).toBeLessThan(100);
    // 120 kW: the MGU-K is power-limited for the whole zone, stores P_max·t
    expect(r.trace.every((s) => s.mgukLimit === 'power')).toBe(true);
    expect(r.eStored).toBeCloseTo(120e3 * r.tBrake, 3);
    expect(r.peakDecel / G_STANDARD).toBeGreaterThan(5);
    // 350 kW: at low speed the rear axle (grip × balance) becomes the limit
    const r26 = simulateBrakingZone({ ...base, Pmax: 350e3 });
    expect(r26.trace[0]?.mgukLimit).toBe('power');
    expect(r26.trace[r26.trace.length - 1]?.mgukLimit).toBe('rear-axle');
    expect(r26.eStored).toBeLessThan(350e3 * r26.tBrake);
    expect(r26.eStored).toBeGreaterThan(r.eStored);
  });

  it('P_max = 0 sends everything to brakes and drag; v₁ = v₂ is an empty zone', () => {
    const r = simulateBrakingZone({ ...base, Pmax: 0 });
    expect(r.eMguk).toBe(0);
    expect(r.eStored).toBe(0);
    expect(r.recoveredFraction).toBe(0);
    expect(Math.abs(r.eBrakes + r.eAero - r.dEk) / r.dEk).toBeLessThan(1e-6);
    const z = simulateBrakingZone({ ...base, v2: base.v1 });
    expect(z.tBrake).toBe(0);
    expect(z.distance).toBe(0);
    expect(z.dEk).toBe(0);
    expect(z.recoveredFraction).toBe(0);
    expect(z.balanceError).toBe(0);
    expect(z.trace).toHaveLength(1);
    const stop = simulateBrakingZone({ ...base, v2: 0 });
    expect(stop.trace[stop.trace.length - 1]?.v).toBe(0);
    expect(Math.abs(stop.balanceError)).toBeLessThan(1e-6);
  });

  it('a larger dt gives the same totals (step-size independence)', () => {
    const fine = simulateBrakingZone(base);
    const coarse = simulateBrakingZone({ ...base, dt: 1 / 60 });
    expect(Math.abs(coarse.tBrake - fine.tBrake)).toBeLessThan(1e-6);
    expect(Math.abs(coarse.distance - fine.distance)).toBeLessThan(1e-4);
  });

  it('rejects invalid speeds and dt', () => {
    expect(() => simulateBrakingZone({ ...base, v2: base.v1 + 1 })).toThrow(RangeError);
    expect(() => simulateBrakingZone({ ...base, v1: -1, v2: -2 })).toThrow(RangeError);
    expect(() => simulateBrakingZone({ ...base, v2: Number.NaN })).toThrow(RangeError);
    expect(() => simulateBrakingZone({ ...base, dt: 0 })).toThrow(RangeError);
  });
});
