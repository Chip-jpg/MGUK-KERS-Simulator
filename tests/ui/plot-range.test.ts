// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- minimal uPlot stand-in */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal uPlot stand-in: records options, evaluates the y range on setData. */
const instances: FakePlot[] = [];
class FakePlot {
  static pxRatio = 1;
  opts: Record<string, any>;
  scales: Record<string, { min: number | null; max: number | null }> = {
    y: { min: null, max: null },
  };
  axes: unknown[] = [];
  bbox = { left: 0, top: 0, width: 1000, height: 200 };
  ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
  };
  destroyed = false;
  constructor(opts: Record<string, any>, data: unknown[][]) {
    this.opts = opts;
    instances.push(this);
    this.setData(data);
  }
  setData(data: unknown[][]): void {
    const ys = data
      .slice(1)
      .flat()
      .filter((v): v is number => typeof v === 'number');
    const lo = ys.length ? Math.min(...ys) : null;
    const hi = ys.length ? Math.max(...ys) : null;
    const [min, max] = this.opts['scales'].y.range(this, lo, hi, 'y');
    this.scales['y'] = { min, max };
    for (const h of this.opts['hooks']?.draw ?? []) h(this);
  }
  valToPos(x: number): number {
    return x * 10;
  }
  setSize(): void {}
  destroy(): void {
    this.destroyed = true;
  }
}
vi.mock('uplot', () => ({ default: FakePlot }));

const { createPlot } = await import('../../src/ui/plot');
const { createCarTelemetryPlots, powerRange, speedRange, symmetricNice } =
  await import('../../src/ui/carTelemetryPlots');

let frames: Array<(t: number) => void> = [];
let clock = 0;
const flushFrames = (ms = 40): void => {
  clock += ms;
  vi.spyOn(performance, 'now').mockReturnValue(clock);
  const f = frames;
  frames = [];
  f.forEach((cb) => cb(clock));
};

