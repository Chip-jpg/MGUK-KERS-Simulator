import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  niceTicks,
  paddedRange,
  rangesClose,
  RANGE_TAU_MS,
  sanitizeRange,
  stepRange,
} from '../../src/ui/plotScale';

const ok = (r: readonly [number, number]): boolean =>
  Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0];

describe('sanitizeRange (F6 guard)', () => {
  it('passes valid ranges and orders inverted ones', () => {
    expect(sanitizeRange([-2, 5])).toEqual([-2, 5]);
    expect(sanitizeRange([5, -2])).toEqual([-2, 5]);
    expect(sanitizeRange([9e-6, 1e-5])).toEqual([9e-6, 1e-5]); // µ-scale spans are fine
  });

  it('never returns NaN / ∞ / zero width', () => {
    const bad: Array<[number, number]> = [
      [Number.NaN, 1],
      [0, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NaN],
      [0, 0],
      [3, 3],
      [-1e-20, -1e-20],
      [1e6, 1e6 + 1e-9],
    ];
    for (const r of bad) expect(ok(sanitizeRange(r)), String(r)).toBe(true);
    expect(sanitizeRange(null)).toEqual(DEFAULT_RANGE);
    expect(sanitizeRange([0, 0])).toEqual([-1, 1]); // B = 0 or ω = 0: flat line at 0
    expect(sanitizeRange([10, 10])).toEqual([9, 11]); // ±10 % around a flat value
  });

  it('uses the fallback for non-finite input', () => {
    expect(sanitizeRange([Number.NaN, 2], [-5, 5])).toEqual([-5, 5]);
    expect(sanitizeRange([Number.NaN, 2], [Number.NaN, 5])).toEqual(DEFAULT_RANGE);
  });
});

describe('stepRange (smooth, rate-limited rescaling)', () => {
  it('starts at the target, then approaches it exponentially without jumping', () => {
    expect(stepRange(null, [0, 10], 16)).toEqual([0, 10]);
    let r: [number, number] = [0, 10];
    const target: [number, number] = [-100, 100];
    const first = stepRange(r, target, 1000 / 60);
    // one 60 Hz frame moves only a fraction (1 − e^(−16,7/100) ≈ 15 %)
    expect(first[1]).toBeGreaterThan(10);
    expect(first[1]).toBeLessThan(10 + 0.2 * 90);
    let t = 0;
    while (!rangesClose(r, target, 1e-12) && t < 2000) {
      const next = stepRange(r, target, 1000 / 60);
      // rate limit: ≤ 16 % of the remaining distance per frame (or the final ≤ 0,2 % snap)
      expect(next[1] - r[1]).toBeLessThanOrEqual(Math.max(0.16 * (target[1] - r[1]), 0.4) + 1e-9);
      r = next;
      t += 1000 / 60;
    }
    expect(r).toEqual(target); // snaps exactly once close
    expect(t).toBeGreaterThan(3 * RANGE_TAU_MS * 0.9); // ≈ 300 ms, not instantaneous
    expect(t).toBeLessThan(1000);
  });

  it('is frame-rate independent (same result for 1 × 33 ms or 2 × 16,5 ms)', () => {
    const a = stepRange([0, 1], [0, 3], 33);
    const b = stepRange(stepRange([0, 1], [0, 3], 16.5), [0, 3], 16.5);
    expect(a[1]).toBeCloseTo(b[1], 12);
  });

  it('stays safe with invalid inputs and dt', () => {
    expect(ok(stepRange([0, 0], [Number.NaN, 0], 16))).toBe(true);
    expect(ok(stepRange([Number.NaN, 1], [2, 2], Number.NaN))).toBe(true);
    expect(stepRange([0, 1], [0, 2], -50)).toEqual([0, 1]); // negative dt → no move
    expect(stepRange([0, 1], [0, 2], 1e9)).toEqual([0, 2]); // clamped to 1 s → settled
  });
});

describe('niceTicks (always ≥ 2 labelled y ticks)', () => {
  it('uses 1-2-2,5-5 steps and refines until two ticks fit', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    const t = niceTicks(32.1, 1965.8, 3); // uPlot alone showed only "1000" here
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.every((v) => v >= 32.1 && v <= 1965.8)).toBe(true);
    expect(niceTicks(-25.7, 26.2, 3)).toEqual([-20, 0, 20]);
    expect(niceTicks(9.81e-6, 9.83e-6, 4).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(5, 5, 4).length).toBeGreaterThanOrEqual(2); // degenerate → safe
    expect(niceTicks(Number.NaN, 1, 4).length).toBeGreaterThanOrEqual(2);
  });
});

describe('paddedRange', () => {
  it('pads the visible data by 5 % and falls back without data', () => {
    expect(paddedRange(0, 10)).toEqual([-0.5, 10.5]);
    expect(paddedRange(Number.NaN, Number.NaN, 0.05, [-3, 3])).toEqual([-3, 3]);
    expect(ok(paddedRange(4, 4))).toBe(true);
  });
});
