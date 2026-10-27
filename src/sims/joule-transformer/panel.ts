import { el, formatIT } from '../../ui';
import { lossCurve, lossReductionFactor, siPrefix, type TransmissionResult } from './model';

/**
 * DOM panels of `joule-transformer`: live results (power conservation badge,
 * line loss) and the loss-vs-voltage comparison chart (log-log SVG + bars)
 * with the highlighted pair V and 10·V. All numbers via `formatIT`.
 */

/** Format a value with an automatic SI prefix: 12 500 W → "12,5 kW". */
export function fmtSI(value: number, baseUnit: string, digits = 3): string {
  if (!Number.isFinite(value)) return formatIT(Number.NaN);
  const { scale, unit } = siPrefix(value, baseUnit);
  const v = value * scale;
  const d = Math.max(0, digits - (Math.abs(v) >= 100 ? 3 : Math.abs(v) >= 10 ? 2 : 1));
  return formatIT(v, d, unit);
}

/** Percentage with digits adapted to the magnitude: 0,125 %, 12,5 %. */
export function fmtPercent(fraction: number): string {
  const p = fraction * 100;
  const d = p === 0 ? 0 : p < 0.01 ? 4 : p < 1 ? 3 : p < 10 ? 2 : 1;
  return formatIT(p, d, '%');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface ResultsPanel {
  readonly element: HTMLElement;
  update(r: TransmissionResult): void;
  dispose(): void;
}

/** Live results: V₂, currents, power conservation badge, loss. */
export function createResultsPanel(container: HTMLElement): ResultsPanel {
  const rows: Record<string, HTMLElement> = {};
  const row = (key: string, labelIT: string, q?: string): HTMLElement => {
    const value = el('dd', { class: 'jt-results__value', dataset: { testid: key } });
    rows[key] = value;
    return el('div', { class: `jt-results__row${q ? ` q-${q}` : ''}` }, [
      el('dt', { text: labelIT }),
      value,
    ]);
  };
  const badge = el('p', {
    class: 'jt-badge',
    attrs: { role: 'status', 'data-testid': 'power-badge' },
  });
  const warning = el('p', { class: 'callout callout--danger jt-warning', attrs: { hidden: true } });
  const element = el('section', { class: 'jt-results', attrs: { 'aria-label': 'Risultati' } }, [
    el('h3', { class: 'jt-subtitle', text: 'Risultati' }),
    el('dl', { class: 'jt-results__list' }, [
      row('V2', 'Tensione di linea V₂', 'emf'),
      row('I1', 'Corrente primario I₁', 'i'),
      row('I2', 'Corrente di linea I₂ = P/V₂', 'i'),
      row('loss', 'Perdita Joule R·I²', 'energy'),
      row('fraction', 'Frazione persa', 'energy'),
      row('delivered', 'Potenza consegnata', 'energy'),
      row('Vout', 'Tensione alle utenze', 'emf'),
    ]),
    badge,
    warning,
  ]);
  container.append(element);
  const set = (k: string, text: string): void => {
    const node = rows[k];
    if (node && node.textContent !== text) node.textContent = text;
  };
  return {
    element,
    update(r) {
      set('V2', fmtSI(r.V2, 'V'));
      set('I1', fmtSI(r.I1, 'A'));
      set('I2', fmtSI(r.I2, 'A'));
      set('loss', fmtSI(r.line.loss, 'W'));
      set('fraction', fmtPercent(r.line.fraction));
      set('delivered', r.valid ? fmtSI(r.delivered, 'W') : formatIT(Number.NaN));
      set('Vout', r.valid ? fmtSI(r.Vout, 'V') : formatIT(Number.NaN));
      const ok = r.powerMismatch < 1e-9;
      badge.className = `jt-badge${ok ? ' jt-badge--ok' : ''}`;
      badge.textContent = `${ok ? '✓' : '✗'} Potenza conservata: V₁I₁ = ${fmtSI(r.P1, 'W', 4)} = V₂I₂ = ${fmtSI(r.P2, 'W', 4)}`;
      warning.hidden = r.valid;
      warning.textContent = r.valid
        ? ''
        : 'Fuori dal campo di validità: la linea dissiperebbe più potenza di quella trasportata. Aumenta la tensione o riduci R.';
    },
    dispose() {
      element.remove();
    },
  };
}

export interface ComparisonChart {
  readonly element: HTMLElement;
  /** Redraw for the given state. Returns the computed reduction factor. */
  update(r: TransmissionResult, P: number, Rline: number): number;
  dispose(): void;
}

const W = 520;
const H = 260;
const M = { l: 70, r: 16, t: 14, b: 40 };
const VMIN = 1e3;
const VMAX = 1e6;

/**
 * Loss vs transmission voltage at equal P and R (log-log: a straight line of
 * slope −2), highlighted pair V₁ and 10·V₁ with the computed "÷100", marker
 * for the current V₂, plus linear bars for the three cases.
 */
export function createComparisonChart(container: HTMLElement): ComparisonChart {
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'jt-chart__svg',
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const desc = svg('desc');
  root.append(desc);
  const gGrid = svg('g', { class: 'jt-chart__grid' });
  const gValidity = svg('g');
  const curve = svg('path', { class: 'jt-chart__curve', fill: 'none' });
  const gMarks = svg('g');
  root.append(gGrid, gValidity, curve, gMarks);

  const factorNode = el('strong', {
    class: 'jt-factor__value',
    attrs: { 'data-testid': 'loss-factor' },
  });
  const sentence = el('p', { class: 'jt-factor', attrs: { 'aria-live': 'polite' } }, [
    'Con tensione ×10 le perdite si riducono di un fattore ',
    factorNode,
  ]);
  const bars = el('div', { class: 'jt-bars' });
  const element = el('figure', { class: 'plot jt-chart' }, [
    el('figcaption', {
      class: 'plot__title',
      text: 'Perdite di linea al variare della tensione (stessa P, stessa R)',
    }),
    sentence,
    root,
    bars,
  ]);
  container.append(element);

  const x = (V: number): number =>
    M.l +
    ((Math.log10(V) - Math.log10(VMIN)) / (Math.log10(VMAX) - Math.log10(VMIN))) * (W - M.l - M.r);

  const barRow = (labelIT: string, loss: number, max: number, fraction: number, cls: string) => {
    const w = max > 0 ? Math.max(0.4, Math.min(100, (loss / max) * 100)) : 0;
    return el('div', { class: `jt-bar ${cls}` }, [
      el('span', { class: 'jt-bar__label', text: labelIT }),
      el('span', { class: 'jt-bar__track' }, [
        el('span', { class: 'jt-bar__fill', attrs: { style: `width:${w.toFixed(2)}%` } }),
      ]),
      el('span', { class: 'jt-bar__value', text: `${fmtSI(loss, 'W')} (${fmtPercent(fraction)})` }),
    ]);
  };

  return {
    element,
    update(r, P, Rline) {
      const V = r.V1;
      const factor = lossReductionFactor(P, V, Rline, 10);
      factorNode.textContent = formatIT(factor, 1);

      // y axis: decades from the loss at VMAX up to P (beyond P the model is invalid).
      const lossAt = (v: number): number => (Rline * P * P) / (v * v);
      const yMinExp = Math.floor(Math.log10(Math.max(lossAt(VMAX), 1e-3)));
      const yMaxExp = Math.ceil(Math.log10(P));
      const y = (L: number): number => {
        const e = Math.log10(Math.max(L, 10 ** yMinExp));
        return M.t + (1 - (e - yMinExp) / (yMaxExp - yMinExp)) * (H - M.t - M.b);
      };

      gGrid.replaceChildren();
      for (let e = 3; e <= 6; e++) {
        const xv = x(10 ** e);
        gGrid.append(
          svg('line', { x1: xv, x2: xv, y1: M.t, y2: H - M.b }),
          svg(
            'text',
            { x: xv, y: H - M.b + 16, 'text-anchor': 'middle', class: 'jt-chart__tick' },
            fmtSI(10 ** e, 'V', 1),
          ),
        );
      }
      const step = yMaxExp - yMinExp > 6 ? 2 : 1;
      for (let e = yMinExp; e <= yMaxExp; e += step) {
        const yv = y(10 ** e);
        gGrid.append(
          svg('line', { x1: M.l, x2: W - M.r, y1: yv, y2: yv }),
          svg(
            'text',
            { x: M.l - 6, y: yv + 4, 'text-anchor': 'end', class: 'jt-chart__tick' },
            fmtSI(10 ** e, 'W', 1),
          ),
        );
      }
      gGrid.append(
        svg(
          'text',
          { x: (M.l + W - M.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'jt-chart__axis' },
          'Tensione di trasmissione V (scala log)',
        ),
      );

      // Validity limit: loss = P.
      gValidity.replaceChildren(
        svg('line', { x1: M.l, x2: W - M.r, y1: y(P), y2: y(P), class: 'jt-chart__limit' }),
        svg(
          'text',
          { x: W - M.r - 4, y: y(P) + 14, 'text-anchor': 'end', class: 'jt-chart__note' },
          'perdita = P (limite del modello)',
        ),
      );

      const c = lossCurve(P, Rline, VMIN, VMAX, 64);
      let d = '';
      c.V.forEach((v, k) => {
        const L = c.loss[k] ?? 0;
        if (L > P * 1.0001) return;
        d += `${d ? 'L' : 'M'}${x(v).toFixed(1)},${y(L).toFixed(1)}`;
      });
      curve.setAttribute('d', d);

      // Highlighted pair V, 10·V and the current V₂.
      const lowL = lossAt(V);
      const highL = lossAt(10 * V);
      gMarks.replaceChildren();
      // Labels sit below-left of each point: the curve (slope −2) never passes there.
      const point = (v: number, L: number, cls: string, label: string): void => {
        if (v < VMIN || v > VMAX) return;
        const cy = y(Math.min(L, P));
        gMarks.append(
          svg('circle', { cx: x(v), cy, r: 5, class: cls }),
          label
            ? svg(
                'text',
                { x: x(v) - 8, y: cy + 18, 'text-anchor': 'end', class: 'jt-chart__label' },
                label,
              )
            : svg('g'),
        );
      };
      const xl = x(V);
      const xh = x(10 * V);
      gMarks.append(
        svg('path', {
          d: `M${xl},${y(lowL)} L${xh},${y(lowL)} L${xh},${y(highL)}`,
          class: 'jt-chart__pair',
          fill: 'none',
        }),
        svg(
          'text',
          { x: (xl + xh) / 2, y: y(lowL) - 6, 'text-anchor': 'middle', class: 'jt-chart__label' },
          '×10 tensione',
        ),
        svg(
          'text',
          { x: xh + 6, y: (y(lowL) + y(highL)) / 2, class: 'jt-chart__factor' },
          `÷${formatIT(factor, 0)}`,
        ),
      );
      const sameAsHigh = Math.abs(r.V2 / (10 * V) - 1) < 0.05;
      point(V, lowL, 'jt-chart__pt jt-chart__pt--low', `V₁ = ${fmtSI(V, 'V', 2)}`);
      point(
        10 * V,
        highL,
        'jt-chart__pt jt-chart__pt--high',
        `10·V₁ = ${fmtSI(10 * V, 'V', 2)}${sameAsHigh ? ' (= V₂ attuale)' : ''}`,
      );
      point(
        r.V2,
        r.line.loss,
        'jt-chart__pt jt-chart__pt--now',
        sameAsHigh ? '' : `V₂ attuale = ${fmtSI(r.V2, 'V', 3)}`,
      );

      desc.textContent = `Perdite R·I² in funzione della tensione: a ${fmtSI(V, 'V')} ${fmtSI(lowL, 'W')}, a ${fmtSI(10 * V, 'V')} ${fmtSI(highL, 'W')}; fattore ${formatIT(factor, 1)}.`;
      root.setAttribute('aria-label', desc.textContent);

      const max = Math.max(lowL, r.line.loss);
      bars.replaceChildren(
        barRow(
          `Linea a V₁ = ${fmtSI(V, 'V', 2)} (senza elevatore)`,
          lowL,
          max,
          lowL / P,
          'jt-bar--low',
        ),
        barRow(`Linea a 10·V₁ = ${fmtSI(10 * V, 'V', 2)}`, highL, max, highL / P, 'jt-bar--high'),
        barRow(
          `Linea a V₂ = ${fmtSI(r.V2, 'V', 3)} (attuale)`,
          r.line.loss,
          max,
          r.line.fraction,
          'jt-bar--now',
        ),
      );
      return factor;
    },
    dispose() {
      element.remove();
    },
  };
}
