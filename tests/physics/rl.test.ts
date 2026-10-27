import { describe, expect, it } from 'vitest';
import {
  MU_0,
  PHYSICS_DT,
  emfSelf,
  magneticEnergy,
  rk4Step,
  rlCurrent,
  rlTimeConstant,
  solenoidInductance,
} from '../../src/physics';

describe('solenoidInductance (slide 14)', () => {
  it('L = μ₀ N² S / l with the default μ₀', () => {
    // N = 1000, S = 1e-3 m², l = 0.5 m ⇒ L = 4π·1e-7·1e6·1e-3/0.5 ≈ 2.513 mH
    expect(solenoidInductance(1000, 1e-3, 0.5)).toBeCloseTo(8e-4 * Math.PI, 15);
    expect(solenoidInductance(1000, 1e-3, 0.5, MU_0)).toBe(solenoidInductance(1000, 1e-3, 0.5));
  });
  it('custom μ (μ_r = 1000) scales linearly', () => {
    expect(solenoidInductance(10, 1e-2, 0.1, 1000 * MU_0)).toBeCloseTo(
      1000 * solenoidInductance(10, 1e-2, 0.1),
      12,
    );
  });
  it('rejects l ≤ 0, μ ≤ 0, N < 0, S < 0', () => {
    expect(() => solenoidInductance(10, 1, 0)).toThrow(RangeError);
    expect(() => solenoidInductance(10, 1, 1, 0)).toThrow(RangeError);
    expect(() => solenoidInductance(-1, 1, 1)).toThrow(RangeError);
    expect(() => solenoidInductance(1, -1, 1)).toThrow(RangeError);
  });
});

describe('emfSelf (slide 13)', () => {
  it('f.e.m. = −L di/dt', () => {
    expect(emfSelf(0.5, 4)).toBe(-2);
    expect(emfSelf(0.5, -4)).toBe(2);
    expect(Object.is(emfSelf(0.5, 0), 0)).toBe(true);
  });
  it('rejects L < 0', () => {
    expect(() => emfSelf(-1, 1)).toThrow(RangeError);
  });
});

describe('rlTimeConstant / rlCurrent (slide 15)', () => {
  it('τ = L/R and validation', () => {
    expect(rlTimeConstant(10, 2)).toBe(0.2);
    expect(rlTimeConstant(10, 0)).toBe(0);
    expect(() => rlTimeConstant(0, 1)).toThrow(RangeError);
    expect(() => rlTimeConstant(1, -1)).toThrow(RangeError);
  });
  it('i(0) = 0, i(∞) → I₀, monotone', () => {
    expect(rlCurrent(10, 5, 1, 0)).toBe(0);
    expect(rlCurrent(10, 5, 1, 100)).toBeCloseTo(2, 12);
    let prev = 0;
    for (let k = 1; k <= 50; k++) {
      const i = rlCurrent(10, 5, 1, k * 0.02);
      expect(i).toBeGreaterThan(prev);
      prev = i;
    }
  });
  it('t < 0 ⇒ 0 (switch still open)', () => {
    expect(rlCurrent(10, 5, 1, -1)).toBe(0);
  });
  it('R = 0 ⇒ exact limit i = E t / L (edge case)', () => {
    expect(rlCurrent(12, 0, 3, 2)).toBe(8);
    // continuity: tiny R approaches the R = 0 limit
    expect(rlCurrent(12, 1e-12, 3, 2)).toBeCloseTo(8, 9);
  });
  it('negative emf gives a negative current, no −0', () => {
    expect(rlCurrent(-10, 5, 1, 100)).toBeCloseTo(-2, 12);
    expect(Object.is(rlCurrent(0, 5, 1, 1), 0)).toBe(true);
  });
  it('rejects L ≤ 0, R < 0, non-finite', () => {
    expect(() => rlCurrent(1, 1, 0, 1)).toThrow(RangeError);
    expect(() => rlCurrent(1, -1, 1, 1)).toThrow(RangeError);
    expect(() => rlCurrent(1, 1, 1, NaN)).toThrow(RangeError);
  });
  it('matches RK4 integration of L di/dt = E − R i at dt = 1/240 s', () => {
    const E = 12;
    const R = 4;
    const L = 0.5;
    let y = [0];
    let t = 0;
    for (let k = 0; k < 240; k++) {
      y = rk4Step((_t, s) => [(E - R * (s[0] as number)) / L], t, y, PHYSICS_DT);
      t += PHYSICS_DT;
    }
    expect(Math.abs((y[0] as number) - rlCurrent(E, R, L, t))).toBeLessThan(1e-9);
  });
  it('energy balance (slides 16–17): ∫E i dt = ∫R i² dt + ½ L I²', () => {
    const E = 10;
    const R = 2;
    const L = 0.4;
    const T = 1;
    const n = 20000;
    let gen = 0;
    let joule = 0;
    for (let k = 0; k < n; k++) {
      const tm = ((k + 0.5) * T) / n;
      const i = rlCurrent(E, R, L, tm);
      gen += (E * i * T) / n;
      joule += (R * i * i * T) / n;
    }
    const field = magneticEnergy(L, rlCurrent(E, R, L, T));
    expect((gen - joule - field) / gen).toBeLessThan(1e-6);
  });
});

describe('magneticEnergy (slide 17)', () => {
  it('U = ½ L I²', () => {
    expect(magneticEnergy(2, 3)).toBe(9);
    expect(magneticEnergy(2, -3)).toBe(9);
    expect(magneticEnergy(0, 3)).toBe(0);
  });
  it('rejects L < 0', () => {
    expect(() => magneticEnergy(-1, 1)).toThrow(RangeError);
  });
});
