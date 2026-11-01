import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { registerDebugHook } from '../core/debug';
import { formatIT } from '../core/format';
import { currentTheme, onThemeChange } from '../core/theme';
import type { Disposable, Theme } from '../core/types';
import { getPalette, type Quantity } from './colors';
import { el } from './dom';
import { FULLSCREEN_EVENT } from './fullscreen';
import {
  DEFAULT_RANGE,
  niceTicks,
  paddedRange,
  sanitizeRange,
  stepRange,
  type Range,
} from './plotScale';
import { RingBuffer } from './ringBuffer';

/**
 * uPlot wrapper for live plots: ring-buffered `push()` (redraw at most
 * {@link PLOT_MAX_HZ} times per second, into preallocated column arrays — no
 * per-redraw copies once the buffer is full), §4.5 quantity colours that follow
 * the theme toggle, Italian number formatting on axes and legend, auto-resize,
 * `dispose()`.
 *
 * F6 — the y range is owned by the wrapper, not by uPlot's autoscale over the
 * whole history: it comes from `setYRange()`, else `options.yRange` (fixed tuple or
 * analytic function), else the padded min/max of the *visible* window. Whatever the
 * source, it is sanitised (never NaN/∞/zero width) and approached smoothly
 * ({@link stepRange}, ~300 ms, no per-frame jumps); it survives the chart being
 * recreated (theme toggle). Ticks are always labelled (fixed-width y axis, Italian
 * numbers) and `markEvent(x)` draws a vertical tick for parameter changes.
 */

/** Live plots redraw at most this often [Hz] (QA-038: the 3D scene keeps 60 fps). */
export const PLOT_MAX_HZ = 30;
export interface PlotSeries {
  /** Italian legend label, e.g. 'Flusso Φ'. */
  labelIT: string;
  /** Display unit of the legend value, e.g. 'Wb'. */
  unit?: string;
  /** Fixed quantity colour (B blue, emf amber, i red, F green, energy purple); default neutral. */
  quantity?: Quantity | 'neutral' | 'accent';
  /** Legend fraction digits (default 3). */
  digits?: number;
  /** Line dash pattern in px, e.g. [6, 4]. */
  dash?: number[];
  /** Line width in CSS px (default 2). */
  width?: number;
  /** Fill the area under the curve with a translucent tint. */
  fill?: boolean;
}

export interface PlotOptions {
  /** Visible caption (figcaption) and accessible name. */
  titleIT: string;
  series: readonly PlotSeries[];
  /** x-axis label, e.g. 't'. */
  xLabelIT?: string;
  /** x unit, e.g. 's' (appended to the axis label). */
  xUnit?: string;
  /** y-axis label (e.g. unit for single-quantity plots). */
  yLabelIT?: string;
  /** Ring-buffer capacity (samples kept). Default 600. */
  capacity?: number;
  /** Plot height in CSS px (legend excluded). Default 220. */
  height?: number;
  /** Show only the last `xWindow` x-units (scrolling time window). */
  xWindow?: number;
  /**
   * y range: a fixed `[min, max]`, or a function returning the analytic range (it gets
   * the min/max of the visible data, NaN when there is none). Default: padded
   * auto-range of the visible window. Always sanitised and smoothed.
   */
  yRange?: readonly [number, number] | YRangeFn;
  /** Unit appended to the y-axis label ("Φ [mWb]"); default: the series' common unit. */
  yUnit?: string;
  /** Linked cursor: plots with the same key share the hover crosshair (uPlot sync). */
  syncKey?: string;
  /** Secondary right axis on the same scale showing value × `factor` (e.g. m/s² → g). */
  yAxis2?: { labelIT: string; factor: number };
  /** Hide the x-axis tick labels (stacked plots sharing one time axis). */
  hideXAxis?: boolean;
  /** Initial theme (default: the one on `<html>`). The plot follows later toggles itself. */
  theme?: Theme;
}

/** Analytic y range from the visible data min/max (NaN when no data). */
export type YRangeFn = (dataMin: number, dataMax: number) => readonly [number, number];

export interface Plot extends Disposable {
  /** `<figure>` that holds the chart. */
  readonly element: HTMLElement;
  /** Append one sample (one y per series). Redraw is batched to the next frame. */
  push(x: number, ...ys: number[]): void;
  /** Replace all data (static curves, e.g. i(t) of an RL circuit). */
  setData(xs: readonly number[], ...ys: readonly (readonly number[])[]): void;
  /** Remove all samples. */
  clear(): void;
  /** The live uPlot instance (null after dispose). */
  readonly chart: uPlot | null;
  /**
   * New target y range (e.g. after a parameter change); the axis moves there smoothly.
   * `null` returns to `options.yRange` / auto. Invalid ranges are made safe.
   */
  setYRange(range: readonly [number, number] | null): void;
  /** y range currently drawn (null before the first draw). */
  readonly yRange: [number, number] | null;
  /** Vertical tick at `x` (with an optional short Italian label), e.g. a parameter change. */
  markEvent(x: number, labelIT?: string): void;
}

