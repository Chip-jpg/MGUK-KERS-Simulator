import { describe, expect, it } from 'vitest';
import {
  BATTERY_CAPACITY_J,
  IDX,
  defaultParams,
  flywheelRadius,
  initialState,
  params,
  simulate,
  socStep,
} from '../../../src/sims/alternator-motor/model';

describe('scene-side quantities', () => {
  it('SOC rises with the energy sent to the battery (generator) and falls in motor mode', () => {
    const p = defaultParams();
    const g0 = initialState('generator', p);
    const g1 = simulate('generator', p, 1, 1 / 240, g0);
    const eOut = (g1.y[IDX.eOut] as number) - (g0.y[IDX.eOut] as number);
    expect(eOut).toBeGreaterThan(0);
    expect(socStep(0.5, 'generator', g0, g1)).toBeCloseTo(0.5 + eOut / BATTERY_CAPACITY_J, 12);
    const m0 = initialState('motor', p);
    const m1 = simulate('motor', p, 1, 1 / 240, m0);
    const eIn = (m1.y[IDX.eIn] as number) - (m0.y[IDX.eIn] as number);
    expect(eIn).toBeGreaterThan(0);
    expect(socStep(0.5, 'motor', m0, m1)).toBeCloseTo(0.5 - eIn / BATTERY_CAPACITY_J, 12);
    expect(socStep(1, 'generator', g0, g1)).toBe(1);
    expect(socStep(0, 'motor', m0, m1)).toBe(0);
  });

  it('flywheel radius ∝ J^¼ (disc of fixed thickness)', () => {
    expect(flywheelRadius(params.J.max)).toBeCloseTo(1.35, 12);
    expect(flywheelRadius(params.J.max / 16)).toBeCloseTo(1.35 / 2, 12);
    expect(flywheelRadius(-1)).toBe(0);
  });
});
