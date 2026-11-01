import { describe, expect, it } from 'vitest';
import {
  batteryStep,
  createBattery,
  DEFAULT_BATTERY,
  DEFAULT_DRIVE,
  createDriveState,
  kersDriveStep,
  kineticEnergyDelta,
  kmhToMs,
  amplitudeRange,
  finiteRange,
  rangeTicks,
  transmissionSweep,
} from '../../src/physics';

describe('finite battery', () => {
  const spec = { ...DEFAULT_BATTERY, capacity: 100, resistance: 0.1, voltage: 20 };
  it('limits output to available energy, cuts off and requires 5 % before restarting', () => {
    let b = batteryStep(createBattery(spec, 0.1), 1000, 1, spec);
    expect(b.state.energy).toBe(0);
    expect(b.state.depleted).toBe(true);
    expect(b.power + b.loss).toBeCloseTo(10, 9);
    expect(batteryStep(b.state, 1000, 1, spec).power).toBe(0);
    b = batteryStep(b.state, -2, 1, spec);
    expect(b.state.depleted).toBe(true);
    expect(batteryStep(b.state, 1000, 1, spec).power).toBe(0);
    b = batteryStep(b.state, -10, 1, spec);
    expect(b.state.depleted).toBe(false);
    expect(batteryStep(b.state, 2, 0.1, spec).power).toBeGreaterThan(0);
  });
  it('conserves terminal + store + heat energy and never overcharges', () => {
    for (const power of [-10000, -50, 0, 50, 10000]) {
      const start = createBattery(spec, 0.5);
      const b = batteryStep(start, power, 0.5, spec);
      expect(b.state.energy).toBeGreaterThanOrEqual(0);
      expect(b.state.energy).toBeLessThanOrEqual(spec.capacity);
      expect(start.energy - b.state.energy).toBeCloseTo((b.power + b.loss) * 0.5, 9);
      expect(b.loss).toBeGreaterThanOrEqual(0);
    }
    const full = batteryStep(createBattery(spec, 1), -100, 1, spec);
    expect(Math.abs(full.power)).toBeLessThan(1e-9);
  });
});

describe('longitudinal drive', () => {
  it('redirects all regenerative demand to discs when the store is full', () => {
    const p = { ...DEFAULT_DRIVE };
    const r = kersDriveStep(createDriveState(p, 30, 1), { throttle: 1, brake: 1 }, 1 / 240, p);
    expect(r.pKers).toBe(0);
    expect(r.pEngine).toBe(0);
    expect(r.pBrakes).toBeGreaterThan(0);
    expect(r.a).toBeLessThan(0);
    expect(r.state.battery.energy).toBe(p.battery.capacity);
  });
  it('matches the 800 kg, 300 → 100 km/h example', () => {
    expect(kineticEnergyDelta(800, kmhToMs(300), kmhToMs(100)) / 1e6).toBeCloseTo(2.4691358, 6);
  });
  it('accelerates, harvests and balances kinetic + battery + dissipated energy', () => {
    const p = { ...DEFAULT_DRIVE };
    let s = createDriveState(p, 10, 0.5);
    const initial = 0.5 * p.mass * s.v ** 2 + s.battery.energy;
    for (let i = 0; i < 2400; i++) {
      const r = kersDriveStep(
        s,
        { throttle: i < 1200 ? 1 : 0, brake: i >= 1200 ? 0.6 : 0 },
        1 / 240,
        p,
      );
      s = r.state;
      if (i === 1000) {
        expect(r.a).toBeGreaterThan(0);
        expect(r.pKers).toBeGreaterThan(0);
      }
      if (i === 1300) {
        expect(r.a).toBeLessThan(0);
        expect(r.pKers).toBeLessThan(0);
      }
      const residual =
        0.5 * p.mass * s.v ** 2 + s.battery.energy + s.dissipated - initial - s.engineWork;
      expect(Math.abs(residual) / Math.max(1, initial + s.engineWork)).toBeLessThan(1e-6);
      expect(s.battery.energy).toBeGreaterThanOrEqual(0);
      expect(s.battery.energy).toBeLessThanOrEqual(p.battery.capacity);
    }
  });
  it('is deterministic and handles an empty battery, zero power and braking at rest', () => {
    const p = { ...DEFAULT_DRIVE, deployPower: 0, harvestPower: 0 };
    const initial = createDriveState(p, 0, 0);
    const a = kersDriveStep(initial, { throttle: 0, brake: 1 }, 1 / 240, p);
    expect(a.state.v).toBe(0);
    expect(a.pKers).toBe(0);
    expect(a).toEqual(kersDriveStep(initial, { throttle: 0, brake: 1 }, 1 / 240, p));
    for (const mass of [1, 500, 1200]) {
      const spec = { ...p, mass };
      expect(
        Number.isFinite(
          kersDriveStep(createDriveState(spec), { throttle: 1, brake: 0 }, 1 / 240, spec).v,
        ),
      ).toBe(true);
    }
    expect(() => createDriveState({ ...p, mass: 0 })).toThrow(RangeError);
  });
});

describe('plot ranges', () => {
  it('labels the zero-amplitude range with distinct finite ticks', () => {
    const ticks = rangeTicks(...amplitudeRange(0));
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });
  it.each([0, 1e-12, 1, 7500, Infinity, NaN])(
    'provides finite non-degenerate ranges for %s',
    (a) => {
      const range = amplitudeRange(a);
      expect(range.every(Number.isFinite)).toBe(true);
      expect(range[1]).toBeGreaterThan(range[0]);
    },
  );
  it('protects empty, constant and invalid automatic data', () => {
    for (const r of [finiteRange(0, 0), finiteRange(3, 3), finiteRange(NaN, Infinity)])
      expect(r[1]).toBeGreaterThan(r[0]);
  });
});

describe('transmission sweep', () => {
  it('covers 1–400 kV and includes the exact operating point', () => {
    const rows = transmissionSweep(10e6, 5, 200e3);
    expect(rows[0]?.V).toBe(1000);
    expect(rows.at(-1)?.V).toBe(400000);
    expect(rows.find((r) => r.V === 200000)).toMatchObject({
      I: 50,
      loss: 12500,
      fraction: 0.00125,
    });
    for (const row of rows) expect(row.loss).toBeCloseTo(5 * row.I ** 2, 6);
  });
});