/** Max event ticks kept per plot (oldest dropped; ticks left of the data are pruned). */
const MAX_EVENTS = 24;

interface LivePlot {
  titleIT: string;
  chart: uPlot | null;
  yRange: [number, number] | null;
}
const livePlots = new Set<LivePlot>();
let plotsHooked = false;

/** One debug entry per live plot (e2e `window.__kersDebug.plots()`). */
export interface PlotDebugInfo {
  title: string;
  yMin: number | null;
  yMax: number | null;
  shown: [number, number] | null;
  ticks: string[];
}

function hookPlots(): void {
  if (plotsHooked) return;
  plotsHooked = true;
  registerDebugHook('plots', (): PlotDebugInfo[] =>
    [...livePlots].map((p) => {
      const axis = p.chart?.axes[1] as (uPlot.Axis & { _values?: unknown[] }) | undefined;
      const sc = p.chart?.scales['y'];
      return {
        title: p.titleIT,
        yMin: sc?.min ?? null,
        yMax: sc?.max ?? null,
        shown: p.yRange,
        ticks: (axis?._values ?? []).map((v) => String(v)),
      };
    }),
  );
}

function seriesColor(q: PlotSeries['quantity'], theme: Theme): string {
  const p = getPalette(theme);
  if (!q || q === 'neutral') return p.neutral;
  if (q === 'accent') return p.accent;
  return p.quantity[q];
}

/** Fixed width of the y axes [CSS px] (tick labels); the plot area never jumps. */
const Y_AXIS_SIZE = 64;
/** Minimum vertical room per y tick [CSS px]. */
const Y_TICK_SPACE = 30;

/** y-axis splits: nice ticks, always ≥ 2 inside the range (labelled axis, F6). */
const ySplits = (u: uPlot, _axis: number, min: number, max: number): number[] => {
  const h = (u.bbox?.height ?? 0) / (uPlot.pxRatio || 1);
  return niceTicks(min, max, Math.max(2, Math.floor(h / Y_TICK_SPACE)));
};

/** Upper bound on axis tick decimals. */
const MAX_TICK_DIGITS = 6;

/**
 * Fraction digits that represent the tick step exactly (QA-003): 0,25 → 2,
 * 2,5 → 1, 0,1 → 1, 5 → 0, capped at {@link MAX_TICK_DIGITS}.
 */
export function tickDigits(splits: readonly number[]): number {
  const a = splits[0];
  const b = splits[1];
  if (a === undefined || b === undefined) return 2;
  const step = Math.abs(b - a);
  if (!(step > 0) || !Number.isFinite(step)) return 2;
  let d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  while (d < MAX_TICK_DIGITS) {
    const scaled = step * 10 ** d;
    // Relative tolerance absorbs float noise from uPlot's split arithmetic.
    if (Math.abs(scaled - Math.round(scaled)) <= 1e-6 * Math.max(1, scaled)) break;
    d++;
  }
  return Math.min(MAX_TICK_DIGITS, d);
}

const axisValues = (_u: uPlot, splits: number[]): string[] => {
  const d = tickDigits(splits);
  return splits.map((v) => formatIT(v, d));
};

/** Common unit of all series ('' when they differ or none is set). */
function commonUnit(series: readonly PlotSeries[]): string {
  const units = new Set(series.map((s) => s.unit ?? ''));
  return units.size === 1 ? ([...units][0] ?? '') : '';
}

const clockMs = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

