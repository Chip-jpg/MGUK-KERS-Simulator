import { describe, expect, it } from 'vitest';
import { autoRange, holdPeak, niceCeil, RANGE_DOWN_FRACTION } from '../../src/render/scale';

describe('niceCeil (1-2-5 series)', () => {
  it('rounds up to 1, 2, 5 × 10ᵏ', () => {
    expect(niceCeil(0.7)).toBe(1);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(1.2)).toBe(2);
    expect(niceCeil(2)).toBe(2);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(6)).toBe(10);
    expect(niceCeil(1.86e-3)).toBeCloseTo(2e-3, 15);
    expect(niceCeil(4.2e-6)).toBeCloseTo(5e-6, 18);
    expect(niceCeil(380)).toBe(500);
  });
  it('never returns less than the floor; non-positive / non-finite → floor', () => {
    expect(niceCeil(0, 1e-5)).toBe(1e-5);
    expect(niceCeil(-3, 2)).toBe(2);
    expect(niceCeil(Number.NaN, 7)).toBe(7);
    expect(niceCeil(Infinity, 7)).toBe(7);
    expect(niceCeil(1e-9, 1e-5)).toBe(1e-5);
  });
});

describe('autoRange (auto-ranging instrument)', () => {
  it('switches up at once when the peak exceeds the full scale', () => {
    expect(autoRange(1e-3, 1.5e-3, 1e-5)).toBeCloseTo(2e-3, 15);
  });
  it('keeps the range inside the hysteresis band', () => {
    expect(autoRange(1e-3, 0.9e-3, 1e-5)).toBe(1e-3);
    expect(autoRange(1e-3, RANGE_DOWN_FRACTION * 1e-3 * 1.01, 1e-5)).toBe(1e-3);
  });
  it('switches down when the peak falls well below the range, never below the floor', () => {
    expect(autoRange(1e-2, 1e-3, 1e-5)).toBeCloseTo(2e-3, 15);
    expect(autoRange(1e-2, 0, 1e-5)).toBe(1e-5);
  });
  it('an invalid current range is replaced', () => {
    expect(autoRange(0, 3e-4, 1e-5)).toBeCloseTo(5e-4, 15);
  });
});

describe('holdPeak', () => {
  it('follows a larger value at once and releases exponentially', () => {
    expect(holdPeak(1, 2, 0.1, 1)).toBe(2);
    expect(holdPeak(1, -3, 0.1, 1)).toBe(3);
    expect(holdPeak(1, 0, 1, 1)).toBeCloseTo(Math.exp(-1), 12);
  });
});
