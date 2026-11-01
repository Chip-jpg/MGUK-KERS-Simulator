import { describe, expect, it } from 'vitest';
import {
  lineLoss,
  lineLossSweep,
  lineLossSweepP,
  lineLossSweepR,
  logspace,
} from '../../src/physics';

describe('logspace', () => {
  it('includes both ends exactly and is geometric', () => {
    const x = logspace(1e3, 1e6, 4);
    expect(x[0]).toBe(1e3);
    expect(x[3]).toBe(1e6);
    expect(x[1]).toBeCloseTo(1e4, 6);
    expect(x[2]).toBeCloseTo(1e5, 5);
    const y = logspace(2, 2000, 31);
    for (let k = 1; k < y.length; k++) {
      expect((y[k] as number) / (y[k - 1] as number)).toBeCloseTo(10 ** 0.1, 12);
    }
  });
  it('n = 1, decreasing sequences, equal ends', () => {
    expect(logspace(5, 50, 1)).toEqual([5]);
    expect(logspace(100, 1, 3)).toEqual([100, expect.closeTo(10, 12) as number, 1]);
    expect(logspace(3, 3, 3)).toEqual([3, 3, 3]);
  });
  it('rejects invalid input', () => {
    expect(() => logspace(0, 1, 3)).toThrow(RangeError);
    expect(() => logspace(1, -1, 3)).toThrow(RangeError);
    expect(() => logspace(1, 10, 0)).toThrow(RangeError);
    expect(() => logspace(1, 10, 2.5)).toThrow(RangeError);
    expect(() => logspace(1, Infinity, 3)).toThrow(RangeError);
  });
});

describe('lineLossSweep (loss vs V)', () => {
  it('matches lineLoss point by point', () => {
    const V = logspace(1e3, 400e3, 20);
    const s = lineLossSweep(10e6, 5, V);
    expect(s).toHaveLength(20);
    s.forEach((pt, k) => {
      expect(pt.V).toBe(V[k]);
      expect({ I: pt.I, loss: pt.loss, fraction: pt.fraction }).toEqual(
        lineLoss(10e6, V[k] as number, 5),
      );
    });
  });
  it('10× voltage ⇒ loss ÷ 100', () => {
    const [a, b, c] = lineLossSweep(10e6, 5, [10e3, 100e3, 1000e3]);
    expect((a?.loss as number) / (b?.loss as number)).toBeCloseTo(100, 9);
    expect((b?.loss as number) / (c?.loss as number)).toBeCloseTo(100, 9);
    expect((a?.I as number) / (b?.I as number)).toBeCloseTo(10, 12);
  });
  it('empty input and invalid voltages', () => {
    expect(lineLossSweep(1, 1, [])).toEqual([]);
    expect(() => lineLossSweep(1, 1, [100, 0])).toThrow(RangeError);
    expect(() => lineLossSweep(-1, 1, [100])).toThrow(RangeError);
  });
});

describe('lineLossSweepR / lineLossSweepP', () => {
  it('loss linear in R', () => {
    const s = lineLossSweepR(10e6, 100e3, [0, 1, 2, 10]);
    expect(s[0]?.loss).toBe(0);
    expect(s[2]?.loss).toBeCloseTo(2 * (s[1]?.loss as number), 9);
    expect(s[3]?.loss).toBeCloseTo(10 * (s[1]?.loss as number), 9);
    expect(s.map((p) => p.R)).toEqual([0, 1, 2, 10]);
    expect(() => lineLossSweepR(1, 1, [-1])).toThrow(RangeError);
  });
  it('loss quadratic in P, fraction linear in P', () => {
    const s = lineLossSweepP(20e3, 5, [0, 1e6, 2e6]);
    expect(s[0]).toEqual({ P: 0, I: 0, loss: 0, fraction: 0 });
    expect((s[2]?.loss as number) / (s[1]?.loss as number)).toBeCloseTo(4, 12);
    expect((s[2]?.fraction as number) / (s[1]?.fraction as number)).toBeCloseTo(2, 12);
    expect(() => lineLossSweepP(0, 1, [1])).toThrow(RangeError);
  });
});
