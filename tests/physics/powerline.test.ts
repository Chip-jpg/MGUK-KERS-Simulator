import { describe, expect, it } from 'vitest';
import {
  catenaryDrop,
  catenaryLength,
  catenaryParameterForLength,
  catenarySag,
  coreFluxPeak,
  thermalSag,
} from '../../src/physics';

describe('catenary', () => {
  it('sag: exact formula and the parabolic limit S²/(8a)', () => {
    expect(catenarySag(300, 1360)).toBeCloseTo(1360 * (Math.cosh(150 / 1360) - 1), 12);
    const a = 1e6;
    expect(catenarySag(300, a) / ((300 * 300) / (8 * a))).toBeCloseTo(1, 6);
  });

  it('drop: 0 at the supports, the sag at mid-span, symmetric', () => {
    const S = 300;
    const a = 1360;
    expect(catenaryDrop(0, S, a)).toBeCloseTo(0, 12);
    expect(catenaryDrop(S, S, a)).toBeCloseTo(0, 12);
    expect(catenaryDrop(S / 2, S, a)).toBeCloseTo(catenarySag(S, a), 12);
    expect(catenaryDrop(70, S, a)).toBeCloseTo(catenaryDrop(S - 70, S, a), 12);
  });

  it('length ≥ span, ≈ S + 8f²/(3S); the inverse recovers a', () => {
    const S = 300;
    const a = 1360;
    const L = catenaryLength(S, a);
    const f = catenarySag(S, a);
    expect(L).toBeGreaterThan(S);
    expect((L - S) / ((8 * f * f) / (3 * S))).toBeCloseTo(1, 2); // 2nd-order approximation
    expect(catenaryParameterForLength(S, L) / a).toBeCloseTo(1, 9);
    expect(catenaryParameterForLength(10, 30)).toBeGreaterThan(0);
  });

  it('thermal sag: hotter ⇒ longer ⇒ more sag; ΔT = 0 is unchanged', () => {
    const base = thermalSag(300, 1360, 23e-6, 0);
    expect(base.sag).toBeCloseTo(catenarySag(300, 1360), 9);
    const hot = thermalSag(300, 1360, 23e-6, 50);
    expect(hot.length / base.length - 1).toBeCloseTo(23e-6 * 50, 12);
    expect(hot.sag).toBeGreaterThan(base.sag + 1.5); // ≈ 8,3 m → ≈ 10,3 m
    expect(hot.sag).toBeLessThan(base.sag + 2.6);
    expect(thermalSag(300, 1360, 0, 80).sag).toBeCloseTo(base.sag, 9);
  });

  it('rejects invalid input', () => {
    expect(() => catenarySag(0, 1)).toThrow(RangeError);
    expect(() => catenarySag(1, -1)).toThrow(RangeError);
    expect(() => catenaryDrop(Number.NaN, 1, 1)).toThrow(RangeError);
    expect(() => catenaryLength(1, 0)).toThrow(RangeError);
    expect(() => catenaryParameterForLength(10, 10)).toThrow(RangeError);
    expect(() => catenaryParameterForLength(10, Number.NaN)).toThrow(RangeError);
    expect(() => thermalSag(300, 1360, -1, 10)).toThrow(RangeError);
    expect(() => thermalSag(300, 1360, 1e-5, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => thermalSag(300, 1e9, 1e-3, -999)).toThrow(RangeError); // shorter than the span
  });
});

describe('coreFluxPeak (V = 4,44 f N Φ̂)', () => {
  it('matches the 4,44 rule and scales as V/(N f)', () => {
    const phi = coreFluxPeak(20_000, 50, 100);
    expect(phi).toBeCloseTo(20_000 / (4.442882938 * 50 * 100), 9);
    expect(coreFluxPeak(20_000, 50, 200)).toBeCloseTo(phi / 2, 12);
    expect(coreFluxPeak(40_000, 50, 100)).toBeCloseTo(2 * phi, 12);
    expect(coreFluxPeak(20_000, 60, 100)).toBeCloseTo((phi * 50) / 60, 12);
    expect(coreFluxPeak(0, 50, 10)).toBe(0);
  });
  it('rejects invalid input', () => {
    expect(() => coreFluxPeak(-1, 50, 10)).toThrow(RangeError);
    expect(() => coreFluxPeak(1, 0, 10)).toThrow(RangeError);
    expect(() => coreFluxPeak(1, 50, 0)).toThrow(RangeError);
    expect(() => coreFluxPeak(Number.NaN, 50, 10)).toThrow(RangeError);
  });
});
