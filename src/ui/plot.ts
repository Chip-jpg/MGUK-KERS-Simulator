import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatIT } from '../core/format';
import { currentTheme, onThemeChange } from '../core/theme';
import type { Disposable, Theme } from '../core/types';
import { getPalette, type Quantity } from './colors';
import { el } from './dom';
import { RingBuffer } from './ringBuffer';

/**
 * uPlot wrapper for live plots: ring-buffered `push()` (redraw at most once per
 * animation frame), §4.5 quantity colours that follow the theme toggle, Italian
 * number formatting on axes and legend, auto-resize, `dispose()`.
 */
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
  /** Fixed y range; default auto-scale. */
  yRange?: [number, number];
  /** Initial theme (default: the one on `<html>`). The plot follows later toggles itself. */
  theme?: Theme;
}

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
}

function seriesColor(q: PlotSeries['quantity'], theme: Theme): string {
  const p = getPalette(theme);
  if (!q || q === 'neutral') return p.neutral;
  if (q === 'accent') return p.accent;
  return p.quantity[q];
}

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

export function createPlot(container: HTMLElement, o: PlotOptions): Plot {
  const capacity = o.capacity ?? 600;
  const height = o.height ?? 220;
  const nSeries = o.series.length;
  const buffer = new RingBuffer(capacity, Math.max(1, nSeries));
  let theme: Theme = o.theme ?? currentTheme();

  const host = el('div', { class: 'plot__chart' });
  const element = el('figure', { class: 'plot', attrs: { 'aria-label': o.titleIT } }, [
    el('figcaption', { class: 'plot__title', text: o.titleIT }),
    host,
  ]);
  container.append(element);

  const width = (): number =>
    Math.max(200, Math.floor(host.clientWidth || container.clientWidth || 480));

  const buildOptions = (): uPlot.Options => {
    const p = getPalette(theme);
    const axisCommon = {
      stroke: p.textMuted,
      grid: { stroke: p.grid, width: 1 },
      ticks: { stroke: p.grid, width: 1 },
      values: axisValues,
      font: '12px system-ui, sans-serif',
      labelFont: '12px system-ui, sans-serif',
    };
    const xLabel = o.xLabelIT ? `${o.xLabelIT}${o.xUnit ? ` [${o.xUnit}]` : ''}` : undefined;
    return {
      width: width(),
      height,
      legend: { show: true, live: true },
      cursor: { drag: { x: false, y: false }, points: { size: 6 } },
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
        y: o.yRange
          ? { range: (): uPlot.Range.MinMax => [o.yRange?.[0] ?? 0, o.yRange?.[1] ?? 1] }
          : {},
      },
      axes: [
        { ...axisCommon, ...(xLabel ? { label: xLabel } : {}) },
        { ...axisCommon, size: 60, ...(o.yLabelIT ? { label: o.yLabelIT } : {}) },
      ],
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

  const data = (): uPlot.AlignedData => buffer.toArrays() as unknown as uPlot.AlignedData;

  let chart: uPlot | null = new uPlot(buildOptions(), data(), host);
  let frame: number | null = null;
  let disposed = false;

  const redraw = (): void => {
    frame = null;
    chart?.setData(data(), true);
  };
  const scheduleRedraw = (): void => {
    if (frame === null && !disposed) frame = requestAnimationFrame(redraw);
  };

  const offTheme = onThemeChange((next) => {
    if (disposed || next === theme) return;
    theme = next;
    chart?.destroy();
    chart = new uPlot(buildOptions(), data(), host);
  });

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
      for (let k = start; k < xs.length; k++) {
        buffer.push(
          xs[k] as number,
          ys.map((col) => col[k] ?? Number.NaN),
        );
      }
      scheduleRedraw();
    },
    clear() {
      buffer.clear();
      scheduleRedraw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      ro?.disconnect();
      offTheme();
      chart?.destroy();
      chart = null;
      element.remove();
    },
  };
}
