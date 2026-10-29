import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { quantityColorHex } from '../../src/ui/colors';
import {
  RIBBON_IDLE_FRACTION,
  createEnergyRibbon,
  ribbonColor,
} from '../../src/render/energyRibbon';
import { createFieldLines, linesForFraction, spreadOrder } from '../../src/render/fieldLines';
import { IRONBOW_STOPS, ironbow, ironbowGradientCss } from '../../src/render/heat';
import { STUDIO_FLOOR_RADIUS, resolveFloor } from '../../src/render/stage';
import {
  estimateTraceCost,
  fieldCost,
  HEAVY_TRACE_COST,
  runTraceJob,
  type TraceJob,
  type TracedLine,
} from '../../src/render/trace';
import { renderStats } from '../../src/render/stats';
import * as renderBarrel from '../../src/render';
import * as physicsBarrel from '../../src/physics';
import { fakeStage } from './fakeStage';

const uniform = <T>(m: THREE.Material, k: string): T =>
  ((m as THREE.ShaderMaterial).uniforms[k] as { value: T }).value;

describe('createEnergyRibbon options (colour, dim, opacity; theme-safe)', () => {
  const path = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 1, 0)];

  it('ribbonColor = palette colour × dim (clamped), per theme', () => {
    const c = ribbonColor('dark', 'energy', 0.5);
    const ref = new THREE.Color(quantityColorHex('energy', 'dark')).multiplyScalar(0.5);
    expect(c.r).toBeCloseTo(ref.r, 9);
    expect(c.g).toBeCloseTo(ref.g, 9);
    expect(c.b).toBeCloseTo(ref.b, 9);
    const l = ribbonColor('light', 'i');
    expect(l.getHex()).toBe(quantityColorHex('i', 'light'));
    expect(ribbonColor('dark', 'energy', 7).getHex()).toBe(quantityColorHex('energy', 'dark'));
    expect(ribbonColor('dark', 'energy', -1).getHex()).toBe(0);
    expect(ribbonColor('dark', 'energy', Number.NaN).getHex()).toBe(
      quantityColorHex('energy', 'dark'),
    );
  });

  it('dim survives theme changes; opacity option and idle fraction', () => {
    const { stage, fire } = fakeStage('dark');
    const r = createEnergyRibbon(stage, { path, widthPerWatt: 0.1, dim: 0.42, opacity: 0.6 });
    const mat = r.object.material as THREE.ShaderMaterial;
    const expectDim = (theme: 'dark' | 'light', d: number): void => {
      const want = ribbonColor(theme, 'energy', d);
      const got = uniform<THREE.Color>(mat, 'uColor');
      expect(got.r).toBeCloseTo(want.r, 9);
      expect(got.b).toBeCloseTo(want.b, 9);
    };
    expectDim('dark', 0.42);
    fire.theme('light');
    expectDim('light', 0.42);
    r.setDim(1);
    expectDim('light', 1);
    // idle → faded; flowing → the option's opacity; radius ∝ |P| clamped
    fire.frame(0.016);
    expect(uniform<number>(mat, 'uOpacity')).toBeCloseTo(0.6 * RIBBON_IDLE_FRACTION, 9);
    r.setPower(2);
    fire.frame(0.016);
    expect(uniform<number>(mat, 'uOpacity')).toBeCloseTo(0.6, 9);
    expect(uniform<number>(mat, 'uRadius')).toBeCloseTo(0.2, 9);
    r.setOpacity(0.3);
    fire.frame(0.016);
    expect(uniform<number>(mat, 'uOpacity')).toBeCloseTo(0.3, 9);
    // quantity option
    const q = createEnergyRibbon(stage, { path, widthPerWatt: 1, quantity: 'b' });
    expect(uniform<THREE.Color>(q.object.material as THREE.Material, 'uColor').getHex()).toBe(
      quantityColorHex('b', 'light'),
    );
    r.dispose();
    q.dispose();
    expect(stage.scene.children).toHaveLength(0);
  });
});

