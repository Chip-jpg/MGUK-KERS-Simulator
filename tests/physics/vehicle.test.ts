import { describe, expect, it } from 'vitest';
import {
  KERS_TRACE_SAMPLES,
  kersBrakingEvent,
  kersDissipationSplit,
  kineticEnergyDelta,
  kmhToMs,
  rk4Step,
} from '../../src/physics';
import type { KersBrakingParams } from '../../src/physics';
import { mulberry32, trapz, uniform } from './prng';

const base: KersBrakingParams = {
  m: 800,
  v1: kmhToMs(300),
  v2: kmhToMs(100),
  Pmax: 120e3,
  eta: 0.9,
  tBrake: 2.5,
};

function traceIntegrals(r: ReturnType<typeof kersBrakingEvent>) {
  const t = r.powerTrace.map((s) => s.t);
  return {
    kers: trapz(
      t,
      r.powerTrace.map((s) => s.pKers),
    ),
    brakes: trapz(
      t,
      r.powerTrace.map((s) => s.pBrakes),
    ),
  };
}

describe('kineticEnergyDelta', () => {
  it('ΔE_k = ½ m (v₁² − v₂²)', () => {
    expect(kineticEnergyDelta(2, 3, 1)).toBe(8);
    expect(kineticEnergyDelta(2, 1, 3)).toBe(-8);
    expect(Object.is(kineticEnergyDelta(2, 3, 3), 0)).toBe(true);
    expect(() => kineticEnergyDelta(-1, 1, 0)).toThrow(RangeError);
    expect(() => kineticEnergyDelta(1, NaN, 0)).toThrow(RangeError);
  });
});

