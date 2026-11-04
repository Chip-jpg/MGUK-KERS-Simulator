import { describe, expect, it } from 'vitest';
import { createBattery, DEFAULT_BATTERY } from '../../../src/physics/battery';
import { kersBrakingEvent, kersDissipationSplit } from '../../../src/physics/vehicle';
import {
  defaultParams,
  params as kersParams,
  PRESETS,
  stateAt,
  summarize,
  toSI,
} from '../../../src/sims/kers-braking/model';
import {
  brakingStateAt,
  brakingStateAtTime,
  K_E,
  MGUK_MAX_RPM,
  MGUK_MAX_RPM_BY_ERA,
  MGUK_MAX_TORQUE_CRANK_NM_BY_ERA,
  K_E_BY_ERA,
  ROTOR_SPEED_PER_VEHICLE_SPEED,
} from '../../../src/sims/mguk-teardown/model';

describe('MGU-K teardown braking readouts', () => {
  it('keeps era limits and the original default machine constants', () => {
    expect(MGUK_MAX_RPM_BY_ERA).toEqual({ '2025': 50_000, '2026': 60_000 });
    expect(MGUK_MAX_TORQUE_CRANK_NM_BY_ERA).toEqual({ '2025': 200, '2026': 500 });
    expect(MGUK_MAX_RPM).toBe(50_000);
    // Original mapping: 360 km/h = 100 m/s; ω = 50000 · 2π/60 rad/s.
    // ω/v = 50π/3 rad/m; K_E = 800/ω = 0.48/π V·s/rad.
    expect(ROTOR_SPEED_PER_VEHICLE_SPEED).toBeCloseTo((50 * Math.PI) / 3, 12);
    expect(K_E).toBeCloseTo(0.48 / Math.PI, 12);
    expect(K_E).toBe(K_E_BY_ERA['2025']);
    // 2026: ωmax = 60000 · 2π/60; K_E = 800/ωmax = 0.4/π.
    expect(K_E_BY_ERA['2026']).toBeCloseTo(0.4 / Math.PI, 12);
    const params = { ...defaultParams(), v1: 360 };
    expect(brakingStateAt(0, params, 0, '2026').rpm).toBeCloseTo(60_000, 9);
    expect(brakingStateAt(0, params, 0, '2026').emf).toBeCloseTo(800, 9);
  });

  it('matches the existing state and hand calculation at half the default event', () => {
    const params = defaultParams();
    const existing = stateAt(params, params.tBrake / 2);
    const state = brakingStateAt(0.5);
    // t = 1.5 s; v = (300 + 100)/2/3.6 = 55.555… m/s.
    // Always capped: stored = 120000 * 1.5 = 180000 J; pKers = 120000 W.
    expect(state.t).toBe(1.5);
    expect(state.v).toBeCloseTo(200 / 3.6, 12);
    expect(state.recovered).toBeCloseTo(180_000, 6);
    expect(state.pKers).toBeCloseTo(120_000, 6);
    expect(state.v).toBe(existing.v);
    expect(state.x).toBe(existing.x);
    expect(state.recovered).toBe(existing.stored);
    expect(state.pKers).toBeCloseTo(existing.pKers, 6);
    expect(state.pMech).toBeCloseTo(120_000 / params.eta, 6);
    expect(state.pBrakes).toBeCloseTo(existing.pBrakes - (state.pMech - state.pKers), 6);
    expect(state.powerCapActive).toBe(true);
    expect(state.omega).toBe(state.v * ROTOR_SPEED_PER_VEHICLE_SPEED);
    expect(state.rpm).toBeCloseTo((state.omega * 60) / (2 * Math.PI), 9);
    expect(state.torque * state.omega).toBeCloseTo(state.pMech, 6);
    // At 200 km/h: emf = 200/360 * 800 V; I = 120000/(4000/9) = 270 A.
    expect(state.emf).toBeCloseTo((200 / 360) * 800, 9);
    expect(state.emf).toBe(K_E * state.omega);
    expect(state.current).toBeCloseTo(270, 9);
    expect(state.emf * state.current).toBeCloseTo(state.pKers, 6);
    expect(state.batteryEnergy).toBe(createBattery().energy + state.recovered);
    expect(state.soc).toBe((createBattery().energy + state.recovered) / DEFAULT_BATTERY.capacity);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('starts with an empty energy ledger and ends with the existing event totals', () => {
    const params = defaultParams();
    const start = brakingStateAt(0);
    expect(start.t).toBe(0);
    expect(start.v).toBe(toSI(params).v1);
    expect(start.x).toBe(0);
    expect(start.rpm).toBeCloseTo((300 / 360) * 50_000, 8);
    expect(start.emf).toBeCloseTo((300 / 360) * 800, 9);
    expect(start.batteryEnergy).toBe(createBattery().energy);
    expect(start.soc).toBe(createBattery().energy / DEFAULT_BATTERY.capacity);
    for (const key of ['recovered', 'brakeHeat', 'mgukLoss', 'released'] as const) {
      expect(start[key]).toBe(0);
    }
    expect(start.pKers).toBeCloseTo(stateAt(params, 0).pKers, 6);
    const end = brakingStateAt(1);
    const event = kersBrakingEvent(toSI(params));
    const split = kersDissipationSplit(event);
    expect(end.t).toBe(params.tBrake);
    expect(end.v).toBe(toSI(params).v2);
    expect(end.x).toBe(stateAt(params, params.tBrake).x);
    expect(end.recovered).toBe(event.recovered);
    expect(end.brakeHeat).toBe(split.brakes);
    expect(end.mgukLoss).toBe(split.mguk);
    expect(end.released).toBe(event.dEk);
    expect(end.pKers).toBe(0);
    expect(end.pMech).toBe(0);
    expect(end.pBrakes).toBe(0);
    expect(end.current).toBe(0);
    expect(end.torque).toBe(0);
    expect(end.powerCapActive).toBe(false);
  });

  it('clamps phase and time and rejects NaN', () => {
    expect(brakingStateAt(-2)).toEqual(brakingStateAt(0));
    expect(brakingStateAt(2)).toEqual(brakingStateAt(1));
    expect(brakingStateAt(-Infinity)).toEqual(brakingStateAt(0));
    expect(brakingStateAt(Infinity)).toEqual(brakingStateAt(1));
    expect(brakingStateAtTime(-1)).toEqual(brakingStateAt(0));
    expect(brakingStateAtTime(100)).toEqual(brakingStateAt(1));
    expect(brakingStateAtTime(defaultParams().tBrake / 2)).toEqual(brakingStateAt(0.5));
    expect(() => brakingStateAt(NaN)).toThrow(RangeError);
  });

  for (const preset of PRESETS) {
    it(`${preset.id}: bounds power and SoC and balances energy throughout the event`, () => {
      const params = preset.values;
      let previousSoc = createBattery().energy / DEFAULT_BATTERY.capacity;
      for (let i = 0; i <= 100; i++) {
        const state = brakingStateAt(i / 100, params);
        expect(state.pKers).toBeGreaterThanOrEqual(0);
        expect(state.pKers).toBeLessThanOrEqual(toSI(params).Pmax);
        expect(state.soc).toBeGreaterThanOrEqual(previousSoc);
        expect(state.soc).toBeLessThanOrEqual(1);
        expect(state.released).toBeCloseTo(state.recovered + state.brakeHeat + state.mgukLoss, 6);
        previousSoc = state.soc;
      }
      expect(brakingStateAt(1, params).recovered).toBe(summarize(params).result.recovered);
    });
  }

  it('handles the transition from capped recovery to rest with finite torque and current', () => {
    const params = { ...defaultParams(), v2: 0 };
    expect(brakingStateAt(0, params).powerCapActive).toBe(true);
    for (const phase of [0.99, 0.999999, 1 - Number.EPSILON, 1]) {
      const state = brakingStateAt(phase, params);
      expect(Number.isFinite(state.torque)).toBe(true);
      expect(Number.isFinite(state.current)).toBe(true);
      expect(state.powerCapActive).toBe(false);
      expect(state.torque * state.omega).toBeCloseTo(state.pMech, 6);
      expect(state.released).toBeCloseTo(state.recovered + state.brakeHeat + state.mgukLoss, 6);
    }
    expect(brakingStateAt(1, params).omega).toBe(0);
    expect(brakingStateAt(1, params).torque).toBe(0);
    expect(brakingStateAt(1, params).current).toBe(0);
  });

  it('preserves the zero-efficiency, zero-cap and non-braking cases', () => {
    for (const changes of [{ eta: 0 }, { Pmax: 0 }, { v1: 0, v2: 0 }, { v2: 360 }]) {
      const params = { ...defaultParams(), ...changes };
      const state = brakingStateAt(0.5, params);
      expect(state.recovered).toBe(0);
      expect(state.pKers).toBe(0);
      expect(Number.isFinite(state.current)).toBe(true);
      expect(state.powerCapActive).toBe(false);
      expect(Number.isFinite(state.torque)).toBe(true);
      expect(state.released).toBeCloseTo(state.brakeHeat + state.mgukLoss, 6);
    }
  });

  it('maps the maximum slider speed to the rotor limit throughout braking', () => {
    const params = { ...defaultParams(), v1: kersParams.v1.max, v2: 0 };
    expect(brakingStateAt(0, params).rpm).toBeCloseTo(MGUK_MAX_RPM, 9);
    expect(brakingStateAt(0, params).emf).toBeCloseTo(DEFAULT_BATTERY.voltage, 9);
    for (let i = 0; i <= 100; i++) {
      expect(brakingStateAt(i / 100, params).rpm).toBeLessThanOrEqual(MGUK_MAX_RPM);
    }
  });

  it('accepts custom initial SoC and accounts for it when checking capacity', () => {
    const params = defaultParams();
    const state = brakingStateAt(0.5, params, 0.25);
    expect(state.batteryEnergy).toBe(0.25 * DEFAULT_BATTERY.capacity + state.recovered);
    expect(state.soc).toBe(state.batteryEnergy / DEFAULT_BATTERY.capacity);
    expect(brakingStateAtTime(params.tBrake / 2, params, 0.25)).toEqual(state);
    expect(brakingStateAt(0, params, 0).soc).toBe(0);
    expect(brakingStateAt(0, { ...params, Pmax: 0 }, 1).soc).toBe(1);
    expect(() => brakingStateAt(0, params, 1)).toThrow(RangeError);
    for (const initialSoc of [-0.01, 1.01, NaN, Infinity, -Infinity]) {
      expect(() => brakingStateAt(0, params, initialSoc)).toThrow(RangeError);
      expect(() => brakingStateAtTime(0, params, initialSoc)).toThrow(RangeError);
    }
  });

  it('rejects invalid parameters and events that would overfill the virtual battery', () => {
    expect(() => brakingStateAt(0, { ...defaultParams(), tBrake: 0 })).toThrow(RangeError);
    expect(() => brakingStateAt(0, { ...defaultParams(), eta: -1 })).toThrow(RangeError);
    expect(() =>
      brakingStateAt(0, { ...defaultParams(), m: 1200, v1: 360, v2: 0, Pmax: 500, tBrake: 20 }),
    ).toThrow('recovered energy exceeds battery capacity');
  });
});