describe('studio floor option', () => {
  it('resolveFloor: defaults, hidden, radius validation', () => {
    expect(resolveFloor(undefined)).toEqual({ visible: true, radius: STUDIO_FLOOR_RADIUS });
    expect(resolveFloor({ visible: false })).toEqual({
      visible: false,
      radius: STUDIO_FLOOR_RADIUS,
    });
    expect(resolveFloor({ radius: 42 }).radius).toBe(42);
    expect(resolveFloor({ radius: -1 }).radius).toBe(STUDIO_FLOOR_RADIUS);
    expect(resolveFloor({ radius: Number.NaN }).radius).toBe(STUDIO_FLOOR_RADIUS);
  });
});

describe('field lines: count ∝ flux (prefix fraction), precomputed lines, AC flow', () => {
  it('spreadOrder is a permutation whose prefixes are evenly spread', () => {
    for (const n of [1, 2, 5, 16, 37]) {
      const o = spreadOrder(n);
      expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, k) => k));
    }
    const o = spreadOrder(16);
    // first 4 of 16: one in each quarter
    expect(
      o
        .slice(0, 4)
        .map((k) => Math.floor(k / 4))
        .sort(),
    ).toEqual([0, 1, 2, 3]);
    expect(spreadOrder(0)).toEqual([0].slice(1));
  });

  it('linesForFraction: 0 → 0, small > 0 → 1, 1 → n, ceil in between', () => {
    expect(linesForFraction(0, 10)).toBe(0);
    expect(linesForFraction(-1, 10)).toBe(0);
    expect(linesForFraction(Number.NaN, 10)).toBe(0);
    expect(linesForFraction(1e-6, 10)).toBe(1);
    expect(linesForFraction(0.5, 10)).toBe(5);
    expect(linesForFraction(0.51, 10)).toBe(6);
    expect(linesForFraction(2, 10)).toBe(10);
    expect(linesForFraction(0.5, 0)).toBe(0);
  });

  const line = (n: number, y: number): TracedLine => {
    const points = new Float32Array(3 * n);
    const mags = new Float32Array(n).fill(1);
    const arc = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      points[3 * k] = k;
      points[3 * k + 1] = y;
      arc[k] = k;
    }
    return { points, mags, arc, count: n, closed: false, reason: 'bounds' };
  };

  for (const tier of ['base', 'alta'] as const) {
    it(`setLines + setFraction set the draw range (${tier})`, () => {
      const { stage, fire } = fakeStage('dark', tier);
      const fl = createFieldLines(stage);
      fl.setLines([line(5, 0), line(3, 1), line(4, 2), line(1, 3)]); // the 1-point line is dropped
      expect(fl.count).toBe(3);
      expect(fl.shown).toBe(3);
      const mesh = fl.object.children[0] as THREE.Mesh;
      const g = mesh.geometry as THREE.BufferGeometry & { instanceCount?: number };
      const drawn = (): number =>
        tier === 'alta' ? (g.instanceCount ?? 0) : g.drawRange.count / 2;
      expect(drawn()).toBe(4 + 2 + 3);
      fl.setFraction(0.4); // ceil(1.2) = 2 lines
      expect(fl.shown).toBe(2);
      expect(drawn()).toBe(6);
      fl.setFraction(0);
      expect(fl.shown).toBe(0);
      expect(mesh.visible).toBe(false);
      fl.setFraction(1);
      expect(mesh.visible).toBe(true);
      // negative flow (alternating flux) keeps the full brightness of |k|
      fl.setFlow(-1);
      fire.frame(0.1);
      fl.dispose();
    });
  }
});

