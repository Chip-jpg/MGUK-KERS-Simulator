import { describe, expect, it } from 'vitest';
import { magneticEnergy, rlCurrent, thermalSteadyState } from '../../../src/physics';
import {
  MAX_CELLS,
  RESISTOR_THERMAL,
  cellCount,
  circuitPowers,
  currentRef,
  lineFraction,
} from '../../../src/sims/rl-energy/visual';

describe('rl-energy visual scales', () => {
  it('cells ∝ E (1,5 V each), at least 1, capped', () => {
    expect(cellCount(12)).toBe(8);
    expect(cellCount(1)).toBe(1);
    expect(cellCount(0)).toBe(1);
    expect(cellCount(24)).toBe(MAX_CELLS);
    expect(cellCount(Number.NaN)).toBe(1);
  });

  it('field-line fraction ∝ i / I_ref with a 1-2-5 reference above I₀', () => {
    expect(currentRef(3)).toBe(5);
    expect(currentRef(5)).toBe(5);
    expect(currentRef(0.12)).toBeCloseTo(0.2, 12);
    expect(lineFraction(0, 5)).toBe(0);
    expect(lineFraction(2.5, 5)).toBe(0.5);
    expect(lineFraction(-2.5, 5)).toBe(0.5);
    expect(lineFraction(9, 5)).toBe(1);
    expect(lineFraction(1, 0)).toBe(0);
    // at t = τ the field shows 63,2 % of the steady-state lines
    const i = rlCurrent(12, 4, 0.2, 0.05);
    expect(lineFraction(i, 3)).toBeCloseTo(1 - Math.exp(-1), 9);
  });

  it('powers: generator = Joule + field, field power = L·i·di/dt', () => {
    const E = 12;
    const R = 4;
    const L = 0.2;
    for (const t of [0, 0.01, 0.05, 0.2]) {
      const i = rlCurrent(E, R, L, t);
      const p = circuitPowers(E, R, i);
      expect(p.gen).toBeCloseTo(p.joule + p.field, 12);
      const didt = (E - R * i) / L;
      expect(p.field).toBeCloseTo(L * i * didt, 9);
      // d(½Li²)/dt numerically
      const h = 1e-7;
      const dU = (magneticEnergy(L, rlCurrent(E, R, L, t + h)) - magneticEnergy(L, i)) / h;
      expect(p.field).toBeCloseTo(dU, 3);
    }
    expect(circuitPowers(E, R, 0)).toEqual({ gen: 0, joule: 0, field: 0 });
  });

  it('resistor wire: illustrative τ = C/hA = 0,5 s, steady rise P/hA', () => {
    expect(RESISTOR_THERMAL.C / RESISTOR_THERMAL.hA).toBeCloseTo(0.5, 12);
    const T = thermalSteadyState(36, RESISTOR_THERMAL.hA, RESISTOR_THERMAL.Tamb);
    expect(T - RESISTOR_THERMAL.Tamb).toBeCloseTo(72, 9);
  });
});
