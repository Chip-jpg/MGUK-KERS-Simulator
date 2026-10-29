import { describe, expect, it } from 'vitest';
import { dipoleField, PHYSICS_DT } from '../../../src/physics';
import {
  GALVO,
  INDUCED_VISUAL_GAIN,
  MAGNET_DIPOLES,
  dipoleChain,
  galvoStep,
  galvoTarget,
  inducedFlow,
  visualTurns,
  windingLayout,
  type GalvoState,
} from '../../../src/sims/lenz/model';

const deg = (r: number): number => (r * 180) / Math.PI;

function run(target: number, seconds: number, s0: GalvoState = { phi: 0, omega: 0 }) {
  let s = s0;
  const trace: number[] = [];
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) {
    s = galvoStep(s, target, PHYSICS_DT);
    trace.push(s.phi);
  }
  return { s, trace };
}

describe('galvanometer needle (2nd-order damped response)', () => {
  it('static deflection ∝ i on the full scale, clamped at the pins', () => {
    expect(deg(galvoTarget(1e-3, 1e-3))).toBeCloseTo(GALVO.fullScaleDeg, 10);
    expect(deg(galvoTarget(-0.5e-3, 1e-3))).toBeCloseTo(-GALVO.fullScaleDeg / 2, 10);
    expect(deg(galvoTarget(5e-3, 1e-3))).toBeCloseTo(GALVO.pinDeg, 10);
    expect(galvoTarget(Number.NaN, 1e-3)).toBe(0);
  });

  it('step response: settles on the target with the under-damped overshoot exp(−πζ/√(1−ζ²))', () => {
    const target = galvoTarget(0.5e-3, 1e-3);
    const { s, trace } = run(target, 4);
    expect(s.phi).toBeCloseTo(target, 6);
    const peak = Math.max(...trace);
    const z = GALVO.zeta;
    const expected = Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
    expect((peak - target) / target).toBeCloseTo(expected, 3);
    // the peak occurs at t_p = π / (ω₀ √(1 − ζ²))
    const tp = (trace.indexOf(peak) + 1) * PHYSICS_DT;
    const w0 = 2 * Math.PI * GALVO.f0;
    expect(tp).toBeCloseTo(Math.PI / (w0 * Math.sqrt(1 - z * z)), 2);
  });

  it('stops at the end pins', () => {
    const { s } = run(10, 1); // absurd target beyond the pins
    expect(deg(s.phi)).toBeCloseTo(GALVO.pinDeg, 10);
    expect(s.omega).toBe(0);
    const neg = run(-10, 1);
    expect(deg(neg.s.phi)).toBeCloseTo(-GALVO.pinDeg, 10);
  });
});

describe('coil drawing helpers', () => {
  it('visualTurns = min(N, cap), at least 1', () => {
    expect(visualTurns(200, 48)).toBe(48);
    expect(visualTurns(7, 48)).toBe(7);
    expect(visualTurns(0, 48)).toBe(1);
  });
  it('windingLayout splits the turns into balanced layers', () => {
    expect(windingLayout(48, 12)).toEqual({ layers: 4, perLayer: 12 });
    expect(windingLayout(13, 12)).toEqual({ layers: 2, perLayer: 7 });
    expect(windingLayout(1, 12)).toEqual({ layers: 1, perLayer: 1 });
  });
});

describe('finite dipole of the drawn field lines', () => {
  it('K slices centred on the bar', () => {
    const xs = dipoleChain(1.6);
    expect(xs).toHaveLength(MAGNET_DIPOLES);
    expect(xs[0]).toBeCloseTo(-0.8 + 0.1, 12);
    expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });
  it('far field of the chain = point dipole (relative error < 1 % at 10 lengths)', () => {
    const xs = dipoleChain(0.08);
    const m = 5;
    const p: [number, number, number] = [0.6, 0.5, 0.2];
    const sum: [number, number, number] = [0, 0, 0];
    for (const x of xs) {
      const b = dipoleField([m / xs.length, 0, 0], [p[0] - x, p[1], p[2]]);
      sum[0] += b[0];
      sum[1] += b[1];
      sum[2] += b[2];
    }
    const ref = dipoleField([m, 0, 0], p);
    const err = Math.hypot(sum[0] - ref[0], sum[1] - ref[1], sum[2] - ref[2]) / Math.hypot(...ref);
    expect(err).toBeLessThan(0.01);
  });
});

describe('induced-field visual gain', () => {
  it('flow = G·|B_ind|/|B̄| capped at 1,2; 0 without magnet field', () => {
    expect(inducedFlow(1e-6, 1e-3)).toBeCloseTo(INDUCED_VISUAL_GAIN * 1e-3, 12);
    expect(inducedFlow(-1e-6, -1e-3)).toBeCloseTo(INDUCED_VISUAL_GAIN * 1e-3, 12);
    expect(inducedFlow(1, 1e-3)).toBe(1.2);
    expect(inducedFlow(1e-6, 0)).toBe(0);
  });
});
