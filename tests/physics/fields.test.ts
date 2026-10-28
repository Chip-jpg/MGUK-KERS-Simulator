import { describe, expect, it } from 'vitest';
import {
  createGapField,
  dipoleField,
  divergence,
  ellipE,
  ellipK,
  gapField,
  loopField,
  MU_0,
  norm3,
  solenoidField,
  type Vec3,
} from '../../src/physics';

describe('ellipK / ellipE (AGM)', () => {
  it('match reference values', () => {
    // Abramowitz & Stegun table 17.1 / DLMF (parameter m = k²).
    expect(ellipK(0)).toBeCloseTo(Math.PI / 2, 15);
    expect(ellipE(0)).toBeCloseTo(Math.PI / 2, 15);
    expect(ellipK(0.5)).toBeCloseTo(1.854074677301372, 13);
    expect(ellipE(0.5)).toBeCloseTo(1.350643881047675, 13);
    expect(ellipK(0.9)).toBeCloseTo(2.578092113348173, 12);
    expect(ellipE(0.9)).toBeCloseTo(1.104774732704073, 12);
  });
  it('match the power series for small m', () => {
    for (const m of [1e-4, 1e-3, 0.01, 0.05]) {
      const K = (Math.PI / 2) * (1 + m / 4 + (9 * m * m) / 64 + (25 * m ** 3) / 256);
      const E = (Math.PI / 2) * (1 - m / 4 - (3 * m * m) / 64 - (5 * m ** 3) / 256);
      expect(ellipK(m)).toBeCloseTo(K, 5);
      expect(ellipE(m)).toBeCloseTo(E, 5);
    }
  });
  it('satisfy the Legendre relation E K′ + E′ K − K K′ = π/2', () => {
    for (const m of [0.01, 0.2, 0.37, 0.5, 0.8, 0.99]) {
      const K = ellipK(m);
      const E = ellipE(m);
      const K1 = ellipK(1 - m);
      const E1 = ellipE(1 - m);
      expect(E * K1 + E1 * K - K * K1).toBeCloseTo(Math.PI / 2, 12);
    }
  });
  it('limits at m = 1 and invalid input', () => {
    expect(ellipK(1)).toBe(Number.POSITIVE_INFINITY);
    expect(ellipE(1)).toBe(1);
    expect(ellipE(1 - 1e-12)).toBeCloseTo(1, 9);
    expect(() => ellipK(-0.1)).toThrow(RangeError);
    expect(() => ellipE(1.1)).toThrow(RangeError);
    expect(() => ellipK(Number.NaN)).toThrow(RangeError);
  });
});

/** Brute-force Biot–Savart of a circular loop (n segments). */
function biotSavartLoop(R: number, I: number, p: Vec3, n = 4000): Vec3 {
  const b: Vec3 = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const t0 = (2 * Math.PI * k) / n;
    const t1 = (2 * Math.PI * (k + 1)) / n;
    const tm = 0.5 * (t0 + t1);
    const dl = [R * (Math.cos(t1) - Math.cos(t0)), R * (Math.sin(t1) - Math.sin(t0)), 0];
    const r = [p[0] - R * Math.cos(tm), p[1] - R * Math.sin(tm), p[2]];
    const r3 = Math.hypot(r[0]!, r[1]!, r[2]!) ** 3;
    const c = (MU_0 * I) / (4 * Math.PI * r3);
    b[0] += c * (dl[1]! * r[2]! - dl[2]! * r[1]!);
    b[1] += c * (dl[2]! * r[0]! - dl[0]! * r[2]!);
    b[2] += c * (dl[0]! * r[1]! - dl[1]! * r[0]!);
  }
  return b;
}

describe('dipoleField', () => {
  it('on-axis and equatorial values', () => {
    const m: Vec3 = [0, 0, 2];
    const r = 0.5;
    const k = MU_0 / (4 * Math.PI);
    expect(dipoleField(m, [0, 0, r])[2]).toBeCloseTo((k * 2 * 2) / r ** 3, 18);
    const eq = dipoleField(m, [r, 0, 0]);
    expect(eq[2]).toBeCloseTo((-k * 2) / r ** 3, 18);
    expect(eq[0]).toBeCloseTo(0, 18);
  });
  it('writes into out and is divergence-free', () => {
    const out: Vec3 = [9, 9, 9];
    expect(dipoleField([1, 0, 0], [0.2, 0.3, -0.1], out)).toBe(out);
    const f = (p: readonly [number, number, number], o: Vec3): Vec3 =>
      dipoleField([1, 0.5, -2], p, o);
    const scale = norm3(f([0.3, 0.2, 0.4], [0, 0, 0])) / 0.5;
    expect(Math.abs(divergence(f, [0.3, 0.2, 0.4], 1e-5)) / scale).toBeLessThan(1e-6);
  });
  it('rejects r = 0 and malformed vectors', () => {
    expect(() => dipoleField([0, 0, 1], [0, 0, 0])).toThrow(RangeError);
    expect(() => dipoleField([0, 0, 1], [0, 0] as unknown as Vec3)).toThrow(RangeError);
    expect(() => dipoleField([0, 0, Number.NaN], [1, 0, 0])).toThrow(RangeError);
  });
});

