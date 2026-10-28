import { describe, expect, it } from 'vitest';
import { MU_0 } from '../../../src/physics';
import {
  analyticAxis,
  arrowGrid,
  axisProfile,
  coilSetup,
  computeAll,
  evaluator,
  flowPhase,
  idealInductance,
  idealSolenoidAxis,
  nearWire,
  referenceCentre,
  relDiff,
  seeds,
  type FieldRequest,
} from '../../../src/sims/field-biot-savart/model';
import { createFieldRunner, type FieldMessage } from '../../../src/sims/field-biot-savart/runner';
import { defaultParams, params } from '../../../src/sims/field-biot-savart/params';

const req = (over: Partial<FieldRequest> = {}): FieldRequest => ({
  ...defaultParams(),
  geometry: 'solenoid',
  ...over,
});
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('params', () => {
  it('every field has min ≤ default ≤ max, a step and an Italian label', () => {
    for (const spec of Object.values(params)) {
      expect(spec.min).toBeLessThanOrEqual(spec.default);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.step).toBeGreaterThan(0);
      expect(spec.labelIT.length).toBeGreaterThan(3);
      expect(spec.unit.length).toBeGreaterThan(0);
    }
  });
});

describe('field-biot-savart model', () => {
  it('defaults: ideal solenoid B = μ₀NI/l ≈ 0,838 mT; numeric centre within 2,5 % (l/R = 10)', () => {
    const r = req();
    expect(referenceCentre(r)).toBeCloseTo((MU_0 * 40 * 5) / 0.3, 15);
    expect(referenceCentre(r) * 1e3).toBeCloseTo(0.838, 3);
    const s = coilSetup(r);
    const prof = axisProfile(s, evaluator(s));
    const bNum = Math.hypot(...prof.centre);
    // finite coil: about −1,9 % (current-sheet formula), the helix adds a little ripple
    expect(relDiff(bNum, referenceCentre(r))).toBeLessThan(0);
    expect(rel(bNum, referenceCentre(r))).toBeLessThan(0.025);
    expect(rel(bNum, analyticAxis(r, 0))).toBeLessThan(0.01);
  });

  it('loop and Helmholtz numeric centre agree with the analytic reference (< 0,5 %)', () => {
    for (const geometry of ['loop', 'helmholtz'] as const) {
      const r = req({ geometry, N: 10, R: 0.05 });
      const s = coilSetup(r);
      const ev = evaluator(s);
      const prof = axisProfile(s, ev);
      expect(rel(prof.centre[2], referenceCentre(r))).toBeLessThan(0.005);
      // whole on-axis profile vs analytic thin-loop formula
      prof.z.forEach((z, k) => {
        expect(rel(prof.bz[k] as number, analyticAxis(r, z))).toBeLessThan(0.005);
      });
    }
  });

  it('ideal solenoid profile is a step and L = μ₀N²πR²/l', () => {
    const r = req();
    expect(idealSolenoidAxis(r, 0)).toBeCloseTo(referenceCentre(r), 15);
    expect(idealSolenoidAxis(r, 0.2)).toBe(0);
    expect(idealInductance(r)).toBeCloseTo((MU_0 * 40 * 40 * Math.PI * 0.03 ** 2) / 0.3, 15);
    expect(relDiff(1, 0)).toBe(0);
  });

  it('coil setup: helix vs one-turn loops carrying N·I, box and display paths', () => {
    const sol = coilSetup(req());
    expect(sol.polyline).toHaveLength(40 * 36 + 1);
    expect(sol.current).toBe(5);
    expect(sol.displayPaths).toHaveLength(1);
    const loop = coilSetup(req({ geometry: 'loop' }));
    expect(loop.current).toBe(200);
    expect(loop.polyline).toHaveLength(97);
    const hh = coilSetup(req({ geometry: 'helmholtz' }));
    expect(hh.displayPaths).toHaveLength(2);
    expect(hh.displayPaths[1]?.[0]?.[2]).toBeCloseTo(0.015, 12);
    for (const s of [sol, loop, hh]) {
      expect(s.step).toBeGreaterThan(0);
      expect(s.bounds.max[2]).toBe(s.zHalf);
    }
  });

  it('nearWire for each geometry', () => {
    const r = req();
    expect(nearWire(r, [0.03, 0, 0])).toBe(true);
    expect(nearWire(r, [0.02, 0, 0])).toBe(false);
    expect(nearWire(r, [0.03, 0, 0.15])).toBe(true);
    expect(nearWire(r, [0.03, 0, 0.2])).toBe(false);
    const hh = req({ geometry: 'helmholtz' });
    expect(nearWire(hh, [0, 0.03, 0.015])).toBe(true);
    expect(nearWire(hh, [0, 0.03, 0])).toBe(false);
    expect(nearWire(req({ geometry: 'loop' }), [0, -0.03, 0])).toBe(true);
  });

  it('field lines: one per seed, start inside the coil, follow +B, loop lines close', () => {
    const r = req({ geometry: 'loop', lines: 8 });
    expect(seeds(r)).toHaveLength(8);
    const all = computeAll(r);
    expect(all.lines).toHaveLength(8);
    expect(all.lines.some((l) => l.closed)).toBe(true);
    for (const l of all.lines) {
      expect(l.points.length / 3).toBe(l.magnitude.length);
      expect(l.points.every(Number.isFinite)).toBe(true);
    }
    expect(all.arrows.count).toBeGreaterThan(100);
    // solenoid lines pass through the inside along +z
    const sol = computeAll(req({ lines: 4 }));
    for (const l of sol.lines) {
      const n = l.magnitude.length;
      expect(l.points[3 * (n - 1) + 2]).toBeGreaterThan(l.points[2] as number);
    }
  });

  it('flowPhase is monotone, faster (smaller dφ/ds) where |B| is larger', () => {
    const pts = new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 2]);
    const ph = flowPhase(pts, new Float32Array([1, 1, 4]), 1);
    expect(ph[0]).toBe(0);
    expect(ph[1]).toBeCloseTo(1, 6);
    expect((ph[2] as number) - (ph[1] as number)).toBeLessThan(1);
    expect(flowPhase(pts, new Float32Array([0, 0, 0]), 0)[2]).toBeCloseTo(2 / 0.15, 4);
  });

  it('arrow grid skips points on the wire and stores unit directions', () => {
    const r = req({ geometry: 'loop' });
    const s = coilSetup(r);
    const g = arrowGrid(r, s, evaluator(s));
    for (let k = 0; k < g.count; k++) {
      const o = 7 * k;
      expect(Math.hypot(g.data[o + 3]!, g.data[o + 4]!, g.data[o + 5]!)).toBeCloseTo(1, 5);
      expect(g.data[o + 6]).toBeGreaterThan(0);
    }
  });
});

describe('field runner (worker protocol)', () => {
  it('posts profile, one message per line, then done; a newer job cancels the old one', () => {
    const msgs: FieldMessage[] = [];
    const queue: Array<() => void> = [];
    const runner = createFieldRunner(
      (m) => msgs.push(m),
      (cb) => queue.push(cb),
    );
    const drain = (): void => {
      while (queue.length) queue.shift()?.();
    };
    runner.run(1, req({ geometry: 'loop', lines: 4 }));
    queue.shift()?.(); // first line of job 1
    runner.run(2, req({ geometry: 'helmholtz', lines: 4 }));
    drain();
    const kinds = msgs.map((m) => `${m.job}:${m.type}`);
    expect(kinds).toEqual([
      '1:profile',
      '1:line',
      '2:profile',
      '2:line',
      '2:line',
      '2:line',
      '2:line',
      '2:done',
    ]);
    const prof = msgs[2];
    expect(prof?.type === 'profile' && prof.lineCount).toBe(4);
    runner.run(3, req({ geometry: 'loop', lines: 4 }));
    runner.cancel();
    drain();
    expect(msgs.filter((m) => m.job === 3).map((m) => m.type)).toEqual(['profile']);
  });
});
