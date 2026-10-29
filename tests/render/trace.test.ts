import * as THREE from 'three';
import 'three/examples/jsm/lines/LineMaterial.js';
import { describe, expect, it } from 'vitest';
import { createGapField, type Vec3 } from '../../src/physics';
import { patchPulseShader } from '../../src/render/fieldLines';
import {
  fieldFromSpec,
  runTraceJob,
  seedByFlux,
  seedDisc,
  seedRect,
  traceFieldLine,
  type Box,
} from '../../src/render/trace';

const box = (h: number): Box => ({ min: [-h, -h, -h], max: [h, h, h] });

describe('traceFieldLine (RK4, curvature-adaptive)', () => {
  it('uniform field: straight line along +B to the bounds', () => {
    const f = fieldFromSpec({ kind: 'uniform', B: [0.5, 0, 0] });
    const l = traceFieldLine(f, [-1, 0.2, 0.1], { bounds: box(2) });
    expect(l.reason).toBe('bounds');
    expect(l.points[3 * (l.count - 1)]).toBeGreaterThan(2);
    for (let i = 0; i < l.count; i++) {
      expect(l.points[3 * i + 1]).toBeCloseTo(0.2, 6);
      expect(l.points[3 * i + 2]).toBeCloseTo(0.1, 6);
      expect(l.mags[i]).toBeCloseTo(0.5, 6);
    }
    expect(l.arc[l.count - 1]).toBeCloseTo(l.points[3 * (l.count - 1)]! + 1, 4);
    // −B direction and both directions
    const back = traceFieldLine(f, [0, 0, 0], { bounds: box(2), direction: -1 });
    expect(back.points[3 * (back.count - 1)]).toBeLessThan(-2);
    const both = traceFieldLine(f, [0, 0, 0], { bounds: box(2), direction: 0 });
    expect(both.points[0]).toBeLessThan(-2);
    expect(both.points[3 * (both.count - 1)]).toBeGreaterThan(2);
  });

  it('dipole: r / sin²θ is conserved along the traced line (exact field-line equation)', () => {
    const f = fieldFromSpec({ kind: 'dipole', m: [0, 0, 1], at: [0, 0, 0] });
    const seed: Vec3 = [1, 0, 0.0];
    const l = traceFieldLine(f, seed, {
      bounds: box(3),
      stopSpheres: [{ c: [0, 0, 0], r: 0.15 }],
      direction: 0,
      maxAngle: 0.03,
    });
    let worst = 0;
    for (let i = 0; i < l.count; i++) {
      const x = l.points[3 * i]!;
      const y = l.points[3 * i + 1]!;
      const z = l.points[3 * i + 2]!;
      const r = Math.hypot(x, y, z);
      const s2 = (x * x + y * y) / (r * r);
      worst = Math.max(worst, Math.abs(r / s2 - 1));
    }
    expect(l.count).toBeGreaterThan(20);
    expect(worst).toBeLessThan(2e-3);
    expect(l.reason).toBe('source');
  });

  it('circular loop: a line through the loop closes around the wire', () => {
    const f = fieldFromSpec({ kind: 'loop', R: 1, I: 1, at: [0, 0, 0], axis: 'z' });
    const l = traceFieldLine(f, [0.6, 0, 0], { bounds: box(6), maxPoints: 3000 });
    expect(l.closed).toBe(true);
    expect(l.reason).toBe('closed');
    // the line stays in the plane y = 0 (symmetry)
    for (let i = 0; i < l.count; i++) expect(Math.abs(l.points[3 * i + 1]!)).toBeLessThan(1e-4);
  });

  it('gap: lines leave the N face and land on the S face; edge lines bulge', () => {
    const geometry = { gap: 2, width: 3, depth: 3 };
    const job = {
      field: { kind: 'gap' as const, geometry, B0: 1 },
      seeds: seedRect([-0.98, 0, 0], [0, 1, 0], [0, 0, 1], 1.4, 1.4, 25),
      options: {
        bounds: box(4),
        stopBoxes: [{ min: [0.98, -1.5, -1.5] as Vec3, max: [2, 1.5, 1.5] as Vec3 }],
      },
    };
    const lines = runTraceJob(job);
    expect(lines).toHaveLength(25);
    for (const l of lines) expect(l.reason).toBe('source');
    const maxY = (l: (typeof lines)[number]): number => {
      let m = 0;
      for (let i = 0; i < l.count; i++) m = Math.max(m, Math.abs(l.points[3 * i + 1]!));
      return m;
    };
    const centre = lines.find(
      (l) => Math.abs(l.points[1]!) < 0.01 && Math.abs(l.points[2]!) < 0.01,
    )!;
    const edge = lines.reduce((a, b) => (Math.abs(b.points[1]!) > Math.abs(a.points[1]!) ? b : a));
    expect(maxY(centre)).toBeLessThan(1e-6);
    expect(maxY(edge) - Math.abs(edge.points[1]!)).toBeGreaterThan(0.02);
    // mirror symmetry x → −x: each line lands at the height it started from
    for (const l of lines) {
      const n = l.count - 1;
      expect(l.points[3 * n + 1]!).toBeCloseTo(l.points[1]!, 1);
    }
  });

  it('gap with offset, sum and solenoid specs', () => {
    const g = fieldFromSpec({
      kind: 'gap',
      geometry: { gap: 1, width: 1, depth: 1 },
      B0: 2,
      offset: [5, 0, 0],
    });
    expect(g([5, 0, 0], [0, 0, 0])[0]).toBeCloseTo(2, 10);
    const s = fieldFromSpec({
      kind: 'solenoid',
      R: 0.1,
      L: 1,
      N: 100,
      I: 1,
      at: [0, 0, 0],
      axis: 'x',
    });
    const b = s([0, 0, 0], [0, 0, 0]);
    expect(b[0]).toBeGreaterThan(0);
    expect(Math.abs(b[1]) + Math.abs(b[2])).toBeLessThan(1e-12);
    const sum = fieldFromSpec({
      kind: 'sum',
      parts: [
        { kind: 'uniform', B: [1, 0, 0] },
        { kind: 'uniform', B: [0, 2, 0] },
      ],
    });
    expect(sum([0, 0, 0], [0, 0, 0])).toEqual([1, 2, 0]);
    // singular points return NaN instead of throwing (the tracer stops)
    const lp = fieldFromSpec({ kind: 'loop', R: 1, I: 1, at: [0, 0, 0], axis: 'y' });
    expect(Number.isNaN(lp([1, 0, 0], [0, 0, 0])[0])).toBe(true);
    const dp = fieldFromSpec({ kind: 'dipole', m: [0, 0, 1], at: [1, 1, 1] });
    expect(Number.isNaN(dp([1, 1, 1], [0, 0, 0])[0])).toBe(true);
    const l = traceFieldLine(dp, [1, 1, 1], { bounds: box(3) });
    expect(l.reason).toBe('weak');
  });
});