export function createPlot(container: HTMLElement, o: PlotOptions): Plot {
  const capacity = o.capacity ?? 600;
  const height = o.height ?? 220;
  const nSeries = o.series.length;
  const buffer = new RingBuffer(capacity, Math.max(1, nSeries));
  let theme: Theme = o.theme ?? currentTheme();

  // --- y range state (F6): survives chart recreation ---------------------------------
  const live: LivePlot = { titleIT: o.titleIT, chart: null, yRange: null };
  let manualRange: [number, number] | null = null;
  let shown: [number, number] | null = null;
  let lastRangeMs = 0;
  let animating = false;
  const fixedRange = (): Range | null =>
    manualRange ?? (o.yRange && typeof o.yRange !== 'function' ? o.yRange : null);
  const yRangeFn = (_u: uPlot, dMin: number | null, dMax: number | null): uPlot.Range.MinMax => {
    const lo = dMin ?? Number.NaN;
    const hi = dMax ?? Number.NaN;
    const fallback = shown ?? DEFAULT_RANGE;
    let target: [number, number];
    const fixed = fixedRange();
    if (fixed) target = sanitizeRange(fixed, fallback);
    else if (typeof o.yRange === 'function') {
      let r: Range | null = null;
      try {
        r = o.yRange(lo, hi);
      } catch {
        r = null;
      }
      target = sanitizeRange(r, fallback);
    } else target = paddedRange(lo, hi, 0.05, fallback);
    const t = clockMs();
    shown = stepRange(shown, target, t - lastRangeMs);
    lastRangeMs = t;
    animating = shown[0] !== target[0] || shown[1] !== target[1];
    live.yRange = shown;
    return [shown[0], shown[1]];
  };

  // --- event ticks ------------------------------------------------------------------
  const events: Array<{ x: number; label: string }> = [];
  const drawEvents = (u: uPlot): void => {
    if (events.length === 0) return;
    const ctx = u.ctx;
    const pr = uPlot.pxRatio || 1;
    const { left, top, width: w, height: h } = u.bbox;
    const p = getPalette(theme);
    ctx.save();
    ctx.strokeStyle = p.textMuted;
    ctx.fillStyle = p.textMuted;
    ctx.lineWidth = Math.max(1, pr);
    ctx.setLineDash([4 * pr, 3 * pr]);
    ctx.font = `${Math.round(11 * pr)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    for (const ev of events) {
      const px = u.valToPos(ev.x, 'x', true);
      if (!Number.isFinite(px) || px < left || px > left + w) continue;
      const x = Math.round(px) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
      ctx.stroke();
      if (ev.label) ctx.fillText(ev.label, x + 3 * pr, top + 2 * pr);
    }
    ctx.restore();
  };

  const host = el('div', { class: 'plot__chart' });
  const element = el('figure', { class: 'plot', attrs: { 'aria-label': o.titleIT } }, [
    el('figcaption', { class: 'plot__title', text: o.titleIT }),
    host,
  ]);
  container.append(element);

  const width = (): number =>
    Math.max(200, Math.floor(host.clientWidth || container.clientWidth || 480));

  // Axis font from the design token --plot-axis-font-size (16px in fullscreen, D1).
  const axisFontPx = (): number => {
    try {
      const v = parseFloat(getComputedStyle(host).getPropertyValue('--plot-axis-font-size'));
      return Number.isFinite(v) && v > 0 ? v : 12;
    } catch {
      return 12;
    }
  };
  let fontPx = axisFontPx();

  const buildOptions = (): uPlot.Options => {
    const p = getPalette(theme);
    const font = `${fontPx}px system-ui, sans-serif`;
    const ySize = Math.round((Y_AXIS_SIZE * fontPx) / 12);
    const axisCommon = {
      stroke: p.textMuted,
      grid: { stroke: p.grid, width: 1 },
      ticks: { stroke: p.grid, width: 1 },
      values: axisValues,
      font,
      labelFont: font,
      labelSize: Math.round(fontPx * 2.2),
    };
    const xLabel = o.xLabelIT ? `${o.xLabelIT}${o.xUnit ? ` [${o.xUnit}]` : ''}` : undefined;
    const unit = o.yUnit ?? commonUnit(o.series);
    const yLabel = o.yLabelIT
      ? `${o.yLabelIT}${o.yUnit ? ` [${o.yUnit}]` : ''}`
      : unit
        ? `[${unit}]`
        : undefined;
    const axes: uPlot.Axis[] = [
      {
        ...axisCommon,
        ...(xLabel && !o.hideXAxis ? { label: xLabel } : {}),
        ...(o.hideXAxis ? { values: () => [], size: 8 } : {}),
      },
      // Fixed size: tick labels never change the plot area (no axis jumps).
      { ...axisCommon, size: ySize, splits: ySplits, ...(yLabel ? { label: yLabel } : {}) },
    ];
    if (o.yAxis2) {
      const factor = o.yAxis2.factor;
      axes.push({
        ...axisCommon,
        scale: 'y',
        side: 1,
        size: ySize,
        splits: ySplits,
        grid: { show: false },
        label: o.yAxis2.labelIT,
        values: (_u: uPlot, splits: number[]): string[] => {
          const vs = splits.map((v) => v * factor);
          const d = Math.min(3, tickDigits(vs) + 1);
          return vs.map((v) => formatIT(v, d));
        },
      });
    }
    return {
      width: width(),
      height,
      legend: { show: true, live: true },
      cursor: {
        drag: { x: false, y: false },
        points: { size: 6 },
        ...(o.syncKey ? { sync: { key: o.syncKey } } : {}),
      },
      hooks: { draw: [drawEvents] },
      scales: {
        x: {
          time: false,
          ...(o.xWindow
            ? {
                range: (_u: uPlot, _min: number, max: number): uPlot.Range.MinMax => [
                  Math.max(0, max - (o.xWindow ?? 0)),
                  Math.max(max, o.xWindow ?? 0),
                ],
              }
            : {}),
        },
        y: { auto: true, range: yRangeFn },
      },
      axes,
      series: [
        {
          label: o.xLabelIT ?? 'x',
          value: (_u, v) => (v === null || v === undefined ? '—' : formatIT(v, 3, o.xUnit)),
        },
        ...o.series.map((s): uPlot.Series => {
          const color = seriesColor(s.quantity, theme);
          return {
            label: s.labelIT,
            stroke: color,
            width: s.width ?? 2,
            ...(s.dash ? { dash: s.dash } : {}),
            ...(s.fill ? { fill: `${color}26` } : {}),
            points: { show: false },
            value: (_u, v) =>
              v === null || v === undefined ? '—' : formatIT(v, s.digits ?? 3, s.unit),
          };
        }),
      ],
    };
  };

  const row: number[] = [];
  // Column arrays reused by every redraw (uPlot reads them in setData; resized in place).
  const columns: (number | null)[][] = [];
  const data = (): uPlot.AlignedData =>
    buffer.toArraysInto(columns) as unknown as uPlot.AlignedData;

  let chart: uPlot | null = new uPlot(buildOptions(), data(), host);
  live.chart = chart;
  livePlots.add(live);
  hookPlots();
  let frame: number | null = null;
  let disposed = false;

  let lastDraw = -Infinity;
  const minInterval = 1000 / PLOT_MAX_HZ - 1; // ms (1 ms slack for rAF jitter)
  const redraw = (now: number): void => {
    frame = null;
    if (now - lastDraw < minInterval) {
      frame = requestAnimationFrame(redraw); // throttled: draw on a later frame
      return;
    }
    lastDraw = now;
    const d = data();
    pruneEvents(d[0] as ArrayLike<number>);
    chart?.setData(d, true);
    if (animating) scheduleRedraw(); // keep easing the y range toward its target
  };
  const pruneEvents = (xs: ArrayLike<number>): void => {
    const first = xs.length > 0 ? xs[0] : undefined;
    if (first === undefined) return;
    let k = 0;
    while (k < events.length && (events[k] as { x: number }).x < first) k++;
    if (k > 0) events.splice(0, k);
  };
  const scheduleRedraw = (): void => {
    if (frame === null && !disposed) frame = requestAnimationFrame(redraw);
  };

  const rebuild = (): void => {
    chart?.destroy();
    chart = new uPlot(buildOptions(), data(), host);
    live.chart = chart;
  };
  const offTheme = onThemeChange((next) => {
    if (disposed || next === theme) return;
    theme = next;
    rebuild();
  });
  // Fullscreen changes the axis font token: rebuild with the new size (range state kept).
  const onFullscreen = (): void => {
    if (disposed) return;
    const next = axisFontPx();
    if (next !== fontPx) {
      fontPx = next;
      rebuild();
    }
  };
  const doc = host.ownerDocument;
  doc.addEventListener(FULLSCREEN_EVENT, onFullscreen);

  let lastWidth = width();
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          const w = width();
          if (w !== lastWidth && chart) {
            lastWidth = w;
            chart.setSize({ width: w, height });
          }
        });
  ro?.observe(host);

  return {
    element,
    get chart() {
      return chart;
    },
    push(x, ...ys) {
      buffer.push(x, ys);
      scheduleRedraw();
    },
    setData(xs, ...ys) {
      buffer.clear();
      const n = Math.min(xs.length, capacity);
      const start = xs.length - n;
      row.length = ys.length;
      for (let k = start; k < xs.length; k++) {
        for (let c = 0; c < ys.length; c++) row[c] = (ys[c] as readonly number[])[k] ?? Number.NaN;
        buffer.push(xs[k] as number, row); // one reused row, no per-sample arrays
      }
      scheduleRedraw();
    },
    clear() {
      buffer.clear();
      events.length = 0;
      scheduleRedraw();
    },
    get yRange() {
      return shown ? ([shown[0], shown[1]] as [number, number]) : null;
    },
    setYRange(range) {
      manualRange = range ? sanitizeRange(range, shown ?? DEFAULT_RANGE) : null;
      scheduleRedraw();
    },
    markEvent(x, labelIT) {
      if (!Number.isFinite(x)) return;
      events.push({ x, label: labelIT ?? '' });
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
      scheduleRedraw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      ro?.disconnect();
      offTheme();
      doc.removeEventListener(FULLSCREEN_EVENT, onFullscreen);
      livePlots.delete(live);
      chart?.destroy();
      chart = null;
      live.chart = null;
      element.remove();
    },
  };
}
