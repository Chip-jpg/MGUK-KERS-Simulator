import { describe, expect, it } from 'vitest';
import {
  MU_0,
  WIRE_CORE_RADIUS,
  biotSavartSegment,
  coilPolyline,
  createFieldEvaluator,
  distanceToPolyline,
  fieldAt,
  fieldInfiniteSolenoid,
  fieldOnAxisFiniteSolenoid,
  fieldOnAxisLoop,
  solenoidInductance,
  traceFieldLine,
  type Vec3,
} from '../../src/physics';

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

describe('biotSavartSegment', () => {
  it('matches the infinite straight wire μ₀I/2πd for a very long segment', () => {
    const I = 10;
    const d = 0.05;
    const B = biotSavartSegment([0, 0, -1e4], [0, 0, 1e4], [d, 0, 0], I, 0);
    // current along +z, point on +x ⇒ B along +y (right-hand rule)
    expect(rel(B[1], (MU_0 * I) / (2 * Math.PI * d))).toBeLessThan(1e-6);
    expect(Math.abs(B[0]) + Math.abs(B[2])).toBe(0);
  });

  it('matches μ₀I/(4πd)(cosθ₁ − cosθ₂) for a finite segment', () => {
    const I = 3;
    const d = 0.2;
    const B = biotSavartSegment([0, 0, -0.1], [0, 0, 0.3], [d, 0, 0], I, 0);
    const cos1 = 0.1 / Math.hypot(0.1, d);
    const cos2 = -0.3 / Math.hypot(0.3, d);
    expect(rel(B[1], ((MU_0 * I) / (4 * Math.PI * d)) * (cos1 - cos2))).toBeLessThan(1e-12);
  });

  it('is finite on the wire, zero on the line beyond it, and odd in I', () => {
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [1, 0, 0];
    expect(biotSavartSegment(a, b, [0.5, 0, 0], 5)).toEqual([0, 0, 0]);
    expect(biotSavartSegment(a, b, [2, 0, 0], 5)).toEqual([0, 0, 0]);
    expect(biotSavartSegment(a, b, [0, 0, 0], 5)).toEqual([0, 0, 0]);
    // very close to the wire: bounded by the core radius
    const near = biotSavartSegment(a, b, [0.5, 1e-9, 0], 5);
    expect(Number.isFinite(norm(near))).toBe(true);
    expect(norm(near)).toBeLessThan((MU_0 * 5) / (2 * Math.PI * WIRE_CORE_RADIUS));
    const p: Vec3 = [0.3, 0.2, -0.1];
    const plus = biotSavartSegment(a, b, p, 2);
    const minus = biotSavartSegment(a, b, p, -2);
    plus.forEach((c, i) => expect(minus[i]).toBeCloseTo(-c, 20));
    expect(biotSavartSegment(a, b, p, 0)).toEqual([0, 0, 0]);
  });

  it('rejects invalid input', () => {
    expect(() => biotSavartSegment([0, 0, 0], [1, 0, 0], [0, 1, 0], Number.NaN)).toThrow(
      RangeError,
    );
    expect(() => biotSavartSegment([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, -1)).toThrow(RangeError);
    expect(() =>
      biotSavartSegment([0, 0, Number.POSITIVE_INFINITY], [1, 0, 0], [0, 1, 0], 1),
    ).toThrow(RangeError);
    expect(() => biotSavartSegment([0, 0] as unknown as Vec3, [1, 0, 0], [0, 1, 0], 1)).toThrow(
      RangeError,
    );
  });
});

describe('coilPolyline', () => {
  it('loop: N·spt + 1 points on the circle, closed', () => {
    const pts = coilPolyline({ kind: 'loop', R: 0.1, N: 2, segmentsPerTurn: 16 });
    expect(pts).toHaveLength(33);
    for (const p of pts) expect(Math.hypot(p[0], p[1])).toBeCloseTo(0.1, 12);
    expect(distanceToPolyline([pts[0] as Vec3], pts[32] as Vec3)).toBeLessThan(1e-12);
  });

  it('solenoid: helix from −l/2 to +l/2', () => {
    const pts = coilPolyline({ kind: 'solenoid', R: 0.05, N: 10, length: 0.4, segmentsPerTurn: 8 });
    expect(pts).toHaveLength(81);
    expect(pts[0]?.[2]).toBeCloseTo(-0.2, 12);
    expect(pts[80]?.[2]).toBeCloseTo(0.2, 12);
  });

  it('helmholtz: two loops at ±s/2 joined by a cancelling lead', () => {
    const pts = coilPolyline({ kind: 'helmholtz', R: 0.1, N: 1, segmentsPerTurn: 8 });
    expect(pts).toHaveLength(9 + 9 + 1);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    expect(new Set(pts.map((p) => p[2].toFixed(9)))).toEqual(
      new Set(['-0.050000000', '0.050000000']),
    );
  });

  it('helmholtz: the lead pair cancels — field equals the sum of two separate loops', () => {
    const hh = coilPolyline({ kind: 'helmholtz', R: 0.1, N: 2, segmentsPerTurn: 32 });
    const l1 = coilPolyline({ kind: 'loop', R: 0.1, N: 2, segmentsPerTurn: 32 }).map((p): Vec3 => [
      p[0],
      p[1],
      p[2] - 0.05,
    ]);
    const l2 = l1.map((p): Vec3 => [p[0], p[1], p[2] + 0.1]);
    for (const p of [
      [0.03, 0.02, 0.01],
      [0.1, 0.0, 0.0],
      [0.2, -0.1, 0.07],
    ] as Vec3[]) {
      const a = fieldAt(hh, 3, p);
      const b1 = fieldAt(l1, 3, p);
      const b2 = fieldAt(l2, 3, p);
      a.forEach((c, i) =>
        expect(Math.abs(c - (b1[i] as number) - (b2[i] as number))).toBeLessThan(1e-9 * norm(a)),
      );
    }
  });

  it('rejects invalid specs', () => {
    expect(() => coilPolyline({ kind: 'loop', R: 0, N: 1, segmentsPerTurn: 8 })).toThrow(
      RangeError,
    );
    expect(() => coilPolyline({ kind: 'loop', R: 1, N: 1.5, segmentsPerTurn: 8 })).toThrow(
      RangeError,
    );
    expect(() => coilPolyline({ kind: 'loop', R: 1, N: 1, segmentsPerTurn: 2 })).toThrow(
      RangeError,
    );
    expect(() => coilPolyline({ kind: 'solenoid', R: 1, N: 1, segmentsPerTurn: 8 })).toThrow(
      RangeError,
    );
    expect(() =>
      coilPolyline({ kind: 'helmholtz', R: 1, N: 1, separation: -1, segmentsPerTurn: 8 }),
    ).toThrow(RangeError);
    expect(() =>
      coilPolyline({ kind: 'toroid' as 'loop', R: 1, N: 1, segmentsPerTurn: 8 }),
    ).toThrow(/unknown kind/);
  });
});

describe('fieldAt — validation against analytic results', () => {
  it('GATE: loop on-axis field within 0,5 % of μ₀IR²/2(R²+z²)^{3/2} with 128 segments/turn', () => {
    const R = 0.1;
    const I = 5;
    const loop = coilPolyline({ kind: 'loop', R, N: 1, segmentsPerTurn: 128 });
    for (const z of [0, 0.02, 0.05, 0.1, 0.2, -0.15]) {
      const B = fieldAt(loop, I, [0, 0, z]);
      expect(rel(B[2], fieldOnAxisLoop(R, I, z))).toBeLessThan(0.005);
      expect(Math.hypot(B[0], B[1])).toBeLessThan(1e-9 * Math.abs(B[2]));
    }
    expect(fieldOnAxisLoop(R, I, 0)).toBeCloseTo((MU_0 * I) / (2 * R), 15);
  });

  it('N coincident turns = N times the field of one turn', () => {
    const one = coilPolyline({ kind: 'loop', R: 0.1, N: 1, segmentsPerTurn: 64 });
    const three = coilPolyline({ kind: 'loop', R: 0.1, N: 3, segmentsPerTurn: 64 });
    const p: Vec3 = [0.04, 0.01, 0.03];
    const a = fieldAt(one, 2, p);
    const b = fieldAt(three, 2, p);
    a.forEach((c, i) => expect(rel(b[i] as number, 3 * c)).toBeLessThan(1e-12));
  });

  it('GATE: long solenoid (l/R = 20) centre field within 2 % of μ₀NI/l', () => {
    const R = 0.02;
    const l = 20 * R;
    const N = 200;
    const I = 2;
    const sol = coilPolyline({ kind: 'solenoid', R, N, length: l, segmentsPerTurn: 32 });
    const B = fieldAt(sol, I, [0, 0, 0]);
    const ideal = fieldInfiniteSolenoid(N, l, I);
    expect(rel(B[2], ideal)).toBeLessThan(0.02);
    // and it agrees even better with the finite current-sheet formula
    expect(rel(B[2], fieldOnAxisFiniteSolenoid(N, l, R, I, 0))).toBeLessThan(0.005);
    // at the end the field drops to ≈ half
    const end = fieldAt(sol, I, [0, 0, l / 2])[2];
    expect(end / ideal).toBeGreaterThan(0.45);
    expect(end / ideal).toBeLessThan(0.55);
  });

  it('GATE: Helmholtz pair — B varies < 1 % within ±0,1 R of the centre', () => {
    const R = 0.15;
    const hh = coilPolyline({ kind: 'helmholtz', R, N: 1, segmentsPerTurn: 128 });
    const B0 = fieldAt(hh, 1, [0, 0, 0])[2];
    // ≈ (4/5)^{3/2} μ₀ N I / R
    expect(rel(B0, (Math.pow(0.8, 1.5) * MU_0) / R)).toBeLessThan(0.005);
    const d = 0.1 * R;
    const probes: Vec3[] = [
      [0, 0, d],
      [0, 0, -d],
      [d, 0, 0],
      [0, -d, 0],
      [d / Math.SQRT2, 0, d / Math.SQRT2],
      [-d / 2, d / 2, -d / 2],
    ];
    for (const p of probes) expect(rel(norm(fieldAt(hh, 1, p)), B0)).toBeLessThan(0.01);
  });

  it('∇·B ≈ 0 (finite differences) at off-axis points of loop, solenoid and Helmholtz', () => {
    const coils = [
      coilPolyline({ kind: 'loop', R: 0.1, N: 1, segmentsPerTurn: 64 }),
      coilPolyline({ kind: 'solenoid', R: 0.05, N: 20, length: 0.2, segmentsPerTurn: 32 }),
      coilPolyline({ kind: 'helmholtz', R: 0.1, N: 1, segmentsPerTurn: 64 }),
    ];
    const points: Vec3[] = [
      [0.03, 0.02, 0.04],
      [0.15, -0.05, 0.02],
      [-0.02, 0.01, 0.13],
    ];
    const h = 1e-5;
    for (const c of coils) {
      const ev = createFieldEvaluator(c, 1);
      const f = (x: number, y: number, z: number): number[] => ev.field(x, y, z, [0, 0, 0]);
      for (const [x, y, z] of points) {
        const div =
          ((f(x + h, y, z)[0] as number) - (f(x - h, y, z)[0] as number)) / (2 * h) +
          ((f(x, y + h, z)[1] as number) - (f(x, y - h, z)[1] as number)) / (2 * h) +
          ((f(x, y, z + h)[2] as number) - (f(x, y, z - h)[2] as number)) / (2 * h);
        const scale = Math.hypot(...f(x, y, z)) / 0.01; // |B| / (1 cm)
        expect(Math.abs(div) / scale).toBeLessThan(1e-5);
      }
    }
  });

  it('symmetry: loop field is even in z for B_z, odd for B_ρ, and rotation-invariant', () => {
    const loop = coilPolyline({ kind: 'loop', R: 0.1, N: 1, segmentsPerTurn: 64 });
    const up = fieldAt(loop, 1, [0.06, 0, 0.03]);
    const down = fieldAt(loop, 1, [0.06, 0, -0.03]);
    expect(rel(down[2], up[2])).toBeLessThan(1e-10);
    expect(rel(-down[0], up[0])).toBeLessThan(1e-10);
    const rot = fieldAt(loop, 1, [0, 0.06, 0.03]); // rotated 90° about z (64 % 4 = 0)
    expect(rel(rot[1], up[0])).toBeLessThan(1e-10);
    expect(rel(rot[2], up[2])).toBeLessThan(1e-10);
  });

  it('edge cases: I = 0 ⇒ 0, point on the wire ⇒ finite, invalid input throws', () => {
    const loop = coilPolyline({ kind: 'loop', R: 0.1, N: 1, segmentsPerTurn: 32 });
    expect(fieldAt(loop, 0, [0, 0, 0])).toEqual([0, 0, 0]);
    const onWire = fieldAt(loop, 10, loop[3] as Vec3);
    expect(onWire.every(Number.isFinite)).toBe(true);
    const midSeg = fieldAt(loop, 10, [
      ((loop[3]?.[0] ?? 0) + (loop[4]?.[0] ?? 0)) / 2,
      ((loop[3]?.[1] ?? 0) + (loop[4]?.[1] ?? 0)) / 2,
      0,
    ]);
    expect(midSeg.every(Number.isFinite)).toBe(true);
    expect(() => fieldAt([[0, 0, 0]], 1, [1, 1, 1])).toThrow(RangeError);
    expect(() => fieldAt(loop, 1, [Number.NaN, 0, 0])).toThrow(RangeError);
    expect(() => createFieldEvaluator(loop, 1, -1)).toThrow(RangeError);
    expect(createFieldEvaluator(loop, 1).segments).toBe(32);
  });
});

describe('analytic references', () => {
  it('fieldInfiniteSolenoid is consistent with L = μ₀N²S/l (Φ = N·B·S = L·I)', () => {
    const N = 500;
    const l = 0.25;
    const S = Math.PI * 0.02 ** 2;
    const I = 1.5;
    const B = fieldInfiniteSolenoid(N, l, I);
    expect(rel(N * B * S, solenoidInductance(N, S, l) * I)).toBeLessThan(1e-12);
    expect(fieldInfiniteSolenoid(0, 1, 1)).toBe(0);
    expect(() => fieldInfiniteSolenoid(-1, 1, 1)).toThrow(RangeError);
    expect(() => fieldInfiniteSolenoid(1, 0, 1)).toThrow(RangeError);
  });

  it('finite solenoid: centre → μ₀NI/l for l ≫ R, ends → half', () => {
    expect(
      rel(fieldOnAxisFiniteSolenoid(100, 10, 0.01, 1, 0), fieldInfiniteSolenoid(100, 10, 1)),
    ).toBeLessThan(1e-5);
    expect(
      rel(fieldOnAxisFiniteSolenoid(100, 10, 0.01, 1, 5), fieldInfiniteSolenoid(100, 10, 1) / 2),
    ).toBeLessThan(1e-4);
    expect(() => fieldOnAxisFiniteSolenoid(1, 1, 0, 1, 0)).toThrow(RangeError);
    expect(() => fieldOnAxisLoop(0, 1, 0)).toThrow(RangeError);
    expect(fieldOnAxisLoop(1, 0, 0)).toBe(0);
  });

  it('distanceToPolyline', () => {
    const line: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    expect(distanceToPolyline(line, [0.5, 0.3, 0])).toBeCloseTo(0.3, 12);
    expect(distanceToPolyline(line, [-1, 0, 0])).toBeCloseTo(1, 12);
    expect(distanceToPolyline(line, [2, 0.5, 0])).toBeCloseTo(1, 12);
    expect(() => distanceToPolyline([], [0, 0, 0])).toThrow(RangeError);
  });
});

describe('traceFieldLine', () => {
  const R = 0.1;
  const loop = coilPolyline({ kind: 'loop', R, N: 1, segmentsPerTurn: 64 });
  const ev = createFieldEvaluator(loop, 1);
  const B = (p: Vec3): Vec3 => ev.field(p[0], p[1], p[2], [0, 0, 0]) as unknown as Vec3;
  const bounds = { min: [-1, -1, -1], max: [1, 1, 1] } as const;

  it('field lines of a loop close on themselves and stay in their meridian plane', () => {
    const line = traceFieldLine(B, [0.05, 0, 0], { step: 0.004, maxSteps: 5000, bounds });
    expect(line.stop).toBe('closed');
    expect(line.points[0]).toEqual(line.points[line.points.length - 1]);
    for (const p of line.points) expect(Math.abs(p[1])).toBeLessThan(1e-9);
    // it encircles the wire: passes both above (z>0) and below (z<0) the loop plane, and outside ρ > R
    expect(Math.max(...line.points.map((p) => p[0]))).toBeGreaterThan(R);
    expect(Math.max(...line.points.map((p) => p[2]))).toBeGreaterThan(0.02);
    expect(Math.min(...line.points.map((p) => p[2]))).toBeLessThan(-0.02);
    expect(line.magnitude).toHaveLength(line.points.length);
    // the first step follows +B (inside the loop B is along +z)
    expect(line.points[1]?.[2]).toBeGreaterThan(0);
    // traced backwards it closes too, with a consistent length
    const back = traceFieldLine(B, [0.05, 0, 0], {
      step: 0.004,
      maxSteps: 5000,
      bounds,
      direction: -1,
    });
    expect(back.stop).toBe('closed');
    expect(rel(back.length, line.length)).toBeLessThan(0.02);
    expect(back.points[1]?.[2]).toBeLessThan(0);
  });

  it('stops at bounds, near the wire, at null fields and after maxSteps', () => {
    const small = { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] } as const;
    expect(traceFieldLine(B, [0, 0, 0], { step: 0.01, maxSteps: 100, bounds: small }).stop).toBe(
      'bounds',
    );
    const nw = traceFieldLine(B, [0.09, 0, 0], {
      step: 0.002,
      maxSteps: 2000,
      bounds,
      nearWire: (p) => distanceToPolyline(loop, p) < 0.011,
    });
    expect(nw.stop).toBe('nearWire');
    expect(nw.points).toHaveLength(2);
    expect(
      traceFieldLine(() => [0, 0, 0], [0, 0, 0], { step: 0.01, maxSteps: 10, bounds }).stop,
    ).toBe('nullField');
    let calls = 0;
    const dies: (p: Vec3) => Vec3 = () => (++calls > 3 ? [0, 0, 0] : [0, 0, 1]);
    expect(traceFieldLine(dies, [0, 0, 0], { step: 0.01, maxSteps: 10, bounds }).stop).toBe(
      'nullField',
    );
    const ms = traceFieldLine(B, [0, 0, 0], { step: 0.001, maxSteps: 5, bounds });
    expect(ms.stop).toBe('maxSteps');
    expect(ms.points).toHaveLength(6);
    expect(ms.length).toBeCloseTo(0.005, 12);
  });

  it('rejects invalid options', () => {
    expect(() => traceFieldLine(B, [0, 0, 0], { step: 0, maxSteps: 5, bounds })).toThrow(
      RangeError,
    );
    expect(() => traceFieldLine(B, [0, 0, 0], { step: 0.1, maxSteps: 0.5, bounds })).toThrow(
      RangeError,
    );
    expect(() => traceFieldLine(B, [Number.NaN, 0, 0], { step: 0.1, maxSteps: 5, bounds })).toThrow(
      RangeError,
    );
  });
});
