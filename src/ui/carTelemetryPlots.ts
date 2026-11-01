import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import { el, uniqueId } from './dom';
import { createPlot, type Plot } from './plot';

/**
 * Live car telemetry (F2): four stacked plots on one scrolling time axis (default
 * window 20 s) with a linked hover crosshair (uPlot cursor sync):
 *
 * 1. v [km/h] — neutral;
 * 2. a [m/s²] — force green, signed (+ spinta, − frenata), right axis in g;
 * 3. P [kW] — P_MGU-K (energy, solid; + erogazione, − recupero) and P_freni (heat,
 *    dashed [6, 4]);
 * 4. SoC [%] — energy, dotted [2, 3], fixed 0–100 %.
 *
 * `push()` takes SI values (m/s, m/s², W, SoC in [0, 1]) and decimates to at most
 * {@link TELEMETRY_SAMPLES} samples per window, so it can be called every physics step.
 * Ranges use the plot's safe, smoothed y-range logic; v and P are nice-rounded
 * analytic ranges from the visible data, a is symmetric.
 */

export interface TelemetrySample {
  /** Speed [m/s]. */
  v: number;
  /** Longitudinal acceleration [m/s²] (+ accelerating, − braking). */
  a: number;
  /** MGU-K power at the wheels [W] (+ deploy, − harvest). */
  pKers: number;
  /** Disc-brake dissipation [W] (≥ 0). */
  pBrakes: number;
  /** State of charge [0, 1]. */
  soc: number;
}

export interface CarTelemetryOptions {
  /** Visible time window [s]. Default 20. */
  windowS?: number;
  /** Height of each plot [CSS px]. Default 140. */
  height?: number;
}

export interface CarTelemetryPlots extends Disposable {
  readonly element: HTMLElement;
  /** Append a sample at time `t` [s] (a time going backwards clears the plots). */
  push(t: number, s: TelemetrySample): void;
  clear(): void;
  /** Vertical tick on every plot at time `t` (label on the top plot only). */
  markEvent(t: number, labelIT?: string): void;
  /** The four plots (v, a, P, SoC), e.g. for tests. */
  readonly plots: readonly Plot[];
}

/** Samples kept per visible window (decimation target). */
export const TELEMETRY_SAMPLES = 600;
const G = 9.80665;

/** Round `x` up to a multiple of `step` (at least `step`). */
export function ceilTo(x: number, step: number): number {
  if (!Number.isFinite(x) || x <= 0) return step;
  return Math.max(step, Math.ceil(x / step) * step);
}

/** 1-2-5 "nice" step for a span (e.g. 37 → 10 → ticks every 10). */
export function niceStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(span));
  const f = span / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

/** Speed range [km/h]: [0, nice ceil of the visible max], at least 0–100. */
export function speedRange(_lo: number, hi: number): [number, number] {
  return [0, ceilTo(Math.max(Number.isFinite(hi) ? hi : 0, 100) * 1.05, 50)];
}

/** Symmetric range ±(nice ceil of |max|), at least ±`minHalf`. */
export function symmetricNice(lo: number, hi: number, minHalf: number): [number, number] {
  const m = Math.max(
    Math.abs(Number.isFinite(lo) ? lo : 0),
    Math.abs(Number.isFinite(hi) ? hi : 0),
  );
  const h = ceilTo(Math.max(m * 1.05, minHalf), niceStep(Math.max(m, minHalf)) / 5);
  return [-h, h];
}

/** Power range [kW]: covers the data and 0, nice-rounded, at least −50…+50 kW. */
export function powerRange(lo: number, hi: number): [number, number] {
  const l = Math.min(Number.isFinite(lo) ? lo : 0, -50);
  const h = Math.max(Number.isFinite(hi) ? hi : 0, 50);
  const step = niceStep(h - l) / 5;
  return [-ceilTo(-l * 1.05, step), ceilTo(h * 1.05, step)];
}

export function createCarTelemetryPlots(
  container: HTMLElement,
  o: CarTelemetryOptions = {},
): CarTelemetryPlots {
  const windowS = o.windowS && o.windowS > 0 ? o.windowS : 20;
  const height = o.height ?? 140;
  const syncKey = uniqueId('telemetry');
  const minDt = windowS / TELEMETRY_SAMPLES;
  const capacity = TELEMETRY_SAMPLES + 20;

  const element = el('div', {
    class: 'telemetry',
    attrs: { role: 'group', 'aria-label': t.telemetry.title },
  });
  container.append(element);
  const slot = (): HTMLElement => {
    const s = el('div', { class: 'telemetry__plot' });
    element.append(s);
    return s;
  };
  const common = {
    xLabelIT: t.telemetry.time,
    xUnit: 's',
    xWindow: windowS,
    capacity,
    height,
    syncKey,
  };

  const pv = createPlot(slot(), {
    ...common,
    titleIT: t.telemetry.speedPlot,
    series: [{ labelIT: t.telemetry.speed, unit: 'km/h', quantity: 'neutral', digits: 0 }],
    yRange: speedRange,
    hideXAxis: true,
  });
  const pa = createPlot(slot(), {
    ...common,
    titleIT: t.telemetry.accelPlot,
    series: [{ labelIT: t.telemetry.accel, unit: 'm/s²', quantity: 'f', digits: 1 }],
    yRange: (lo, hi) => symmetricNice(lo, hi, 10),
    yAxis2: { labelIT: t.telemetry.accelG, factor: 1 / G },
    hideXAxis: true,
  });
  const pp = createPlot(slot(), {
    ...common,
    titleIT: t.telemetry.powerPlot,
    series: [
      { labelIT: t.telemetry.pKers, unit: 'kW', quantity: 'energy', digits: 0 },
      { labelIT: t.telemetry.pBrakes, unit: 'kW', quantity: 'heat', digits: 0, dash: [6, 4] },
    ],
    yRange: powerRange,
    hideXAxis: true,
  });
  const ps = createPlot(slot(), {
    ...common,
    titleIT: t.telemetry.socPlot,
    series: [{ labelIT: t.telemetry.soc, unit: '%', quantity: 'energy', digits: 1, dash: [2, 3] }],
    yRange: [0, 100],
  });
  const plots = [pv, pa, pp, ps] as const;

  let lastT = -Infinity;
  const clear = (): void => {
    lastT = -Infinity;
    for (const p of plots) p.clear();
  };

  return {
    element,
    plots,
    push(time, s) {
      if (!Number.isFinite(time)) return;
      if (time < lastT) clear(); // reset / restart
      if (time - lastT < minDt) return; // decimate
      lastT = time;
      pv.push(time, s.v * 3.6);
      pa.push(time, s.a);
      pp.push(time, s.pKers / 1000, s.pBrakes / 1000);
      ps.push(time, s.soc * 100);
    },
    clear,
    markEvent(time, labelIT) {
      plots.forEach((p, k) => p.markEvent(time, k === 0 ? labelIT : undefined));
    },
    dispose() {
      for (const p of plots) p.dispose();
      element.remove();
    },
  };
}
