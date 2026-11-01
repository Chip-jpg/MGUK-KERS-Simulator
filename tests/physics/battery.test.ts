import { describe, expect, it } from 'vitest';
import {
  batteryLimits,
  batteryStep,
  createBattery,
  DEFAULT_RESTART_SOC,
  DEMO_BATTERY_4MJ,
  PHYSICS_DT,
  type BatteryParams,
  type BatteryState,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

const P: BatteryParams = { ...DEMO_BATTERY_4MJ };
const dt = PHYSICS_DT;

/** E_in − E_out − E_loss − C·soc: constant for a closed balance. */
function invariant(p: BatteryParams, s: BatteryState): number {
  return s.eIn - s.eOut - s.eLoss - s.soc * p.capacityJ;
}

describe('createBattery', () => {
  it('starts at soc0 with zero counters; depleted only at soc0 = 0', () => {
    const s = createBattery(P, 0.5);
    expect(s).toEqual({ soc: 0.5, depleted: false, eIn: 0, eOut: 0, eLoss: 0 });
    expect(createBattery(P, 0).depleted).toBe(true);
    expect(DEFAULT_RESTART_SOC).toBe(0.05);
  });

  it('rejects invalid parameters', () => {
    expect(() => createBattery(P, -0.1)).toThrow(RangeError);
    expect(() => createBattery(P, 1.1)).toThrow(RangeError);
    expect(() => createBattery({ ...P, capacityJ: 0 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, etaCharge: 0 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, etaDischarge: 1.2 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, etaDischarge: Number.NaN }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, rInternal: -1 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, vNominal: 0 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, pChargeMax: -1 }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, pDischargeMax: Infinity }, 0.5)).toThrow(RangeError);
    expect(() => createBattery({ ...P, restartSoc: 2 }, 0.5)).toThrow(RangeError);
    const s = createBattery(P, 0.5);
    expect(() => batteryLimits(P, s, 0)).toThrow(RangeError);
    expect(() => batteryStep(P, s, Number.NaN, dt)).toThrow(RangeError);
    expect(() => batteryStep(P, { ...s, soc: 1.5 }, 0, dt)).toThrow(RangeError);
  });
});

describe('batteryStep: model and energy balance', () => {
  it('discharge: drawn = P/η_d + R·(P/V)², loss = drawn − delivered', () => {
    const s = createBattery(P, 0.5);
    const r = batteryStep(P, s, 100_000, 1);
    const I = 100_000 / P.vNominal;
    const drawn = 100_000 / P.etaDischarge + P.rInternal * I * I;
    expect(r.pTerminal).toBe(100_000);
    expect(r.pLoss).toBeCloseTo(drawn - 100_000, 6);
    expect((s.soc - r.state.soc) * P.capacityJ).toBeCloseTo(drawn, 6);
    expect(r.state.eOut).toBe(100_000);
    expect(r.state.eIn).toBe(0);
  });

  it('charge: stored = η_c·P − R·(P/V)², loss = absorbed − stored', () => {
    const s = createBattery(P, 0.5);
    const r = batteryStep(P, s, -100_000, 1);
    const I = 100_000 / P.vNominal;
    const stored = P.etaCharge * 100_000 - P.rInternal * I * I;
    expect(r.pTerminal).toBe(-100_000);
    expect((r.state.soc - s.soc) * P.capacityJ).toBeCloseTo(stored, 6);
    expect(r.pLoss).toBeCloseTo(100_000 - stored, 6);
    expect(r.state.eIn).toBe(100_000);
  });

  it('ideal store (η = 1, R = 0) is lossless; zero request does nothing', () => {
    const ideal = { ...P, etaCharge: 1, etaDischarge: 1, rInternal: 0 };
    const s = createBattery(ideal, 0.5);
    const r = batteryStep(ideal, s, -200_000, 2);
    expect(r.pLoss).toBeLessThan(1e-9); // rounding of C·Δsoc only
    expect(r.state.soc).toBeCloseTo(0.5 + 0.1, 15);
    const z = batteryStep(P, s, 0, dt);
    expect(z.state).toEqual(s);
    expect(z.pTerminal).toBe(0);
    expect(z.pLoss).toBe(0);
  });

  it('power limits clip the request (same sign, |granted| ≤ |request|)', () => {
    const s = createBattery(P, 0.5);
    expect(batteryStep(P, s, 1e9, dt).pTerminal).toBe(P.pDischargeMax);
    expect(batteryStep(P, s, -1e9, dt).pTerminal).toBe(-P.pChargeMax);
    expect(batteryStep({ ...P, pChargeMax: 0 }, s, -1e5, dt).pTerminal).toBe(0);
    expect(batteryStep({ ...P, pDischargeMax: 0 }, s, 1e5, dt).pTerminal).toBe(0);
  });

  it('charge cap at the stored-power peak η_c V²/(2R) for a lossy store', () => {
    const lossy = { ...P, rInternal: 10, vNominal: 100, pChargeMax: 1e6 };
    const s = createBattery(lossy, 0.5);
    const peak = (lossy.etaCharge * 100 * 100) / (2 * 10);
    expect(batteryLimits(lossy, s, dt).pHarvestMax).toBeCloseTo(peak, 9);
    const r = batteryStep(lossy, s, -1e6, dt);
    expect(r.pTerminal).toBeCloseTo(-peak, 9);
    expect(r.state.soc).toBeGreaterThan(s.soc);
  });

  it('property: random requests keep 0 ≤ soc ≤ 1 and close the balance', () => {
    const rnd = mulberry32(0xb4773);
    for (let trial = 0; trial < 20; trial++) {
      const p: BatteryParams = {
        capacityJ: uniform(rnd, 1e3, 5e6),
        etaCharge: uniform(rnd, 0.5, 1),
        etaDischarge: uniform(rnd, 0.5, 1),
        rInternal: uniform(rnd, 0, 1),
        vNominal: uniform(rnd, 50, 1000),
        pChargeMax: uniform(rnd, 0, 5e5),
        pDischargeMax: uniform(rnd, 0, 5e5),
        restartSoc: uniform(rnd, 0, 0.3),
      };
      let s = createBattery(p, rnd());
      const i0 = invariant(p, s);
      for (let k = 0; k < 600; k++) {
        const req = uniform(rnd, -1e6, 1e6);
        const r = batteryStep(p, s, req, uniform(rnd, 1e-4, 0.5));
        expect(r.state.soc).toBeGreaterThanOrEqual(0);
        expect(r.state.soc).toBeLessThanOrEqual(1);
        expect(r.pLoss).toBeGreaterThanOrEqual(0);
        expect(Math.abs(r.pTerminal)).toBeLessThanOrEqual(Math.abs(req));
        expect(r.pTerminal * req).toBeGreaterThanOrEqual(0);
        s = r.state;
      }
      const scale = s.eIn + s.eOut + p.capacityJ;
      expect(Math.abs(invariant(p, s) - i0) / scale).toBeLessThan(1e-9);
    }
  });
});

