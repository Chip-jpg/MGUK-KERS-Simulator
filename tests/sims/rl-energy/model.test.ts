import { describe, expect, it } from 'vitest';
import { PHYSICS_DT, rlCurrent, rlTimeConstant } from '../../../src/physics';
import {
  T_END_TAUS,
  advance,
  analyticGeneratorEnergy,
  currentCurve,
  currentPlotData,
  currentRatioAtTau,
  energyBalance,
  inductanceFromSolenoid,
  initialState,
  selfEmf,
  substepsFor,
  timeScale,
  type RlInputs,
  type RlState,
} from '../../../src/sims/rl-energy/model';
import { defaultParams, params } from '../../../src/sims/rl-energy/params';

const EX: RlInputs = { E: 12, R: 4, L: 0.2 };

/** Run the sim exactly as the render loop does: fixed dt, time-scaled. */
function run(p: RlInputs, untilTaus: number): RlState {
  const tau = rlTimeConstant(p.R, p.L);
  let s = initialState();
  const tEnd = untilTaus * tau;
  while (s.t < tEnd - 1e-15) s = advance(s, p, Math.min(PHYSICS_DT * timeScale(tau), tEnd - s.t));
  return s;
}

describe('rl-energy model', () => {
  it('GATE: i(τ)/I₀ = 0,632 ± 1e-3 (computed with rlCurrent)', () => {
    expect(Math.abs(currentRatioAtTau(EX) - 0.632)).toBeLessThan(1e-3);
    expect(currentRatioAtTau(EX)).toBeCloseTo(1 - Math.exp(-1), 12);
    for (const p of [
      { E: 1, R: 100, L: 0.01 },
      { E: 24, R: 0.5, L: 2 },
    ])
      expect(Math.abs(currentRatioAtTau(p) - 0.632)).toBeLessThan(1e-3);
  });

  it('GATE: energy balance generator = Joule + field within 1e-6 relative (RK4)', () => {
    for (const p of [
      EX,
      { E: 1, R: 100, L: 0.01 },
      { E: 24, R: 0.5, L: 2 },
      { E: 5, R: 50, L: 1e-6 },
    ]) {
      for (const n of [0.3, 1, 3, T_END_TAUS]) {
        const b = energyBalance(run(p, n), p.L);
        expect(b.relError).toBeLessThan(1e-6);
      }
    }
  });

  it('numerical i(t) matches the analytic rlCurrent and the theory-06 example', () => {
    const tau = rlTimeConstant(EX.R, EX.L);
    expect(tau).toBeCloseTo(0.05, 12);
    const s = run(EX, 1);
    expect(s.t).toBeCloseTo(tau, 12);
    expect(s.i).toBeCloseTo(rlCurrent(12, 4, 0.2, tau), 8);
    expect(s.i).toBeCloseTo(3 * (1 - Math.exp(-1)), 8); // ≈ 1,9 A
    const end = run(EX, T_END_TAUS);
    expect(energyBalance(end, EX.L).field).toBeCloseTo(0.9 * (1 - Math.exp(-6)) ** 2, 6); // → ½LI₀² = 0,90 J
    expect(end.Egen).toBeCloseTo(analyticGeneratorEnergy(EX, end.t), 8);
  });

  it('self-induced emf: −E at closing, → 0 at steady state', () => {
    expect(selfEmf(EX, 0)).toBeCloseTo(-12, 12);
    expect(selfEmf(EX, 3)).toBeCloseTo(0, 12);
  });

  it('solenoid inductance L = μᵣ μ₀ N² S / l', () => {
    const L = inductanceFromSolenoid(1000, 1e-3, 0.2, 100);
    expect(L).toBeCloseTo((4e-7 * Math.PI * 100 * 1e6 * 1e-3) / 0.2, 6);
  });

  it('time scaling keeps sub-steps ≤ τ/50 and the transient ≈ 6 s on screen', () => {
    expect(substepsFor(PHYSICS_DT * timeScale(0.05), 0.05)).toBe(1);
    expect(substepsFor(1, 0.001)).toBe(10_000);
    expect((T_END_TAUS * 0.05) / timeScale(0.05)).toBeCloseTo(7.2, 12);
  });

  it('plot data: curve includes a vertical τ marker from 0 to I₀ and the now marker', () => {
    const [xs, it, asym, tauM, nowM] = currentPlotData(EX, 0.02, 1.0, 60);
    const tau = 0.05;
    const marks = xs.map((x, k) => [x, tauM[k]] as const).filter(([, v]) => !Number.isNaN(v));
    expect(marks).toEqual([
      [tau, 0],
      [tau, 3],
    ]);
    const now = xs.map((x, k) => [x, nowM[k]] as const).filter(([, v]) => !Number.isNaN(v));
    expect(now).toEqual([
      [0.02, 0],
      [0.02, 1],
    ]);
    expect(asym.every((v) => v === 3)).toBe(true);
    expect(xs.every((x, k) => k === 0 || x >= (xs[k - 1] ?? 0))).toBe(true);
    expect(it.length).toBe(xs.length);
    expect(currentCurve(EX, 0.3, 10).t).toContain(0.05);
  });

  it('params are consistent and defaults reproduce the theory example', () => {
    const d = defaultParams();
    expect([d.E, d.R, d.L]).toEqual([12, 4, 0.2]);
    for (const s of Object.values(params)) {
      expect(s.min).toBeLessThanOrEqual(s.default);
      expect(s.default).toBeLessThanOrEqual(s.max);
      expect(s.step).toBeGreaterThan(0);
    }
  });
});