describe('field-line tracing off the main thread (QA-041)', () => {
  const dipoleJob = (n: number): TraceJob => ({
    field: { kind: 'dipole', m: [1, 0, 0], at: [0, 0, 0] },
    seeds: Array.from({ length: n }, (_, k) => [0.3, 0.01 * k, 0] as [number, number, number]),
    options: { bounds: { min: [-2, -2, -2], max: [2, 2, 2] }, maxPoints: 200 },
  });
  const solenoidJob: TraceJob = {
    field: { kind: 'solenoid', R: 0.1, L: 0.4, N: 200, I: 1, at: [0, 0, 0], axis: 'x' },
    seeds: Array.from({ length: 24 }, (_, k) => [0, 0.004 * k, 0] as [number, number, number]),
    options: { bounds: { min: [-1, -1, -1], max: [1, 1, 1] } },
  };

  it('estimates the cost from seeds × max vertices × field terms', () => {
    expect(fieldCost({ kind: 'dipole', m: [1, 0, 0], at: [0, 0, 0] })).toBe(1);
    expect(
      fieldCost({ kind: 'sum', parts: [dipoleJob(1).field, { kind: 'uniform', B: [0, 0, 1] }] }),
    ).toBeCloseTo(1.2, 12);
    expect(fieldCost(solenoidJob.field)).toBe(800); // 200 loops × 4
    expect(estimateTraceCost(dipoleJob(10))).toBe(10 * 200 * 4);
    expect(
      estimateTraceCost({ ...dipoleJob(10), options: { ...dipoleJob(10).options, direction: 0 } }),
    ).toBe(2 * 10 * 200 * 4);
    expect(estimateTraceCost(dipoleJob(30))).toBeLessThan(HEAVY_TRACE_COST); // light: main thread
    expect(estimateTraceCost(solenoidJob)).toBeGreaterThan(HEAVY_TRACE_COST); // heavy: worker
  });

  it('heavy first trace goes to ONE worker shared by all sets of a stage; light stays sync', async () => {
    const created: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      terminated = false;
      constructor() {
        created.push(this);
      }
      postMessage(msg: { id: number; job: TraceJob }): void {
        const lines = runTraceJob(msg.job);
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, lines } }));
      }
      terminate(): void {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    try {
      const { stage } = fakeStage();
      const before = renderStats.liveWorkers;
      const light = createFieldLines(stage);
      await light.setJob(dipoleJob(8));
      expect(light.lastTrace.where).toBe('main');
      expect(created).toHaveLength(0);
      const a = createFieldLines(stage);
      const b = createFieldLines(stage);
      await Promise.all([a.setJob(solenoidJob), b.setJob(solenoidJob)]);
      expect(a.lastTrace.where).toBe('worker');
      expect(b.lastTrace.where).toBe('worker');
      expect(a.count).toBeGreaterThan(0);
      expect(created).toHaveLength(1); // shared
      expect(renderStats.liveWorkers).toBe(before + 1);
      a.dispose();
      expect(created[0]?.terminated).toBe(false); // b still uses it
      b.dispose();
      expect(created[0]?.terminated).toBe(true);
      expect(renderStats.liveWorkers).toBe(before);
      light.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('ironbow false colour', () => {
  it('hits the stops, is monotonic in luminance and clamps', () => {
    for (const [p, r, g, b] of IRONBOW_STOPS) {
      const c = ironbow(p);
      expect(c[0]).toBeCloseTo(r / 255, 9);
      expect(c[1]).toBeCloseTo(g / 255, 9);
      expect(c[2]).toBeCloseTo(b / 255, 9);
    }
    let last = -1;
    for (let k = 0; k <= 50; k++) {
      const [r, g, b] = ironbow(k / 50);
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(y).toBeGreaterThan(last);
      last = y;
    }
    expect(ironbow(-3)).toEqual(ironbow(0));
    expect(ironbow(9)).toEqual(ironbow(1));
    expect(ironbow(Number.NaN)).toEqual(ironbow(0));
    expect(ironbowGradientCss()).toMatch(/^linear-gradient\(to right, rgb\(18 10 52\) 0%/);
  });
});

describe('barrels', () => {
  it('render exports the scale helpers and studio textures; physics exports brake-thermal', () => {
    for (const k of ['niceCeil', 'autoRange', 'holdPeak', 'radialFade', 'studioBackgroundColor'])
      expect(typeof (renderBarrel as Record<string, unknown>)[k]).toBe('function');
    for (const k of ['discThermalStep', 'kelvinToCelsius', 'celsiusToKelvin', 'discLossPower'])
      expect(typeof (physicsBarrel as Record<string, unknown>)[k]).toBe('function');
    expect(physicsBarrel.BRAKE_DISC_ILLUSTRATIVE.front.mass).toBeGreaterThan(0);
  });
});