describe('kersBrakingEvent', () => {
  it('energy bookkeeping: recovered + dissipated = dEk, split into brakes + MGU-K losses', () => {
    const r = kersBrakingEvent(base);
    expect(r.recovered + r.dissipated).toBeCloseTo(r.dEk, 6);
    expect(r.recovered).toBeCloseTo(0.9 * r.recoverable, 9);
    const split = kersDissipationSplit(r);
    expect(split.brakes + split.mguk).toBeCloseTo(r.dissipated, 6);
    expect(split.mguk).toBeCloseTo(0.1 * r.recoverable, 6);
  });

  it('120 kW cap over 2.5 s: MGU-K saturated the whole event', () => {
    // P_b(t_end) = m a v₂ = 800 · 22.2̅ · 27.7̅ ≈ 494 kW > Pmax/η = 133.3 kW
    const r = kersBrakingEvent(base);
    expect(r.recoverable).toBeCloseTo((120e3 / 0.9) * 2.5, 6);
    expect(r.recovered).toBeCloseTo(120e3 * 2.5, 6); // = 300 kJ
    expect(r.timeToRecoverAtPmax).toBeCloseTo((0.9 * r.dEk) / 120e3, 9);
    for (const s of r.powerTrace) expect(s.pKers).toBeCloseTo(120e3, 6);
  });

  it('cap above the peak braking power: everything goes through the MGU-K', () => {
    const r = kersBrakingEvent({ ...base, Pmax: 5e6, eta: 1 });
    expect(r.recoverable).toBeCloseTo(r.dEk, 6);
    expect(r.recovered).toBeCloseTo(r.dEk, 6);
    expect(r.dissipated).toBeCloseTo(0, 6);
  });

  it('partially saturated case matches a brute-force integral', () => {
    const p = { ...base, Pmax: 600e3, eta: 0.8 }; // cap 750 kW between P1 ≈ 494 kW and P0 ≈ 1.48 MW
    const r = kersBrakingEvent(p);
    const a = (p.v1 - p.v2) / p.tBrake;
    const n = 200000;
    let E = 0;
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) * p.tBrake) / n;
      E += (Math.min(p.m * a * (p.v1 - a * t), p.Pmax / p.eta) * p.tBrake) / n;
    }
    expect(r.recoverable / E).toBeCloseTo(1, 8);
    expect(r.recoverable).toBeGreaterThan((p.Pmax / p.eta) * p.tBrake * 0.5);
    expect(r.recoverable).toBeLessThan(Math.min(r.dEk, (p.Pmax / p.eta) * p.tBrake));
  });

  it('trace: 201 samples on [0, tBrake], pKers + pBrakes = P_b(t)', () => {
    const r = kersBrakingEvent(base);
    expect(r.powerTrace).toHaveLength(KERS_TRACE_SAMPLES);
    expect(r.powerTrace[0]?.t).toBe(0);
    expect(r.powerTrace.at(-1)?.t).toBe(base.tBrake);
    const a = (base.v1 - base.v2) / base.tBrake;
    for (const s of r.powerTrace) {
      expect(s.pKers + s.pBrakes).toBeCloseTo(base.m * a * (base.v1 - a * s.t), 4);
      expect(s.pKers).toBeLessThanOrEqual(base.Pmax * (1 + 1e-12));
      expect(s.pBrakes).toBeGreaterThanOrEqual(0);
    }
  });

  it('property: trapezoid integral of the trace matches the totals within 0.5 %', () => {
    const rnd = mulberry32(1234);
    for (let k = 0; k < 60; k++) {
      const v1 = uniform(rnd, 10, 100);
      const p = {
        m: uniform(rnd, 500, 2000),
        v1,
        v2: uniform(rnd, 0, v1 * 0.95),
        Pmax: uniform(rnd, 10e3, 2e6),
        eta: uniform(rnd, 0.05, 1),
        tBrake: uniform(rnd, 0.5, 8),
      };
      const r = kersBrakingEvent(p);
      const I = traceIntegrals(r);
      expect(Math.abs(I.kers - r.recovered)).toBeLessThanOrEqual(0.005 * r.recovered + 1e-9);
      expect(Math.abs(I.brakes - r.dissipated)).toBeLessThanOrEqual(0.005 * r.dEk);
      expect(Math.abs(I.kers + I.brakes - r.dEk)).toBeLessThanOrEqual(0.005 * r.dEk);
      expect(r.recovered + r.dissipated).toBeCloseTo(r.dEk, 6);
      expect(r.recoverable).toBeLessThanOrEqual(r.dEk * (1 + 1e-12));
    }
  });

  it('trace integrated with rk4Step reproduces recovered energy', () => {
    const r = kersBrakingEvent({ ...base, Pmax: 600e3, eta: 0.8 });
    const a = (base.v1 - base.v2) / base.tBrake;
    const cap = 600e3 / 0.8;
    const f = (t: number) => [0.8 * Math.min(base.m * a * (base.v1 - a * t), cap)];
    let y = [0];
    const steps = 600;
    const h = base.tBrake / steps;
    for (let k = 0; k < steps; k++) y = rk4Step((t) => f(t), k * h, y, h);
    expect((y[0] as number) / r.recovered).toBeCloseTo(1, 4);
  });

  it('edge: v₁ < v₂ (not braking) ⇒ negative dEk, nothing recovered/dissipated', () => {
    const r = kersBrakingEvent({ ...base, v1: 20, v2: 30 });
    expect(r.dEk).toBeCloseTo(-0.5 * 800 * (900 - 400), 9);
    expect(r.recoverable).toBe(0);
    expect(r.recovered).toBe(0);
    expect(r.dissipated).toBe(0);
    expect(r.timeToRecoverAtPmax).toBe(0);
    expect(r.powerTrace).toHaveLength(KERS_TRACE_SAMPLES);
    expect(r.powerTrace.every((s) => s.pKers === 0 && s.pBrakes === 0)).toBe(true);
    expect(kersDissipationSplit(r)).toEqual({ brakes: 0, mguk: 0 });
  });

  it('edge: v₁ = v₂ ⇒ all zero', () => {
    const r = kersBrakingEvent({ ...base, v1: 30, v2: 30 });
    expect(r.dEk).toBe(0);
    expect(r.recovered).toBe(0);
  });

  it('edge: Pmax = 0 ⇒ everything dissipated in the discs', () => {
    const r = kersBrakingEvent({ ...base, Pmax: 0 });
    expect(r.recoverable).toBe(0);
    expect(r.recovered).toBe(0);
    expect(r.dissipated).toBe(r.dEk);
    expect(r.timeToRecoverAtPmax).toBe(Infinity);
    expect(r.powerTrace.every((s) => s.pKers === 0)).toBe(true);
    expect(kersDissipationSplit(r)).toEqual({ brakes: r.dEk, mguk: 0 });
  });

  it('edge: Pmax = +∞ (uncapped) and η = 1 ⇒ everything recovered', () => {
    const r = kersBrakingEvent({ ...base, Pmax: Infinity, eta: 1 });
    expect(r.recovered).toBeCloseTo(r.dEk, 6);
    expect(r.timeToRecoverAtPmax).toBe(0);
  });

  it('edge: η = 0 ⇒ nothing stored (limit η → 0⁺)', () => {
    const r = kersBrakingEvent({ ...base, eta: 0 });
    expect(r.recovered).toBe(0);
    expect(r.dissipated).toBe(r.dEk);
    expect(r.recoverable).toBeCloseTo(r.dEk, 6);
    expect(r.timeToRecoverAtPmax).toBe(0);
    // continuity of `recovered` near η = 0
    expect(kersBrakingEvent({ ...base, eta: 1e-9 }).recovered).toBeLessThan(1e-2);
  });

  it('edge: v₂ = 0 (stop) works', () => {
    const r = kersBrakingEvent({ ...base, v2: 0 });
    expect(r.recovered + r.dissipated).toBeCloseTo(r.dEk, 6);
    expect(r.powerTrace.at(-1)?.pKers).toBe(0);
  });

  it('validation: RangeError on invalid inputs', () => {
    const bad: Array<Partial<KersBrakingParams>> = [
      { m: 0 },
      { m: -1 },
      { v1: -1 },
      { v2: -1 },
      { Pmax: -1 },
      { Pmax: NaN },
      { eta: -0.1 },
      { eta: 1.1 },
      { eta: NaN },
      { tBrake: 0 },
      { tBrake: -1 },
      { tBrake: Infinity },
    ];
    for (const b of bad) expect(() => kersBrakingEvent({ ...base, ...b })).toThrow(RangeError);
  });

  it('is pure: same input ⇒ identical output, input not mutated', () => {
    const p = { ...base };
    const r1 = kersBrakingEvent(p);
    const r2 = kersBrakingEvent(p);
    expect(r1).toEqual(r2);
    expect(p).toEqual(base);
  });
});