describe('loopField (elliptic integrals)', () => {
  const R = 0.1;
  const I = 5;
  it('on the axis: μ₀ I R² / (2 (R² + z²)^{3/2})', () => {
    for (const z of [0, 0.03, -0.07, 0.5]) {
      const b = loopField(R, I, [0, 0, z]);
      const exp = (MU_0 * I * R * R) / (2 * (R * R + z * z) ** 1.5);
      expect(b[2]).toBeCloseTo(exp, 15);
      expect(b[0]).toBe(0);
      expect(b[1]).toBe(0);
    }
  });
  it('matches brute-force Biot–Savart off the axis', () => {
    for (const p of [
      [0.05, 0.02, 0.03],
      [0.15, -0.04, 0.01],
      [-0.02, 0.11, -0.06],
      [0.3, 0.2, 0.25],
    ] as Vec3[]) {
      const a = loopField(R, I, p);
      const b = biotSavartLoop(R, I, p);
      const s = norm3(b);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!) / s).toBeLessThan(1e-5);
    }
  });
  it('far field equals a dipole m = I π R² ẑ', () => {
    const p: Vec3 = [3, 1, 2];
    const a = loopField(R, I, p);
    const d = dipoleField([0, 0, I * Math.PI * R * R], p);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - d[i]!) / norm3(d)).toBeLessThan(2e-3);
    expect(Math.abs(a[0]! - d[0]!) / norm3(d)).toBeLessThan(1e-3);
  });
  it('is divergence-free and odd in I', () => {
    const f = (p: readonly [number, number, number], o: Vec3): Vec3 => loopField(R, I, p, o);
    const p: Vec3 = [0.07, 0.05, 0.04];
    expect(Math.abs(divergence(f, p, 1e-6)) / (norm3(f(p, [0, 0, 0])) / R)).toBeLessThan(1e-5);
    expect(loopField(R, -I, p)[2]).toBeCloseTo(-loopField(R, I, p)[2], 18);
  });
  it('rejects points on the wire and bad radius', () => {
    expect(() => loopField(R, I, [R, 0, 0])).toThrow(RangeError);
    expect(() => loopField(0, I, [0, 0, 1])).toThrow(RangeError);
    expect(() => loopField(R, Number.NaN, [0, 0, 1])).toThrow(RangeError);
  });
});

describe('solenoidField (sum of loops)', () => {
  const R = 0.02;
  const L = 0.2;
  const N = 400;
  const I = 2;
  const onAxis = (z: number): number =>
    ((MU_0 * N * I) / (2 * L)) *
    ((z + L / 2) / Math.hypot(z + L / 2, R) - (z - L / 2) / Math.hypot(z - L / 2, R));
  it('matches the finite-solenoid on-axis formula', () => {
    for (const z of [0, 0.05, 0.09, 0.15]) {
      expect(solenoidField(R, L, N, I, [0, 0, z])[2] / onAxis(z)).toBeCloseTo(1, 3);
    }
  });
  it('tends to μ₀ N I / L inside a long solenoid', () => {
    const b = solenoidField(R, L, N, I, [0.005, 0, 0]);
    expect(b[2] / ((MU_0 * N * I) / L)).toBeCloseTo(1, 1);
  });
  it('custom loop count keeps the ampere-turns', () => {
    const a = solenoidField(R, L, N, I, [0, 0, 1], [0, 0, 0], 10)[2];
    const b = solenoidField(R, L, N, I, [0, 0, 1], [0, 0, 0], 200)[2];
    expect(a / b).toBeCloseTo(1, 3);
    expect(() => solenoidField(R, L, N, I, [0, 0, 0], [0, 0, 0], 0)).toThrow(RangeError);
    expect(() => solenoidField(R, -L, N, I, [0, 0, 0])).toThrow(RangeError);
  });
});

