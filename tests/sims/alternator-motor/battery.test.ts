import { describe, expect, it } from 'vitest';
import { DEFAULT_BATTERY, createBattery } from '../../../src/physics/battery';
import {
  batteryMachineStep,
  defaultParams,
  initialState,
  instant,
} from '../../../src/sims/alternator-motor/model';

describe('machine battery cutoff regression F9', () => {
  const spec = { ...DEFAULT_BATTERY, capacity: 1, chargePower: 1000, dischargePower: 1000 };
  it('exhausts finite energy, opens the circuit, coasts and recharges in generator mode', () => {
    const p = defaultParams();
    let s = initialState('motor', p);
    let b = createBattery(spec, 0.1);
    for (let i = 0; i < 480; i++) {
      const r = batteryMachineStep('motor', p, s, b, 1 / 240, spec);
      s = r.state;
      b = r.battery;
    }
    expect(b.depleted).toBe(true);
    expect(b.energy).toBe(0);
    expect(s.y[2]).toBeLessThanOrEqual(0.1 * spec.dischargeEfficiency + 1e-8);
    const q = instant('motor', p, s.y[0]!, s.y[1]!, !b.depleted);
    expect(q.tauEm).toBe(0);
    expect(q.i).toBe(0);
    const omega = s.y[1]!;
    const coast = batteryMachineStep('motor', p, s, b, 0.02, spec);
    expect(coast.state.y[1]!).toBeLessThanOrEqual(omega);
    s = initialState('generator', p);
    for (let i = 0; i < 240; i++) {
      const r = batteryMachineStep('generator', p, s, b, 1 / 240, spec);
      s = r.state;
      b = r.battery;
    }
    expect(b.energy).toBeGreaterThan(0.05);
    expect(b.depleted).toBe(false);
  });
});
