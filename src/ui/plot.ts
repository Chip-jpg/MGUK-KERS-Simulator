import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatIT } from '../core/format';
import { currentTheme, onThemeChange } from '../core/theme';
import type { Disposable, Theme } from '../core/types';
import { getPalette, type Quantity } from './colors';
import { el } from './dom';
import { RingBuffer } from './ringBuffer';
import { finiteRange, rangeTicks } from '../physics/plot-range';

/**
 * uPlot wrapper for live plots: ring-buffered `push()` (redraw at most
 * {@link PLOT_MAX_HZ} times per second, into preallocated column arrays — no
 * per-redraw copies once the buffer is full), §4.5 quantity colours that follow
 * the theme toggle, Italian number formatting on axes and legend, auto-resize,
 * `dispose()`.
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
  points?: boolean;
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
  /** Logarithmic x axis (positive samples only). */
  xLog?: boolean;
  xRange?: [number, number];
  xMarkers?: readonly { value: number; labelIT: string }[];
  syncKey?: string;
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
  /** New analytical range; converges over 200 ms instead of jumping each frame. */
  setYRange(range: [number, number]): void;
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
  return splits.map((v) => (Number.isFinite(v) ? formatIT(v, d) : ''));
};

export function createPlot(container: HTMLElement, o: PlotOptions): Plot {
  const capacity = o.capacity ?? 600;
  const height = o.height ?? 220;
  const nSeries = o.series.length;
  const buffer = new RingBuffer(capacity, Math.max(1, nSeries));
  let theme: Theme = o.theme ?? currentTheme();
  let targetRange = o.yRange;
  let shownRange = targetRange?.slice() as [number, number] | undefined;
  let rangeChangedMs = -Infinity;
  let fromRange = shownRange;

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
    const projector = !!container.closest('.sim-presentation');
    const fontSize = projector ? 16 : 12;
    const axisCommon = {
      stroke: p.textMuted,
      grid: { stroke: p.grid, width: 1 },
      ticks: { stroke: p.grid, width: 1 },
      values: axisValues,
      font: `${fontSize}px system-ui, sans-serif`,
      labelFont: `${fontSize}px system-ui, sans-serif`,
    };
    const xLabel = o.xLabelIT ? `${o.xLabelIT}${o.xUnit ? ` [${o.xUnit}]` : ''}` : undefined;
    return {
      width: width(),
      height,
      legend: { show: true, live: true },
      cursor: {
        drag: { x: false, y: false },
        points: { size: 6 },
        ...(o.syncKey ? { sync: { key: o.syncKey, scales: ['x', null] as [string, null] } } : {}),
      },
      scales: {
        x: {
          time: false,
          ...(o.xLog ? { distr: 3 } : {}),
          ...(o.xRange ? { range: (): [number, number] => o.xRange! } : {}),
          ...(o.xWindow
            ? {
                range: (_u: uPlot, _min: number, max: number): uPlot.Range.MinMax => [
                  Math.max(0, max - (o.xWindow ?? 0)),
                  Math.max(max, o.xWindow ?? 0),
                ],
              }
            : {}),
        },
        y: { range: (_u, min, max): uPlot.Range.MinMax => shownRange ?? finiteRange(min, max) },
      },
      axes: [
        {
          ...axisCommon,
          ...(xLabel ? { label: xLabel } : {}),
          ...(o.xLog
            ? {
                splits: (_u: uPlot, _axis: number, min: number, max: number) =>
                  [1, 10, 100, 400].filter((v) => v >= min && v <= max),
                filter: (_u: uPlot, splits: number[]) => splits,
              }
            : {}),
        },
        {
          ...axisCommon,
          size: 70,
          ...(o.yLabelIT ? { label: o.yLabelIT } : {}),
          splits: (_u, _axis, min, max) => rangeTicks(min, max),
          values: (u, splits) => {
            const abs = Math.max(...splits.map(Math.abs));
            const labels =
              abs > 0 && (abs < 1e-4 || abs >= 1e8)
                ? splits.map((v) => (v === 0 ? '0' : v.toExponential(2).replace('.', ',')))
                : axisValues(u, splits);
            element.dataset['yTicks'] = labels.join('|');
            element.dataset['yUnit'] = o.yLabelIT ?? '';
            return labels;
          },
        },
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
            width: (s.width ?? 2) * (projector ? 1.5 : 1),
            ...(s.dash ? { dash: s.dash } : {}),
            ...(s.fill ? { fill: `${color}26` } : {}),
            points: { show: s.points ?? false, size: s.points ? 10 : 0 },
            value: (_u, v) =>
              v === null || v === undefined ? '—' : formatIT(v, s.digits ?? 3, s.unit),
          };
        }),
      ],
      hooks: {
        draw: [
          (u) => {
            element.dataset['xMin'] = String(u.scales['x']?.min);
            element.dataset['xMax'] = String(u.scales['x']?.max);
            if (!o.xMarkers) return;
            const c = u.ctx;
            c.save();
            c.strokeStyle = p.textMuted;
            c.fillStyle = p.textMuted;
            c.lineWidth = devicePixelRatio;
            c.font = `${12 * devicePixelRatio}px system-ui`;
            o.xMarkers.forEach((m, i) => {
              if (m.value < (u.scales['x']?.min ?? 0) || m.value > (u.scales['x']?.max ?? 0))
                return;
              const x = u.valToPos(m.value, 'x', true);
              c.setLineDash([3 * devicePixelRatio, 4 * devicePixelRatio]);
              c.beginPath();
              c.moveTo(x, u.bbox.top);
              c.lineTo(x, u.bbox.top + u.bbox.height);
              c.stroke();
              c.fillText(
                m.labelIT,
                Math.min(x + 3, u.bbox.left + u.bbox.width - 45 * devicePixelRatio),
                u.bbox.top + (14 + (i % 3) * 15) * devicePixelRatio,
              );
            });
            c.restore();
          },
        ],
      },
    };
  };

  const row: number[] = [];
  // Column arrays reused by every redraw (uPlot reads them in setData; resized in place).
  const columns: (number | null)[][] = [];
  const data = (): uPlot.AlignedData =>
    buffer.toArraysInto(columns) as unknown as uPlot.AlignedData;

  let chart: uPlot | null = new uPlot(buildOptions(), data(), host);
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
    if (targetRange && fromRange) {
      const mix = Math.min(1, Math.max(0, (now - rangeChangedMs) / 200));
      shownRange = [
        fromRange[0] + (targetRange[0] - fromRange[0]) * mix,
        fromRange[1] + (targetRange[1] - fromRange[1]) * mix,
      ];
      if (mix < 1) scheduleRedraw();
    }
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
  const layout = container.closest('.sim-layout');
  const presentation = (): void => {
    if (disposed) return;
    chart?.destroy();
    chart = new uPlot(buildOptions(), data(), host);
  };
  layout?.addEventListener('kers-presentation-change', presentation);

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
      scheduleRedraw();
    },
    setYRange(range) {
      const safe =
        range.every(Number.isFinite) && range[1] > range[0] ? range : finiteRange(...range);
      if (targetRange?.[0] === safe[0] && targetRange[1] === safe[1]) return;
      fromRange = shownRange ?? safe;
      targetRange = safe;
      rangeChangedMs = performance.now();
      scheduleRedraw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      ro?.disconnect();
      offTheme();
      layout?.removeEventListener('kers-presentation-change', presentation);
      chart?.destroy();
      chart = null;
      element.remove();
    },
  };
}
