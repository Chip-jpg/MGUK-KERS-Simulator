import { describe, expect, it } from 'vitest';
import { createRk4Work, PHYSICS_DT, rk4Step } from '../../src/physics';
import type { OdeRhs } from '../../src/physics';

describe('rk4Step', () => {
  it('exponential decay y′ = −k y matches the analytic solution', () => {
    const k = 3;
    const f: OdeRhs = (_t, y) => [-k * (y[0] as number)];
    let y = [1];
    let t = 0;
    for (let i = 0; i < 240; i++) {
      y = rk4Step(f, t, y, PHYSICS_DT);
      t += PHYSICS_DT;
    }
    expect(Math.abs((y[0] as number) - Math.exp(-k * t)) / Math.exp(-k * t)).toBeLessThan(1e-9);
  });

  it('is 4th order: halving dt divides the error by ≈ 16', () => {
    const f: OdeRhs = (_t, y) => [-(y[0] as number)];
    const err = (h: number) => {
      let y = [1];
      const n = Math.round(1 / h);
      for (let i = 0; i < n; i++) y = rk4Step(f, i * h, y, h);
      return Math.abs((y[0] as number) - Math.exp(-1));
    };
    const ratio = err(0.1) / err(0.05);
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(18);
  });

  it('harmonic oscillator: relative energy drift < 1e-6 over 10 s at dt = 1/240', () => {
    const w = 2 * Math.PI; // 1 Hz
    const f: OdeRhs = (_t, [x = 0, v = 0]) => [v, -w * w * x];
    const energy = ([x = 0, v = 0]: readonly number[]) => 0.5 * v * v + 0.5 * w * w * x * x;
    let y = [1, 0];
    const E0 = energy(y);
    const n = Math.round(10 / PHYSICS_DT);
    for (let i = 0; i < n; i++) y = rk4Step(f, i * PHYSICS_DT, y, PHYSICS_DT);
    expect(Math.abs(energy(y) - E0) / E0).toBeLessThan(1e-6);
    expect(y[0]).toBeCloseTo(Math.cos(w * n * PHYSICS_DT), 6);
  });

  it('uses t (non-autonomous): y′ = 2t ⇒ y = t² exactly', () => {
    let y = [0];
    for (let i = 0; i < 10; i++) y = rk4Step((t) => [2 * t], i * 0.1, y, 0.1);
    expect(y[0]).toBeCloseTo(1, 12);
  });

  it('does not mutate the input state and returns a new array', () => {
    const y0 = Object.freeze([1, 2]) as readonly number[];
    const out = rk4Step((_t, y) => [y[1] as number, -(y[0] as number)], 0, y0, 0.1);
    expect(y0).toEqual([1, 2]);
    expect(out).not.toBe(y0);
  });

  it('dt = 0 returns a copy; negative dt integrates backwards', () => {
    const y0 = [5];
    const same = rk4Step(() => [1], 0, y0, 0);
    expect(same).toEqual([5]);
    expect(same).not.toBe(y0);
    const back = rk4Step((_t, y) => [-(y[0] as number)], 1, [Math.exp(-1)], -1e-3);
    expect(back[0]).toBeCloseTo(Math.exp(-1 + 1e-3), 12);
  });

  it('work buffers (QA-038): identical numbers, result in work.out, in place allowed', () => {
    const f = (_t: number, y: readonly number[]): number[] => [
      y[1] as number,
      -(y[0] as number) - 0.1 * (y[1] as number),
    ];
    const work = createRk4Work(2);
    let a: number[] = [1, 0];
    let b: number[] = [1, 0];
    for (let i = 0; i < 100; i++) {
      a = rk4Step(f, i * 0.01, a, 0.01);
      b = rk4Step(f, i * 0.01, b, 0.01, work); // b aliases work.out after the first step
    }
    expect(b).toBe(work.out);
    expect(b).toEqual(a); // bit-identical arithmetic
    // dt = 0 copies into out; the input is not mutated when out is another array
    const y0 = Object.freeze([3, 4]) as readonly number[];
    const w2 = createRk4Work(1); // resized to the state length
    expect(rk4Step(f, 0, y0, 0, w2)).toEqual([3, 4]);
    expect(rk4Step(f, 0, y0, 0.1, w2)).toEqual(rk4Step(f, 0, y0, 0.1));
    expect(y0).toEqual([3, 4]);
    expect(() => rk4Step(() => [0, 0], 0, [1], 0.1, createRk4Work(1))).toThrow(RangeError);
    expect(() => rk4Step(() => [0], 0, [1], NaN, createRk4Work(1))).toThrow(RangeError);
  });

  it('rejects non-finite t/dt and wrong-length derivatives', () => {
    expect(() => rk4Step(() => [0], 0, [1], NaN)).toThrow(RangeError);
    expect(() => rk4Step(() => [0], Infinity, [1], 0.1)).toThrow(RangeError);
    expect(() => rk4Step(() => [0, 0], 0, [1], 0.1)).toThrow(RangeError);
  });
});