describe('seeding', () => {
  it('rect and disc seeds have equal area per seed', () => {
    const r = seedRect([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 1, 32);
    expect(r).toHaveLength(32);
    expect(Math.max(...r.map((p) => p[0]))).toBeLessThan(2);
    const d = seedDisc([0, 0, 1], [1, 0, 0], [0, 1, 0], 1, 400);
    const inner = d.filter((p) => Math.hypot(p[0], p[1]) < Math.SQRT1_2).length;
    expect(inner / 400).toBeCloseTo(0.5, 1); // half the area inside r = 1/√2
    expect(d.every((p) => p[2] === 1)).toBe(true);
  });
  it('flux seeding puts more seeds where |B·n| is larger', () => {
    const f = createGapField({ gap: 1, width: 4, depth: 4 }, 1);
    const cands = seedRect([0, 0, 0], [0, 1, 0], [0, 0, 1], 4, 4, 900);
    const seeds = seedByFlux(f, cands, [1, 0, 0], 60);
    expect(seeds).toHaveLength(60);
    const inside = seeds.filter((p) => Math.abs(p[1]) < 2 && Math.abs(p[2]) < 2).length;
    // 25 % of the candidate area lies between the faces, but most of the flux does
    expect(inside / 60).toBeGreaterThan(0.55);
    expect(seedByFlux(f, cands, [1, 0, 0], 0)).toEqual([]);
    expect(seedByFlux((_p, o) => ((o[0] = o[1] = o[2] = 0), o), cands, [1, 0, 0], 5)).toEqual([]);
  });
  it('flux seeding never returns duplicate seeds (QA-042)', () => {
    // one candidate carries 90 % of the flux: it would be picked for most of the 10 seeds
    const cands: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ];
    const f = (p: readonly number[], o: [number, number, number]): [number, number, number] => {
      o[0] = p[1] === 1 ? 18 : 1;
      o[1] = o[2] = 0;
      return o;
    };
    const seeds = seedByFlux(f, cands, [1, 0, 0], 10);
    const keys = seeds.map((p) => p.join(','));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['0,0,0', '0,1,0']); // 8 of 10 strata fall in the middle cell: one seed
  });
});

describe('pulse shader patch', () => {
  it('replaces the hard dash discard of LineMaterial with a soft pulse', () => {
    const fs = (THREE.ShaderLib as unknown as Record<string, { fragmentShader: string }>)['line']!
      .fragmentShader;
    const out = patchPulseShader(fs);
    expect(out).toContain('kPulse');
    expect(out).toContain('uniform float uGain;');
    expect(out).toContain('diffuseColor.rgb *= ( uBase + uGain * kPulse );');
    expect(out).not.toMatch(/dashSize \) discard/);
  });
});