describe('batteryLimits: SoC headroom, depletion and hysteresis', () => {
  it('deploy at the limit lands exactly on soc = 0, then depleted with pDeployMax = 0', () => {
    const p = { ...P, capacityJ: 1000 };
    let s = createBattery(p, 0.5);
    let steps = 0;
    while (!s.depleted && steps < 10_000) {
      s = batteryStep(p, s, 1e9, dt).state;
      steps++;
    }
    expect(s.soc).toBe(0);
    expect(s.depleted).toBe(true);
    expect(batteryLimits(p, s, dt).pDeployMax).toBe(0);
    expect(batteryStep(p, s, 1e5, dt).pTerminal).toBe(0);
    expect(batteryLimits(p, s, dt).pHarvestMax).toBeGreaterThan(0); // harvest allowed
  });

  it('harvest at the limit lands exactly on soc = 1, then pHarvestMax = 0', () => {
    const p = { ...P, capacityJ: 1000 };
    let s = createBattery(p, 0.9);
    for (let k = 0; k < 1000 && s.soc < 1; k++) s = batteryStep(p, s, -1e9, dt).state;
    expect(s.soc).toBe(1);
    expect(batteryLimits(p, s, dt).pHarvestMax).toBe(0);
    expect(batteryStep(p, s, -1e5, dt).pTerminal).toBe(0);
  });

  it('a depleted store restarts only when soc ≥ restartSoc', () => {
    const p = { ...P, capacityJ: 1e5 };
    let s = createBattery(p, 0);
    expect(batteryLimits(p, s, dt).pDeployMax).toBe(0);
    let crossed = false;
    for (let k = 0; k < 100_000 && s.depleted; k++) {
      s = batteryStep(p, s, -10_000, dt).state;
      if (s.depleted) {
        expect(s.soc).toBeLessThan(p.restartSoc);
        expect(batteryLimits(p, s, dt).pDeployMax).toBe(0);
      } else crossed = true;
    }
    expect(crossed).toBe(true);
    expect(s.soc).toBeGreaterThanOrEqual(p.restartSoc);
    expect(batteryLimits(p, s, dt).pDeployMax).toBeGreaterThan(0);
  });

  it('restartSoc = 0 restarts at the first harvested joule', () => {
    const p = { ...P, restartSoc: 0 };
    const s = batteryStep(p, createBattery(p, 0), -1000, dt).state;
    expect(s.depleted).toBe(false);
  });

  it('is deterministic', () => {
    const run = (): BatteryState => {
      let s = createBattery(P, 0.3);
      for (let k = 0; k < 500; k++) s = batteryStep(P, s, Math.sin(k) * 3e5, dt).state;
      return s;
    };
    expect(run()).toEqual(run());
  });
});
