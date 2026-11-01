import { describe, expect, it } from 'vitest';
import {
  createDriveState,
  DEMO_BATTERY_4MJ,
  DEMO_CAR_800KG,
  DEMO_MGUK_120KW,
  DEMO_MGUK_350KW,
  driveEnergyAccount,
  DRIVE_V_STOP,
  kersDriveStep,
  kineticEnergyDelta,
  kmhToMs,
  PHYSICS_DT,
  speedProfileInput,
  type DriveInput,
  type DriveParams,
  type DriveState,
  type DriveStepResult,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

const dt = PHYSICS_DT;
const DEMO: DriveParams = {
  vehicle: { ...DEMO_CAR_800KG },
  mguk: { ...DEMO_MGUK_120KW },
  battery: { ...DEMO_BATTERY_4MJ },
};

/** E_k + E_stored + dissipated − engine (constant for a closed balance). */
function total(s: DriveState, p: DriveParams): number {
  const a = driveEnergyAccount(s, p);
  return a.kinetic + a.stored + a.dissipated - a.engine;
}

/** Scale for relative errors: every energy that flowed. */
function scale(s: DriveState, p: DriveParams): number {
  const a = driveEnergyAccount(s, p);
  return a.kinetic + a.stored + a.dissipated + a.engine + s.eDeploy + s.eHarvest;
}

function run(
  p: DriveParams,
  s0: DriveState,
  n: number,
  input: (k: number, s: DriveState) => DriveInput,
  each?: (r: DriveStepResult, s: DriveState) => void,
): DriveState {
  let s = s0;
  for (let k = 0; k < n; k++) {
    const r = kersDriveStep(s, input(k, s), p, dt);
    each?.(r, s);
    s = r.state;
  }
  return s;
}

describe('createDriveState', () => {
  it('starts at rest with zero counters', () => {
    const s = createDriveState(DEMO, 30, 0.5);
    expect(s.v).toBe(30);
    expect(s.t).toBe(0);
    expect(s.battery.soc).toBe(0.5);
    expect(s.eEngine + s.eDeploy + s.eHarvest + s.eBrakes + s.eDrag + s.eRoll).toBe(0);
  });
  it('rejects invalid input', () => {
    expect(() => createDriveState(DEMO, -1, 0.5)).toThrow(RangeError);
    expect(() => createDriveState(DEMO, 1, 2)).toThrow(RangeError);
    expect(() => createDriveState({ ...DEMO, vehicle: { ...DEMO.vehicle, m: 0 } }, 1, 0.5)).toThrow(
      RangeError,
    );
    expect(() => createDriveState({ ...DEMO, mguk: { ...DEMO.mguk, eta: 0 } }, 1, 0.5)).toThrow(
      RangeError,
    );
    expect(() =>
      createDriveState({ ...DEMO, mguk: { ...DEMO.mguk, pDeployMax: -1 } }, 1, 0.5),
    ).toThrow(RangeError);
    const s = createDriveState(DEMO, 1, 0.5);
    expect(() => kersDriveStep(s, { throttle: 1.1, brake: 0 }, DEMO, dt)).toThrow(RangeError);
    expect(() => kersDriveStep(s, { throttle: 0, brake: -0.1 }, DEMO, dt)).toThrow(RangeError);
    expect(() => kersDriveStep(s, { throttle: Number.NaN, brake: 0 }, DEMO, dt)).toThrow(
      RangeError,
    );
    expect(() => kersDriveStep(s, { throttle: 0, brake: 0 }, DEMO, 0)).toThrow(RangeError);
  });
});

describe('kersDriveStep: energy balance', () => {
  it('long mixed throttle/brake run closes the balance (≤ 1e-9 relative)', () => {
    const rnd = mulberry32(0x5eed);
    const s0 = createDriveState(DEMO, 0, 0.6);
    const t0 = total(s0, DEMO);
    let input: DriveInput = { throttle: 0, brake: 0 };
    const s = run(DEMO, s0, 240 * 120, (k) => {
      if (k % 120 === 0) {
        const c = rnd();
        input =
          c < 0.45
            ? { throttle: rnd(), brake: 0 }
            : c < 0.8
              ? { throttle: 0, brake: rnd() }
              : c < 0.9
                ? { throttle: rnd(), brake: rnd() }
                : { throttle: 0, brake: 0 };
      }
      return input;
    });
    const err = Math.abs(total(s, DEMO) - t0) / scale(s, DEMO);
    expect(err).toBeLessThan(1e-9);
    expect(s.eHarvest).toBeGreaterThan(0);
    expect(s.eDeploy).toBeGreaterThan(0);
    expect(s.eBrakes).toBeGreaterThan(0);
  });

  it('property: random params and inputs keep v ≥ 0, 0 ≤ soc ≤ 1, balance ≤ 1e-6', () => {
    const rnd = mulberry32(42);
    for (let trial = 0; trial < 8; trial++) {
      const p: DriveParams = {
        vehicle: {
          m: uniform(rnd, 100, 3000),
          cdA: uniform(rnd, 0, 2),
          rho: uniform(rnd, 0, 1.3),
          crr: uniform(rnd, 0, 0.03),
          fDriveMax: uniform(rnd, 0, 20_000),
          pEngineMax: uniform(rnd, 0, 600_000),
          fBrakeMax: uniform(rnd, 0, 40_000),
        },
        mguk: {
          pDeployMax: uniform(rnd, 0, 400_000),
          pHarvestMax: uniform(rnd, 0, 400_000),
          eta: uniform(rnd, 0.5, 1),
        },
        battery: {
          ...DEMO_BATTERY_4MJ,
          capacityJ: uniform(rnd, 1e4, 4e6),
          rInternal: uniform(rnd, 0, 0.5),
        },
      };
      const s0 = createDriveState(p, uniform(rnd, 0, 90), rnd());
      const t0 = total(s0, p);
      const s = run(
        p,
        s0,
        1500,
        () => ({ throttle: rnd() < 0.5 ? rnd() : 0, brake: rnd() < 0.5 ? rnd() : 0 }),
        (r) => {
          expect(r.v).toBeGreaterThanOrEqual(0);
          expect(r.soc).toBeGreaterThanOrEqual(0);
          expect(r.soc).toBeLessThanOrEqual(1);
          expect(r.pBrakes).toBeGreaterThanOrEqual(0);
          expect(Math.abs(r.pKers)).toBeLessThanOrEqual(
            Math.max(p.mguk.pDeployMax, p.mguk.pHarvestMax) * (1 + 1e-12),
          );
        },
      );
      expect(Math.abs(total(s, p) - t0) / scale(s, p)).toBeLessThan(1e-6);
    }
  });
});

describe('kersDriveStep: braking 300 → 100 km/h, 800 kg', () => {
  const v1 = kmhToMs(300);
  const v2 = kmhToMs(100);

  it('ΔE_k ≈ 2,47 MJ (kineticEnergyDelta)', () => {
    expect(kineticEnergyDelta(800, v1, v2) / 1e6).toBeCloseTo(2.469, 3);
  });

  it('drive model without drag/roll: harvest + discs + MGU-K loss = ΔE_k', () => {
    const p: DriveParams = {
      ...DEMO,
      vehicle: { ...DEMO.vehicle, cdA: 0, crr: 0 },
      battery: { ...DEMO.battery, rInternal: 0 },
    };
    let s = createDriveState(p, v1, 0.2);
    let kHarv = 0;
    while (s.v > v2) {
      const r = kersDriveStep(s, { throttle: 0, brake: 1 }, p, dt);
      if (r.mode === 'harvest') kHarv++;
      s = r.state;
    }
    const dEk = 0.5 * 800 * (v1 * v1 - s.v * s.v);
    expect(dEk / 1e6).toBeGreaterThan(2.46);
    expect((s.eHarvest + s.eBrakes) / dEk).toBeCloseTo(1, 9);
    expect(s.eHarvest).toBeGreaterThan(0);
    // harvest power at the cap of 120 kW (speed high ⇒ force cap not active)
    expect(s.eHarvest / s.t).toBeCloseTo(120_000, -1);
    expect(kHarv).toBeGreaterThan(0);
    // stored electrical side = η·mechanical (battery η_c on top)
    const stored = (s.battery.soc - 0.2) * p.battery.capacityJ;
    expect(stored).toBeCloseTo(0.9 * s.eHarvest * p.battery.etaCharge, 3);
  });
});

describe('kersDriveStep: battery cutoff and hysteresis', () => {
  it('deploy stops at soc = 0, the ICE keeps driving, deploy restarts at restartSoc', () => {
    const p: DriveParams = {
      ...DEMO,
      battery: { ...DEMO.battery, capacityJ: 2e5 },
    };
    let s = createDriveState(p, 10, 0.3);
    // accelerate until the store is empty
    let k = 0;
    let sawCut = false;
    while (k++ < 240 * 60) {
      const r = kersDriveStep(s, { throttle: 1, brake: 0 }, p, dt);
      s = r.state;
      if (s.battery.depleted) {
        sawCut = true;
        break;
      }
      expect(r.mode).toBe('deploy');
    }
    expect(sawCut).toBe(true);
    expect(s.battery.soc).toBe(0);
    const vCut = s.v;
    const after = kersDriveStep(s, { throttle: 1, brake: 0 }, p, dt);
    expect(after.pKers).toBe(0);
    expect(after.mode).toBe('idle');
    expect(after.pEngine).toBeGreaterThan(0);
    expect(after.v).toBeGreaterThan(vCut * 0.99);
    // brake to harvest: deploy stays off until soc ≥ restartSoc
    s = after.state;
    while (s.battery.soc < p.battery.restartSoc && s.v > 1) {
      s = kersDriveStep(s, { throttle: 0, brake: 0.3 }, p, dt).state;
      if (s.battery.soc < p.battery.restartSoc) {
        expect(s.battery.depleted).toBe(true);
        expect(kersDriveStep(s, { throttle: 1, brake: 0 }, p, dt).pKers).toBe(0);
      }
    }
    expect(s.battery.soc).toBeGreaterThanOrEqual(p.battery.restartSoc);
    expect(s.battery.depleted).toBe(false);
    expect(kersDriveStep(s, { throttle: 1, brake: 0 }, p, dt).pKers).toBeGreaterThan(0);
  });

  it('soc = 0 at start: no deploy, harvest works', () => {
    const s = createDriveState(DEMO, 50, 0);
    expect(kersDriveStep(s, { throttle: 1, brake: 0 }, DEMO, dt).pKers).toBe(0);
    const h = kersDriveStep(s, { throttle: 0, brake: 1 }, DEMO, dt);
    expect(h.mode).toBe('harvest');
    expect(h.soc).toBeGreaterThan(0);
  });

  it('pDeployMax = 0 / pHarvestMax = 0 disable each direction', () => {
    const noDep = { ...DEMO, mguk: { ...DEMO.mguk, pDeployMax: 0 } };
    const noHarv = { ...DEMO, mguk: { ...DEMO.mguk, pHarvestMax: 0 } };
    const s = createDriveState(DEMO, 50, 0.5);
    expect(kersDriveStep(s, { throttle: 1, brake: 0 }, noDep, dt).pKers).toBe(0);
    const r = kersDriveStep(s, { throttle: 0, brake: 1 }, noHarv, dt);
    expect(r.pKers).toBe(0);
    expect(r.pBrakes).toBeGreaterThan(0);
    expect(r.soc).toBe(0.5);
  });

  it('full battery: no harvest, the discs take everything', () => {
    const s = createDriveState(DEMO, 50, 1);
    const r = kersDriveStep(s, { throttle: 0, brake: 1 }, DEMO, dt);
    expect(r.pKers).toBe(0);
    expect(r.mode).toBe('idle');
    expect(r.pBrakes).toBeCloseTo(DEMO.vehicle.fBrakeMax * 50, -4);
  });
});

describe('kersDriveStep: forces and limits', () => {
  it('braking at v = 0 holds the car: a = 0, no harvest, no motion', () => {
    const s = createDriveState(DEMO, 0, 0.5);
    const r = kersDriveStep(s, { throttle: 0, brake: 1 }, DEMO, dt);
    expect(r.v).toBe(0);
    expect(r.a).toBe(0);
    expect(r.pKers).toBe(0);
    expect(r.state.x).toBe(0);
    expect(r.mode).toBe('idle');
  });

  it('a braking car comes to rest and never reverses', () => {
    let s = createDriveState(DEMO, 20, 0.5);
    const s0 = total(s, DEMO);
    s = run(
      DEMO,
      s,
      240 * 5,
      () => ({ throttle: 0, brake: 1 }),
      (r) => {
        expect(r.v).toBeGreaterThanOrEqual(0);
      },
    );
    expect(s.v).toBe(0);
    expect(Math.abs(total(s, DEMO) - s0) / scale(s, DEMO)).toBeLessThan(1e-9);
  });

  it('coasting to rest: drag + rolling only', () => {
    const s = run(DEMO, createDriveState(DEMO, 5, 0.5), 240 * 60, () => ({
      throttle: 0,
      brake: 0,
    }));
    expect(s.v).toBe(0);
    expect(s.eRoll + s.eDrag).toBeCloseTo(0.5 * 800 * 25, 6);
  });

  it('launch from rest: traction-limited ICE + MGU-K, then power-limited', () => {
    const s = createDriveState(DEMO, 0, 0.5);
    const r = kersDriveStep(s, { throttle: 1, brake: 0 }, DEMO, dt);
    // both forces at the traction cap at low speed: a ≈ 2·fDriveMax/m
    expect(r.a).toBeCloseTo((2 * DEMO.vehicle.fDriveMax) / 800, 0);
    expect(r.mode).toBe('deploy');
    const fast = kersDriveStep(
      createDriveState(DEMO, 60, 0.5),
      { throttle: 1, brake: 0 },
      DEMO,
      dt,
    );
    expect(fast.pEngine).toBeCloseTo(DEMO.vehicle.pEngineMax, -3);
    expect(fast.pKers).toBeCloseTo(120_000, -3);
    const half = kersDriveStep(
      createDriveState(DEMO, 60, 0.5),
      { throttle: 0.5, brake: 0 },
      DEMO,
      dt,
    );
    expect(half.pKers).toBeCloseTo(60_000, -3);
  });

  it('350 kW MGU-K harvests more than 120 kW in the same stop', () => {
    const p350 = { ...DEMO, mguk: { ...DEMO_MGUK_350KW } };
    const brake = (p: DriveParams): number =>
      run(p, createDriveState(p, 80, 0.2), 240 * 4, () => ({ throttle: 0, brake: 1 })).eHarvest;
    expect(brake(p350)).toBeGreaterThan(brake(DEMO) * 1.5);
  });

  it('light brake pedal: the MGU-K alone (no disc heat) while under its cap', () => {
    const r = kersDriveStep(
      createDriveState(DEMO, 50, 0.5),
      { throttle: 0, brake: 0.05 },
      DEMO,
      dt,
    );
    expect(r.pBrakes).toBe(0);
    expect(r.mode).toBe('harvest');
  });

  it('tiny and huge masses stay finite and balanced (automatic substeps)', () => {
    for (const m of [1, 1e6]) {
      const p = { ...DEMO, vehicle: { ...DEMO.vehicle, m } };
      const s0 = createDriveState(p, 30, 0.5);
      const t0 = total(s0, p);
      const s = run(
        p,
        s0,
        480,
        (k) => ({ throttle: k < 240 ? 1 : 0, brake: k < 240 ? 0 : 1 }),
        (r) => {
          expect(Number.isFinite(r.v)).toBe(true);
          expect(r.v).toBeGreaterThanOrEqual(0);
        },
      );
      expect(Math.abs(total(s, p) - t0) / scale(s, p)).toBeLessThan(1e-6);
    }
  });

  it('absurdly stiff case (1 g car, substep cap reached) stays finite, v ≥ 0, balanced', () => {
    const p = { ...DEMO, vehicle: { ...DEMO.vehicle, m: 1e-3 } };
    const s0 = createDriveState(p, 30, 0.5);
    const t0 = total(s0, p);
    const s = run(
      p,
      s0,
      60,
      () => ({ throttle: 0, brake: 1 }),
      (r) => {
        expect(Number.isFinite(r.v)).toBe(true);
        expect(r.v).toBeGreaterThanOrEqual(0);
        expect(r.pBrakes).toBeGreaterThanOrEqual(0);
      },
    );
    expect(s.v).toBe(0);
    expect(Math.abs(total(s, p) - t0) / scale(s, p)).toBeLessThan(1e-6);
  });

  it('is deterministic', () => {
    const go = (): DriveState =>
      run(DEMO, createDriveState(DEMO, 10, 0.5), 2000, (k) => ({
        throttle: k % 400 < 200 ? 1 : 0,
        brake: k % 400 < 200 ? 0 : 0.7,
      }));
    expect(go()).toEqual(go());
  });

  it('DRIVE_V_STOP is a small regularisation speed', () => {
    expect(DRIVE_V_STOP).toBeLessThanOrEqual(1);
  });
});

describe('speedProfileInput', () => {
  const prof = [
    { t: 0, v: 0 },
    { t: 10, v: 50 },
    { t: 20, v: 50 },
    { t: 25, v: 10 },
  ];
  it('interpolates the target and maps the error to one pedal', () => {
    expect(speedProfileInput(prof, 5, 25)).toEqual({ throttle: 0, brake: 0 });
    expect(speedProfileInput(prof, 5, 0)).toEqual({ throttle: 1, brake: 0 });
    expect(speedProfileInput(prof, 5, 24)).toEqual({ throttle: 0.5, brake: 0 });
    expect(speedProfileInput(prof, 22.5, 40)).toEqual({ throttle: 0, brake: 1 });
    expect(speedProfileInput(prof, -3, 1)).toEqual({ throttle: 0, brake: 0.5 });
    expect(speedProfileInput(prof, 99, 10)).toEqual({ throttle: 0, brake: 0 });
    expect(speedProfileInput(prof, 5, 24, 0.1).throttle).toBeCloseTo(0.1, 12);
    expect(
      speedProfileInput(
        [
          { t: 1, v: 3 },
          { t: 1, v: 5 },
        ],
        2,
        5,
      ),
    ).toEqual({ throttle: 0, brake: 0 });
  });

  it('drives the model along the profile', () => {
    let s = createDriveState(DEMO, 0, 0.5);
    for (let k = 0; k < 240 * 20; k++) {
      s = kersDriveStep(s, speedProfileInput(prof, s.t, s.v), DEMO, dt).state;
    }
    expect(Math.abs(s.v - 50)).toBeLessThan(3);
  });

  it('rejects invalid profiles', () => {
    expect(() => speedProfileInput([], 0, 0)).toThrow(RangeError);
    expect(() =>
      speedProfileInput(
        [
          { t: 2, v: 1 },
          { t: 1, v: 1 },
        ],
        0,
        0,
      ),
    ).toThrow(RangeError);
    expect(() => speedProfileInput([{ t: 0, v: -1 }], 0, 0)).toThrow(RangeError);
    expect(() => speedProfileInput(prof, Number.NaN, 0)).toThrow(RangeError);
    expect(() => speedProfileInput(prof, 0, 0, 0)).toThrow(RangeError);
  });
});