beforeEach(() => {
  instances.length = 0;
  frames = [];
  clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockReturnValue(clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const finite = (s: { min: number | null; max: number | null }): boolean =>
  Number.isFinite(s.min) && Number.isFinite(s.max) && (s.max as number) > (s.min as number);

describe('createPlot y range (F6)', () => {
  it('stale large history does not dominate: analytic function range wins', () => {
    const host = document.createElement('div');
    let amp = 25_000;
    const p = createPlot(host, {
      titleIT: 'Φ',
      series: [{ labelIT: 'Φ', unit: 'µWb' }],
      yRange: () => [-amp, amp],
    });
    const chart = instances[0]!;
    expect(chart.scales['y']).toEqual({ min: -25_000, max: 25_000 });
    for (let k = 0; k < 10; k++) p.push(k, 25_000 * Math.sin(k)); // old, large samples
    amp = 10; // parameters changed: analytic range shrinks
    p.push(11, 9.8);
    let prevSpan = Infinity;
    for (let k = 0; k < 40 && frames.length > 0; k++) {
      flushFrames();
      const s = chart.scales['y']!;
      expect(finite(s)).toBe(true);
      const span = (s.max as number) - (s.min as number);
      expect(span).toBeLessThanOrEqual(prevSpan); // monotone, no flicker
      prevSpan = span;
    }
    expect(chart.scales['y']).toEqual({ min: -10, max: 10 }); // settled, redraws stopped
    expect(p.yRange).toEqual([-10, 10]);
    p.dispose();
  });

  it('setYRange smooths toward a new range; degenerate / NaN ranges are made safe', () => {
    const host = document.createElement('div');
    const p = createPlot(host, { titleIT: 'x', series: [{ labelIT: 'e' }], yRange: [-1, 1] });
    const chart = instances[0]!;
    p.setYRange([-100, 100]);
    flushFrames(16);
    expect(chart.scales['y']!.max).toBeGreaterThan(1);
    expect(chart.scales['y']!.max).toBeLessThan(100); // not one jump
    for (let k = 0; k < 40; k++) flushFrames();
    expect(chart.scales['y']).toEqual({ min: -100, max: 100 });
    p.setYRange([0, 0]);
    for (let k = 0; k < 40; k++) flushFrames();
    expect(finite(chart.scales['y']!)).toBe(true);
    p.setYRange([Number.NaN, Number.POSITIVE_INFINITY]);
    for (let k = 0; k < 5; k++) flushFrames();
    expect(finite(chart.scales['y']!)).toBe(true);
    p.dispose();
  });

  it('auto range uses visible data with a margin; a flat line still has a span', () => {
    const host = document.createElement('div');
    const p = createPlot(host, { titleIT: 'x', series: [{ labelIT: 'y' }] });
    const chart = instances[0]!;
    expect(finite(chart.scales['y']!)).toBe(true); // empty plot
    for (let k = 0; k < 5; k++) p.push(k, 0); // ω = 0 → flat
    for (let k = 0; k < 40; k++) flushFrames();
    expect(finite(chart.scales['y']!)).toBe(true);
    p.dispose();
  });

  it('y axis has a fixed size, Italian tick labels and a unit label', () => {
    const host = document.createElement('div');
    createPlot(host, { titleIT: 'x', series: [{ labelIT: 'e', unit: 'V' }] }).dispose();
    const axes = instances[0]!.opts['axes'];
    expect(axes[1].size).toBe(64);
    expect(axes[1].label).toBe('[V]');
    expect(axes[1].values(null, [0, 0.25, 0.5])).toEqual(['0,00', '0,25', '0,50']);
  });

  it('markEvent draws a vertical tick; recreating the chart keeps range and events', () => {
    const host = document.createElement('div');
    const p = createPlot(host, { titleIT: 'x', series: [{ labelIT: 'e' }], yRange: [0, 5] });
    p.push(1, 1);
    p.push(2, 2);
    p.markEvent(1.5, 'B = 1 T');
    flushFrames();
    const chart = instances[0]!;
    expect(chart.ctx.fillText).toHaveBeenCalledWith('B = 1 T', expect.any(Number), 2);
    expect(chart.ctx.lineTo).toHaveBeenCalledWith(15.5, 200);
    p.dispose();
  });
});

describe('createCarTelemetryPlots (F2)', () => {
  it('stacks v, a, P (MGU-K + freni), SoC with shared cursor and display units', () => {
    const host = document.createElement('div');
    const tel = createCarTelemetryPlots(host, { windowS: 20 });
    expect(tel.element.classList.contains('telemetry')).toBe(true);
    expect(tel.element.querySelectorAll('.telemetry__plot')).toHaveLength(4);
    const keys = instances.map((c) => c.opts['cursor'].sync?.key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeTruthy();
    // x tick labels only on the bottom plot
    expect(instances.map((c) => c.opts['axes'][0].values?.(null, [1, 2]))).toEqual([
      [],
      [],
      [],
      ['1', '2'],
    ]);
    const pSeries = instances[2]!.opts['series'];
    expect(pSeries[2].dash).toEqual([6, 4]); // brakes dashed (heat)
    expect(instances[3]!.opts['series'][1].dash).toEqual([2, 3]); // SoC dotted
    expect(instances[1]!.opts['axes']).toHaveLength(3); // a: right axis in g
    tel.push(0, { v: 50, a: -9.80665, pKers: -120_000, pBrakes: 800_000, soc: 0.5 });
    tel.push(0.001, { v: 50, a: 0, pKers: 0, pBrakes: 0, soc: 0.5 }); // decimated
    tel.push(0.1, { v: 50, a: 0, pKers: 0, pBrakes: 0, soc: 0.5 });
    flushFrames();
    expect(instances[1]!.opts['axes'][2].values(null, [-9.80665, 0])).toEqual(['−1,0', '0,0']);
    tel.markEvent(0.05, 'Frenata');
    tel.push(-1, { v: 0, a: 0, pKers: 0, pBrakes: 0, soc: 1 }); // time went back → cleared
    tel.dispose();
    expect(host.childElementCount).toBe(0);
  });

  it('analytic ranges are nice, safe and cover the data', () => {
    expect(speedRange(Number.NaN, Number.NaN)).toEqual([0, 150]);
    expect(speedRange(0, 312)).toEqual([0, 350]);
    expect(symmetricNice(-35, 4, 10)).toEqual([-40, 40]);
    const [lo, hi] = powerRange(-120, 800);
    expect(lo).toBeLessThanOrEqual(-120);
    expect(hi).toBeGreaterThanOrEqual(800);
    expect(powerRange(Number.NaN, Number.NaN)).toEqual([-60, 60]);
  });
});