/** Brute-force field of the two charged sheets (midpoint rule), for the closed form. */
function bruteGap(g: { gap: number; width: number; depth: number }, p: Vec3, n = 300): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (const [x0, s] of [
    [-g.gap / 2, 1],
    [g.gap / 2, -1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const y = -g.width / 2 + ((i + 0.5) * g.width) / n;
      for (let j = 0; j < n; j++) {
        const z = -g.depth / 2 + ((j + 0.5) * g.depth) / n;
        const r = [p[0] - x0, p[1] - y, p[2] - z];
        const r3 = Math.hypot(r[0]!, r[1]!, r[2]!) ** 3;
        const w = (s * (g.width / n) * (g.depth / n)) / r3;
        out[0] += w * r[0]!;
        out[1] += w * r[1]!;
        out[2] += w * r[2]!;
      }
    }
  }
  return out;
}

describe('gapField (two-sheet pole model)', () => {
  const geom = { gap: 0.04, width: 0.06, depth: 0.08 };
  it('equals B0 x̂ at the centre and is nearly uniform in the core', () => {
    const b = gapField(geom, 0.8, [0, 0, 0]);
    expect(b[0]).toBeCloseTo(0.8, 12);
    expect(Math.abs(b[1])).toBeLessThan(1e-12);
    expect(Math.abs(b[2])).toBeLessThan(1e-12);
    const wide = createGapField({ gap: 0.01, width: 0.2, depth: 0.2 }, 1);
    const q = wide([0.003, 0.02, -0.03], [0, 0, 0]);
    expect(q[0]).toBeCloseTo(1, 2);
    expect(Math.abs(q[1]) + Math.abs(q[2])).toBeLessThan(0.01);
  });
  it('matches brute-force integration (closed-form corner sums)', () => {
    const f = createGapField(geom, 1);
    const k = 1 / bruteGap(geom, [0, 0, 0])[0];
    for (const p of [
      [0.01, 0.02, 0.01],
      [-0.015, 0.035, -0.03],
      [0.0, -0.05, 0.06],
      [0.03, 0.01, -0.02],
    ] as Vec3[]) {
      const a = f(p, [0, 0, 0]);
      const b = bruteGap(geom, p);
      const s = norm3(a);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]! * k) / s).toBeLessThan(2e-3);
    }
  });
  it('fringes outwards at the edge and weakens outside the gap', () => {
    const f = createGapField(geom, 1);
    // Leaving the N face (x < 0) the edge lines bulge outwards (+y), near the S face they return.
    expect(f([-0.01, geom.width / 2, 0], [0, 0, 0])[1]).toBeGreaterThan(0);
    expect(f([0.01, geom.width / 2, 0], [0, 0, 0])[1]).toBeLessThan(0);
    expect(f([0, geom.width / 2, 0], [0, 0, 0])[1]).toBeCloseTo(0, 12);
    expect(f([0, geom.width * 2, 0], [0, 0, 0])[0]).toBeLessThan(0.2);
  });
  it('is symmetric and divergence-free in the air gap', () => {
    const f = createGapField(geom, 1);
    const a = f([0.005, 0.01, 0.02], [0, 0, 0]);
    const b = f([0.005, -0.01, -0.02], [0, 0, 0]);
    expect(a[0]).toBeCloseTo(b[0], 12);
    expect(a[1]).toBeCloseTo(-b[1], 12);
    expect(Math.abs(divergence(f, [0.004, 0.025, 0.03], 1e-6)) * geom.gap).toBeLessThan(1e-5);
  });
  it('handles points on the face plane and far below the face (log branch)', () => {
    const f = createGapField(geom, 1);
    expect(Number.isFinite(f([-geom.gap / 2, 0.2, 0.3], [0, 0, 0])[0])).toBe(true);
    expect(Number.isFinite(f([0.02, -0.5, -0.5], [0, 0, 0])[1])).toBe(true);
  });
  it('rejects bad geometry', () => {
    expect(() => createGapField({ gap: 0, width: 1, depth: 1 }, 1)).toThrow(RangeError);
    expect(() => createGapField({ gap: 1, width: 1, depth: 1 }, Number.NaN)).toThrow(RangeError);
    expect(() => gapField(geom, 1, [Number.NaN, 0, 0])).toThrow(RangeError);
  });
});

describe('divergence', () => {
  it('rejects a non-positive step', () => {
    expect(() => divergence((_p, o) => o, [0, 0, 0], 0)).toThrow(RangeError);
  });
});
