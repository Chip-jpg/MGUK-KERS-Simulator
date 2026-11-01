import { describe, expect, it } from 'vitest';
import {
  faradayRanges,
  PLOT_MIN_HALF_SPAN,
  PLOT_RANGE_MARGIN,
  rotatingLoop,
  safeRange,
  symmetricRange,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

function valid(r: [number, number]): void {
  expect(Number.isFinite(r[0])).toBe(true);
  expect(Number.isFinite(r[1])).toBe(true);
  expect(r[1]).toBeGreaterThan(r[0]);
}

const WEIRD = [0, -0, 1e-300, -5, 1e300, Number.NaN, Infinity, -Infinity, Number.MAX_VALUE];

describe('symmetricRange', () => {
  it('adds the margin around the amplitude', () => {
    expect(symmetricRange(2)).toEqual([-2.2, 2.2]);
    expect(symmetricRange(-2, 0.5)).toEqual([-3, 3]);
    expect(symmetricRange(2, 0)).toEqual([-2, 2]);
    expect(PLOT_RANGE_MARGIN).toBe(0.1);
  });
  it('never collapses: zero amplitude ⇒ minHalfSpan', () => {
    expect(symmetricRange(0)).toEqual([-PLOT_MIN_HALF_SPAN, PLOT_MIN_HALF_SPAN]);
    expect(symmetricRange(0, 0.1, 5)).toEqual([-5, 5]);
  });
  it('sanitises every weird input', () => {
    for (const a of WEIRD)
      for (const m of WEIRD)
        for (const h of WEIRD) {
          const r = symmetricRange(a, m, h);
          valid(r);
          expect(r[0]).toBe(-r[1]);
        }
    expect(symmetricRange(Number.NaN)).toEqual([-PLOT_MIN_HALF_SPAN, PLOT_MIN_HALF_SPAN]);
  });
});

describe('safeRange', () => {
  it('keeps a valid range, swaps reversed bounds', () => {
    expect(safeRange(-1, 3)).toEqual([-1, 3]);
    expect(safeRange(3, -1)).toEqual([-1, 3]);
  });
  it('widens zero-width / too-narrow ranges around their centre', () => {
    expect(safeRange(2, 2, 1)).toEqual([1.5, 2.5]);
    const r = safeRange(1e12, 1e12);
    valid(r);
    expect((r[0] + r[1]) / 2).toBeCloseTo(1e12, 0);
    valid(safeRange(0, 0));
  });
  it('replaces NaN and clamps ±∞', () => {
    expect(safeRange(Number.NaN, 4, 2)).toEqual([3, 5]);
    expect(safeRange(4, Number.NaN, 2)).toEqual([3, 5]);
    valid(safeRange(Number.NaN, Number.NaN));
    valid(safeRange(-Infinity, Infinity));
    valid(safeRange(Infinity, Infinity));
    valid(safeRange(-Infinity, -Infinity));
  });
  it('property: always finite with lo < hi', () => {
    for (const a of WEIRD) for (const b of WEIRD) for (const s of WEIRD) valid(safeRange(a, b, s));
    const rnd = mulberry32(7);
    for (let k = 0; k < 2000; k++) {
      const x = uniform(rnd, -1, 1) * 10 ** uniform(rnd, -300, 300);
      valid(safeRange(x, x * (1 + uniform(rnd, -1e-16, 1e-16))));
    }
  });
});

describe('faradayRanges', () => {
  it('Φ per turn ±B·S, emf ±N·B·S·ω, with margin', () => {
    const r = faradayRanges(0.5, 0.01, 100, 50, 0);
    expect(r.phi[1]).toBeCloseTo(0.005, 15);
    expect(r.emf[1]).toBeCloseTo(25, 12);
    const m = faradayRanges(0.5, 0.01, 100, 50);
    expect(m.phi[1]).toBeCloseTo(0.0055, 15);
    expect(m.emf[1]).toBeCloseTo(27.5, 12);
  });
  it('contains the whole rotating-loop signal', () => {
    const r = faradayRanges(0.8, 0.02, 30, 12);
    for (let t = 0; t < 2; t += 0.01) {
      const s = rotatingLoop(0.8, 0.02, 30, 12, t);
      expect(Math.abs(s.phi)).toBeLessThanOrEqual(r.phi[1]);
      expect(Math.abs(s.emf)).toBeLessThanOrEqual(r.emf[1]);
    }
  });
  it('B = 0 or ω = 0 give small finite non-zero ranges', () => {
    const b0 = faradayRanges(0, 0.01, 100, 50);
    valid(b0.phi);
    valid(b0.emf);
    expect(b0.phi[1]).toBe(PLOT_MIN_HALF_SPAN);
    const w0 = faradayRanges(0.5, 0.01, 100, 0);
    valid(w0.emf);
    expect(w0.emf[1]).toBeCloseTo(0.5 * 0.01 * 100 * 1e-3, 15);
    expect(w0.phi[1]).toBeCloseTo(0.0055, 15);
  });
  it('sanitises NaN, ±∞ and extreme slider values', () => {
    for (const B of WEIRD)
      for (const S of WEIRD)
        for (const N of [0, 1, 1e6, Number.NaN, Infinity])
          for (const w of WEIRD) {
            const r = faradayRanges(B, S, N, w);
            valid(r.phi);
            valid(r.emf);
          }
  });
});
