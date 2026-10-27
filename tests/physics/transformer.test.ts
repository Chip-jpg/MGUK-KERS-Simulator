import { describe, expect, it } from 'vitest';
import {
  jouleLoss,
  lineLoss,
  lorentzForce,
  transformerCurrent,
  transformerSecondary,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

describe('transformer (slide 20)', () => {
  it('V₂ = V₁ N₂/N₁, I₂ = I₁ N₁/N₂', () => {
    expect(transformerSecondary(230, 100, 1000)).toBeCloseTo(2300, 10);
    expect(transformerSecondary(230, 1000, 100)).toBeCloseTo(23, 12);
    expect(transformerCurrent(10, 100, 1000)).toBeCloseTo(1, 12);
    expect(Object.is(transformerSecondary(-0, 1, 2), 0)).toBe(true);
  });
  it('property: V₁I₁ = V₂I₂ for random ratios', () => {
    const rnd = mulberry32(2024);
    for (let k = 0; k < 50; k++) {
      const V1 = uniform(rnd, -400e3, 400e3);
      const I1 = uniform(rnd, -2000, 2000);
      const N1 = Math.ceil(uniform(rnd, 0, 5000));
      const N2 = Math.ceil(uniform(rnd, 0, 5000));
      const P1 = V1 * I1;
      const P2 = transformerSecondary(V1, N1, N2) * transformerCurrent(I1, N1, N2);
      expect(Math.abs(P2 - P1)).toBeLessThanOrEqual(1e-12 * Math.abs(P1) + 1e-9);
    }
  });
  it('rejects N ≤ 0', () => {
    expect(() => transformerSecondary(1, 0, 1)).toThrow(RangeError);
    expect(() => transformerSecondary(1, 1, -1)).toThrow(RangeError);
    expect(() => transformerCurrent(1, 0, 1)).toThrow(RangeError);
    expect(() => transformerCurrent(NaN, 1, 1)).toThrow(RangeError);
  });
});

describe('jouleLoss (slide 16)', () => {
  it('P = R I²', () => {
    expect(jouleLoss(2, 3)).toBe(18);
    expect(jouleLoss(2, -3)).toBe(18);
    expect(jouleLoss(0, 3)).toBe(0);
    expect(() => jouleLoss(-1, 1)).toThrow(RangeError);
  });
});

describe('lineLoss (slides 21–23)', () => {
  it('I = P/V, loss = R I², fraction = loss/P', () => {
    const r = lineLoss(1e6, 10e3, 2);
    expect(r.I).toBe(100);
    expect(r.loss).toBe(2e4);
    expect(r.fraction).toBe(0.02);
  });
  it('P = 0 ⇒ zero current, loss and fraction', () => {
    expect(lineLoss(0, 1000, 5)).toEqual({ I: 0, loss: 0, fraction: 0 });
  });
  it('property: loss ∝ 1/V² at equal P and R (k× V ⇒ ÷k² loss)', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const P = uniform(rnd, 1e3, 1e9);
      const V = uniform(rnd, 100, 1e6);
      const R = uniform(rnd, 0.01, 50);
      const k = uniform(rnd, 1.5, 100);
      const a = lineLoss(P, V, R);
      const b = lineLoss(P, k * V, R);
      expect(a.loss / b.loss / (k * k)).toBeCloseTo(1, 10);
    }
  });
  it('rejects V ≤ 0, P < 0, R < 0', () => {
    expect(() => lineLoss(1, 0, 1)).toThrow(RangeError);
    expect(() => lineLoss(-1, 1, 1)).toThrow(RangeError);
    expect(() => lineLoss(1, 1, -1)).toThrow(RangeError);
  });
});

describe('lorentzForce (extension)', () => {
  it('F = B I L sin θ, θ defaults to π/2', () => {
    expect(lorentzForce(0.5, 10, 0.2)).toBeCloseTo(1, 15);
    expect(lorentzForce(0.5, 10, 0.2, Math.PI / 6)).toBeCloseTo(0.5, 15);
    expect(lorentzForce(0.5, -10, 0.2)).toBeCloseTo(-1, 15);
    expect(Object.is(lorentzForce(0.5, 10, 0.2, 0), 0)).toBe(true);
  });
  it('rejects L < 0 and non-finite θ', () => {
    expect(() => lorentzForce(1, 1, -1)).toThrow(RangeError);
    expect(() => lorentzForce(1, 1, 1, NaN)).toThrow(RangeError);
  });
});
