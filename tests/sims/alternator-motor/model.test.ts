import { describe, expect, it } from 'vitest';
import { PHYSICS_DT, rotatingLoop } from '../../../src/physics';
import {
  IDX,
  OMEGA_MAX,
  substeps,
  coilArea,
  defaultParams,
  energyBalance,
  initialState,
  instant,
  kineticEnergy,
  lorentzTorque,
  noLoadSpeed,
  params,
  rpm,
  simulate,
  step,
  type MachineMode,
  type MachineParams,
} from '../../../src/sims/alternator-motor/model';

/** Deterministic PRNG (mulberry32) so random parameter sets are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomParams(rand: () => number): MachineParams {
  const p = defaultParams();
  for (const k of Object.keys(params) as (keyof MachineParams)[]) {
    const s = params[k];
    p[k] = s.min + rand() * (s.max - s.min);
  }
  p.N = Math.round(p.N);
  return p;
}

const MODES: MachineMode[] = ['generator', 'motor'];

describe('alternator-motor model: schema', () => {
  it('every param has min ≤ default ≤ max, step > 0, unit and Italian label', () => {
    for (const s of Object.values(params)) {
      expect(s.min).toBeLessThanOrEqual(s.default);
      expect(s.default).toBeLessThanOrEqual(s.max);
      expect(s.step).toBeGreaterThan(0);
      expect(s.unit.length).toBeGreaterThan(0);
      expect(s.labelIT.length).toBeGreaterThan(0);
    }
  });
});

describe('alternator-motor model: electromagnetics', () => {
  it('emf at constant ω reproduces rotatingLoop (slides 18–19)', () => {
    const p = defaultParams();
    const S = coilArea(p);
    const omega = 17;
    for (const t of [0, 0.01, 0.123, 0.5]) {
      const ref = rotatingLoop(p.B, S, p.N, omega, t);
      const q = instant('generator', p, omega * t, omega);
      expect(q.emf).toBeCloseTo(ref.emf, 10);
      expect(q.phi).toBeCloseTo(ref.phi, 12);
    }
  });

  it('τ_em from the Lorentz force equals N·B·I·S·sin θ', () => {
    const p = defaultParams();
    const S = coilArea(p);
    for (const th of [0.3, 1.2, 2.5, 4]) {
      const I = 3.7;
      expect(lorentzTorque(p, I, th)).toBeCloseTo(p.N * p.B * I * S * Math.sin(th), 10);
    }
  });

  it('power identity τ_em·ω = ∓emf·i holds for random states (both modes)', () => {
    const rand = prng(42);
    for (let n = 0; n < 200; n++) {
      const p = randomParams(rand);
      const th = rand() * 2 * Math.PI;
      const om = rand() * 60;
      for (const mode of MODES) {
        const q = instant(mode, p, th, om);
        const sign = mode === 'generator' ? -1 : 1;
        const scale = Math.max(1e-12, Math.abs(q.emf * q.i));
        expect(Math.abs(q.tauEm * om - sign * q.emf * q.i) / scale).toBeLessThan(1e-12);
        // electrical side: emf·i = P_load + P_Joule (gen) ; v_s·i = emf·i + P_Joule (motor)
        if (mode === 'generator') {
          expect(q.pConv).toBeCloseTo(q.pElec + q.pJoule, 9);
        } else {
          expect(q.pElec).toBeCloseTo(q.pConv + q.pJoule, 9);
        }
      }
    }
  });

  it('generator: Lenz torque always opposes the rotation', () => {
    const p = defaultParams();
    for (let th = 0.05; th < 2 * Math.PI; th += 0.3) {
      const q = instant('generator', p, th, 20);
      expect(q.tauEm).toBeLessThanOrEqual(0);
      expect(q.pConv).toBeGreaterThanOrEqual(0);
    }
  });

  it('motor: synchronised supply gives a non-negative torque below the no-load speed', () => {
    const p = defaultParams();
    const om = 0.5 * noLoadSpeed(p);
    for (let th = 0.05; th < 2 * Math.PI; th += 0.3) {
      expect(instant('motor', p, th, om).tauEm).toBeGreaterThanOrEqual(0);
    }
  });

  it('rpm conversion', () => {
    expect(rpm(2 * Math.PI)).toBeCloseTo(60, 12);
  });
});

describe('alternator-motor model: energy bookkeeping gate (1e-6 relative)', () => {
  it('generator coasting (τ_est = 0): kinetic energy → battery + Joule', () => {
    const p = defaultParams();
    const s0 = initialState('generator', p);
    const s = simulate('generator', p, 25, PHYSICS_DT, s0);
    const b = energyBalance('generator', p, s0, s);
    expect(b.input).toBeGreaterThan(0.9 * kineticEnergy(p.J, p.omega0));
    expect(b.relError).toBeLessThan(1e-6);
    // the rotor actually slowed down (braking)
    expect(s.y[IDX.omega] as number).toBeLessThan(0.1 * p.omega0);
  });

  it('generator driven by an external torque', () => {
    const p = { ...defaultParams(), tauExt: 1.5 };
    const s0 = initialState('generator', p);
    const s = simulate('generator', p, 8, PHYSICS_DT, s0);
    expect(energyBalance('generator', p, s0, s).relError).toBeLessThan(1e-6);
  });

  it('motor: battery = load work + ΔE_kin + Joule', () => {
    const p = defaultParams();
    const s0 = initialState('motor', p);
    const s = simulate('motor', p, 8, PHYSICS_DT, s0);
    const b = energyBalance('motor', p, s0, s);
    expect(b.input).toBeGreaterThan(0);
    expect(b.dEkin).toBeGreaterThan(0);
    expect(b.relError).toBeLessThan(1e-6);
  });

  it('holds for 20 random parameter sets in both modes, also over a mid-run window', () => {
    const rand = prng(7);
    for (let n = 0; n < 20; n++) {
      const p = randomParams(rand);
      for (const mode of MODES) {
        const s0 = initialState(mode, p);
        const s1 = simulate(mode, p, 1, PHYSICS_DT, s0);
        const s2 = simulate(mode, p, 3, PHYSICS_DT, s1);
        for (const [a, b] of [
          [s0, s2],
          [s1, s2],
        ] as const) {
          const bal = energyBalance(mode, p, a, b);
          if (Math.abs(bal.input) > 1e-9) expect(bal.relError).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('extreme sliders: overspeed limiter bounds ω, sub-steps stay capped, balance still holds', () => {
    const weak = {
      ...defaultParams(),
      N: params.N.min,
      B: params.B.min,
      L: params.L.min,
      w: params.w.min,
      J: params.J.min,
      Rload: params.Rload.max,
      Rw: params.Rw.max,
      tauExt: params.tauExt.max,
      Vs: params.Vs.max,
      tauLoad: 0,
    };
    const strong = {
      ...defaultParams(),
      N: params.N.max,
      B: params.B.max,
      L: params.L.max,
      w: params.w.max,
      J: params.J.min,
      Rw: params.Rw.min,
      Rload: params.Rload.min,
      omega0: params.omega0.max,
    };
    for (const p of [weak, strong]) {
      for (const mode of MODES) {
        expect(substeps(mode, p, OMEGA_MAX, PHYSICS_DT)).toBeLessThanOrEqual(256);
        const s0 = initialState(mode, p);
        const s = simulate(mode, p, 6, PHYSICS_DT, s0);
        expect(s.y[IDX.omega] as number).toBeLessThanOrEqual(OMEGA_MAX + 1);
        expect(s.y.every(Number.isFinite)).toBe(true);
        expect(energyBalance(mode, p, s0, s).relError).toBeLessThan(1e-6);
      }
    }
  });

  it('step() is deterministic and pure', () => {
    const p = defaultParams();
    const s0 = initialState('motor', p);
    const copy = s0.y.slice();
    const a = step('motor', p, s0, PHYSICS_DT);
    const b = step('motor', p, s0, PHYSICS_DT);
    expect(a.y).toEqual(b.y);
    expect(s0.y).toEqual(copy);
  });

  it('motor reaches a steady speed where mean τ_em balances τ_c', () => {
    const p = defaultParams();
    const s = simulate('motor', p, 10, PHYSICS_DT);
    const kMax = p.N * p.B * coilArea(p);
    // mean torque = kMax (V_s − kMax ω)/(2 R_w) = τ_c ⇒ ω* = (V_s − 2 R_w τ_c / kMax)/kMax
    const omegaStar = (p.Vs - (2 * p.Rw * p.tauLoad) / kMax) / kMax;
    expect(Math.abs((s.y[IDX.omega] as number) - omegaStar) / omegaStar).toBeLessThan(0.05);
  });
});
