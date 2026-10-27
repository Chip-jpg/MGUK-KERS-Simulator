import { describe, expect, it } from 'vitest';
import {
  emfFaraday,
  emfMotional,
  fluxUniform,
  inducedCurrent,
  lenzSign,
  rotatingLoop,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

describe('fluxUniform (slide 7)', () => {
  it('Φ = B S cos α', () => {
    expect(fluxUniform(2, 0.5, 0)).toBe(1);
    expect(fluxUniform(2, 0.5, Math.PI / 3)).toBeCloseTo(0.5, 15);
    expect(fluxUniform(2, 0.5, Math.PI)).toBeCloseTo(-1, 15);
    expect(fluxUniform(-2, 0.5, 0)).toBe(-1);
  });
  it('is +0 (not −0) for zero field', () => {
    expect(Object.is(fluxUniform(-0, 1, 0), 0)).toBe(true);
  });
  it('rejects S < 0 and non-finite input', () => {
    expect(() => fluxUniform(1, -1, 0)).toThrow(RangeError);
    expect(() => fluxUniform(NaN, 1, 0)).toThrow(RangeError);
    expect(() => fluxUniform(1, 1, Infinity)).toThrow(RangeError);
  });
});

describe('emfFaraday (slide 8)', () => {
  it('f.e.m. = −N ΔΦ/Δt, N defaults to 1', () => {
    expect(emfFaraday(0.2, 0.1)).toBeCloseTo(-2, 15);
    expect(emfFaraday(0.2, 0.1, 10)).toBeCloseTo(-20, 13);
    expect(emfFaraday(-0.2, 0.1, 10)).toBeCloseTo(20, 13);
    expect(Object.is(emfFaraday(0, 1), 0)).toBe(true);
    expect(emfFaraday(1, 1, 0)).toBe(0);
  });
  it('Δt = 0 ⇒ RangeError (edge case)', () => {
    expect(() => emfFaraday(1, 0)).toThrow(RangeError);
    expect(() => emfFaraday(1, -0)).toThrow(RangeError);
    expect(() => emfFaraday(1, -1)).toThrow(RangeError);
  });
  it('rejects N < 0 and non-finite input', () => {
    expect(() => emfFaraday(1, 1, -1)).toThrow(RangeError);
    expect(() => emfFaraday(Infinity, 1)).toThrow(RangeError);
  });
});

describe('emfMotional (slide 8)', () => {
  it('f.e.m. = B l v', () => {
    expect(emfMotional(0.5, 2, 3)).toBe(3);
    expect(emfMotional(0.5, 2, -3)).toBe(-3);
    expect(Object.is(emfMotional(-0.5, 2, 0), 0)).toBe(true);
  });
  it('rejects l < 0', () => {
    expect(() => emfMotional(1, -1, 1)).toThrow(RangeError);
  });
});

describe('rotatingLoop (slides 18–19)', () => {
  it('Φ(0) = BS, emf(0) = 0', () => {
    const r = rotatingLoop(1.5, 0.1, 20, 100, 0);
    expect(r.phi).toBeCloseTo(0.15, 15);
    expect(r.emf).toBe(0);
    expect(r.V0).toBeCloseTo(300, 12);
  });

  it('property: peak |emf| over a period = N·B·S·ω (random parameter sets)', () => {
    const rnd = mulberry32(42);
    for (let k = 0; k < 25; k++) {
      const B = uniform(rnd, 0.01, 2);
      const S = uniform(rnd, 1e-4, 0.5);
      const N = Math.floor(uniform(rnd, 1, 500));
      const omega = uniform(rnd, 1, 1000);
      const expected = N * B * S * omega;
      const T = (2 * Math.PI) / omega;
      let peak = 0;
      for (let i = 0; i <= 4000; i++) {
        peak = Math.max(peak, Math.abs(rotatingLoop(B, S, N, omega, (T * i) / 4000).emf));
      }
      expect(rotatingLoop(B, S, N, omega, 0).V0).toBeCloseTo(expected, 8);
      expect(peak / expected).toBeCloseTo(1, 6);
    }
  });

  it('property: emf = −N dΦ/dt (central difference)', () => {
    const rnd = mulberry32(7);
    for (let k = 0; k < 25; k++) {
      const B = uniform(rnd, -2, 2);
      const S = uniform(rnd, 1e-3, 0.5);
      const N = Math.floor(uniform(rnd, 1, 200));
      const omega = uniform(rnd, -300, 300);
      const t = uniform(rnd, 0, 1);
      const h = 1e-6;
      const dPhiDt =
        (rotatingLoop(B, S, N, omega, t + h).phi - rotatingLoop(B, S, N, omega, t - h).phi) /
        (2 * h);
      const { emf, V0 } = rotatingLoop(B, S, N, omega, t);
      const scale = Math.abs(V0) + 1e-12;
      expect(Math.abs(emf - -N * dPhiDt) / scale).toBeLessThan(1e-5);
    }
  });

  it('rejects N < 0, S < 0, non-finite', () => {
    expect(() => rotatingLoop(1, 1, -1, 1, 0)).toThrow(RangeError);
    expect(() => rotatingLoop(1, -1, 1, 1, 0)).toThrow(RangeError);
    expect(() => rotatingLoop(1, 1, 1, NaN, 0)).toThrow(RangeError);
  });
});

describe('inducedCurrent (slide 9)', () => {
  it('i = f.e.m./R', () => {
    expect(inducedCurrent(6, 3)).toBe(2);
    expect(inducedCurrent(-6, 3)).toBe(-2);
    expect(Object.is(inducedCurrent(-0, 3), 0)).toBe(true);
  });
  it('R = 0 ⇒ RangeError (edge case), R < 0 ⇒ RangeError', () => {
    expect(() => inducedCurrent(1, 0)).toThrow(RangeError);
    expect(() => inducedCurrent(1, -1)).toThrow(RangeError);
    expect(() => inducedCurrent(NaN, 1)).toThrow(RangeError);
  });
});

describe('lenzSign (slide 11)', () => {
  it('returns −sign(dΦ/dt)', () => {
    expect(lenzSign(3)).toBe(-1);
    expect(lenzSign(-0.001)).toBe(1);
    expect(lenzSign(Infinity)).toBe(-1);
    expect(lenzSign(-Infinity)).toBe(1);
  });
  it('returns +0 for no variation (also for −0)', () => {
    expect(Object.is(lenzSign(0), 0)).toBe(true);
    expect(Object.is(lenzSign(-0), 0)).toBe(true);
  });
  it('rejects NaN', () => {
    expect(() => lenzSign(NaN)).toThrow(RangeError);
  });
  it('agrees with the sign of the Faraday emf', () => {
    for (const dPhi of [-2, -1e-9, 1e-9, 5]) {
      expect(lenzSign(dPhi / 0.1)).toBe(Math.sign(emfFaraday(dPhi, 0.1)));
    }
  });
  it('magnet cases of slide 11 (n̂ = direction of the field of a N pole facing the coil)', () => {
    // B component along n̂ at the coil: + for a N pole facing it, − for a S pole;
    // its magnitude grows while the magnet approaches and shrinks while it leaves.
    const S = 1e-2;
    const dt = 0.1;
    const rate = (b0: number, b1: number) => (fluxUniform(b1, S, 0) - fluxUniform(b0, S, 0)) / dt;
    // N approaching ⇒ −1: induced field along −n̂, coil face becomes a N pole (repels).
    expect(lenzSign(rate(0.1, 0.3))).toBe(-1);
    // N leaving ⇒ +1: induced field along +n̂, coil face becomes a S pole (attracts back).
    expect(lenzSign(rate(0.3, 0.1))).toBe(1);
    // S approaching ⇒ +1 (Φ grows more negative), S leaving ⇒ −1.
    expect(lenzSign(rate(-0.1, -0.3))).toBe(1);
    expect(lenzSign(rate(-0.3, -0.1))).toBe(-1);
  });
});
