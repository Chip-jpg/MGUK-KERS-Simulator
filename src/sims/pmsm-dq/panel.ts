/**
 * DOM parts of the `pmsm-dq` simulator that do not need WebGL: notes, theory
 * links, preset data, live readouts and the d-q current plane (inline SVG with
 * current circle, voltage ellipse, MTPA curve, constant-torque curve and the
 * operating point). Testable in jsdom.
 */
import { el, formatIT, uniqueId } from '../../ui';
import type { Disposable } from '../../core/types';
import type { PmsmParams, PmsmRegion } from '../../physics';
import type { Pt } from './model';

/** Prominent honesty note (QA-007: the MGU-K type is not verified). */
export const REPRESENTATIVE_NOTE_IT =
  'Modello rappresentativo di una macchina trifase sincrona a magneti permanenti con parametri illustrativi; il tipo e i dati reali dell’MGU-K non sono pubblici.';

/** Text after "Modello semplificato:" (§9). */
export const MODEL_NOTE_IT =
  'modello d-q lineare, nessuna saturazione, perdite nel ferro trascurate, inverter ideale (tensione di fase limitata a Vₘₐₓ = tensione DC/√3); velocità del rotore imposta dall’esterno; animazione rallentata per rendere visibili le correnti trifase.';

/** In-panel theory links (16 is also the header link). */
export const THEORY_LINKS_IT: ReadonlyArray<{ labelIT: string; id: string }> = [
  { labelIT: 'Modello d-q (16)', id: '16-pmsm-dq' },
  { labelIT: 'Alternatore (07)', id: '07-alternatore-corrente-alternata' },
  { labelIT: 'Motore e forza di Lorentz (09)', id: '09-motore-elettrico-lorentz' },
  { labelIT: 'KERS/MGU-K (10)', id: '10-kers-mguk' },
];

export function createTheoryLinks(): HTMLElement {
  const parts: (Node | string)[] = ['Teoria: '];
  THEORY_LINKS_IT.forEach((l, k) => {
    if (k > 0) parts.push(' · ');
    parts.push(el('a', { text: l.labelIT, attrs: { href: `#/teoria/${l.id}` } }));
  });
  return el('p', { class: 'pm-theory-links' }, parts);
}

export const REGION_LABELS_IT: Record<PmsmRegion | 'manual', string> = {
  mtpa: 'Coppia costante (MTPA)',
  'field-weakening': 'Deflussaggio (potenza ≈ costante)',
  mtpv: 'Limite di tensione (MTPV)',
  infeasible: 'Oltre la velocità massima',
  manual: 'Correnti impostate a mano',
};

/** "Rₛ = 0,020 Ω · L_d = 0,20 mH …" as a small definition list. */
export function createMachineData(): { element: HTMLElement; update(m: PmsmParams): void } {
  const list = el('dl', { class: 'pm-machine__list' });
  const element = el('div', { class: 'pm-machine', attrs: { 'data-testid': 'pm-machine-data' } }, [
    list,
  ]);
  const update = (m: PmsmParams): void => {
    const rows: [string, string][] = [
      ['Resistenza di fase Rₛ', formatIT(m.Rs * 1e3, 0, 'mΩ')],
      ['Induttanza asse d', formatIT(m.Ld * 1e3, 2, 'mH')],
      ['Induttanza asse q', formatIT(m.Lq * 1e3, 2, 'mH')],
      ['Flusso dei magneti ψₘ', formatIT(m.psiM, 3, 'Wb')],
      ['Coppie polari p', formatIT(m.p, 0)],
    ];
    list.replaceChildren(
      ...rows.map(([k, v]) =>
        el('div', { class: 'pm-machine__row' }, [el('dt', { text: k }), el('dd', { text: v })]),
      ),
    );
  };
  return { element, update };
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

export interface ReadoutValues {
  torque: number;
  pMech: number;
  pElec: number;
  pCu: number;
  eta: number;
  id: number;
  iq: number;
  vd: number;
  vq: number;
  vRatio: number;
  baseRpm: number;
}

interface ReadoutDef {
  key: keyof ReadoutValues;
  labelIT: string;
  digits: number;
  unit?: string;
  scale?: number;
  quantity?: string;
}

export const READOUTS: readonly ReadoutDef[] = [
  { key: 'torque', labelIT: 'Coppia T', digits: 1, unit: 'N·m', quantity: 'f' },
  {
    key: 'pMech',
    labelIT: 'Potenza meccanica T·ωₘ',
    digits: 2,
    unit: 'kW',
    scale: 1e-3,
    quantity: 'energy',
  },
  {
    key: 'pElec',
    labelIT: 'Potenza elettrica (inverter)',
    digits: 2,
    unit: 'kW',
    scale: 1e-3,
    quantity: 'energy',
  },
  {
    key: 'pCu',
    labelIT: 'Perdite nel rame (Joule)',
    digits: 2,
    unit: 'kW',
    scale: 1e-3,
    quantity: 'energy',
  },
  { key: 'eta', labelIT: 'Rendimento η', digits: 1, unit: '%', scale: 100 },
  { key: 'id', labelIT: 'Corrente asse d', digits: 1, unit: 'A', quantity: 'i' },
  { key: 'iq', labelIT: 'Corrente asse q', digits: 1, unit: 'A', quantity: 'i' },
  { key: 'vd', labelIT: 'Tensione asse d', digits: 1, unit: 'V', quantity: 'emf' },
  { key: 'vq', labelIT: 'Tensione asse q', digits: 1, unit: 'V', quantity: 'emf' },
  {
    key: 'vRatio',
    labelIT: 'Utilizzo tensione |v|/Vₘₐₓ',
    digits: 1,
    unit: '%',
    scale: 100,
    quantity: 'emf',
  },
  { key: 'baseRpm', labelIT: 'Velocità base', digits: 0, unit: 'giri/min' },
];

export interface Readouts extends Disposable {
  readonly element: HTMLElement;
  update(v: ReadoutValues, regionIT: string, warningsIT: string): void;
  text(key: keyof ReadoutValues | 'region' | 'warnings'): string;
}

export function createReadouts(container: HTMLElement): Readouts {
  const list = el('dl', { class: 'pm-readouts__list' });
  const region = el('p', { class: 'pm-readouts__region', attrs: { 'data-key': 'region' } });
  const warnings = el('p', {
    class: 'pm-readouts__warn',
    attrs: { 'data-key': 'warnings', role: 'status' },
  });
  const element = el(
    'section',
    { class: 'pm-readouts', attrs: { 'aria-label': 'Grandezze misurate' } },
    [el('h3', { class: 'pm-subtitle', text: 'Grandezze misurate' }), region, list, warnings],
  );
  const nodes = new Map<keyof ReadoutValues, HTMLElement>();
  for (const d of READOUTS) {
    const dd = el('dd', { class: 'pm-readouts__value', text: '—', attrs: { 'data-key': d.key } });
    nodes.set(d.key, dd);
    list.append(
      el('div', { class: `pm-readouts__row${d.quantity ? ` q-${d.quantity}` : ''}` }, [
        el('dt', { text: d.labelIT }),
        dd,
      ]),
    );
  }
  container.append(element);
  const setText = (n: HTMLElement, txt: string): void => {
    if (n.textContent !== txt) n.textContent = txt;
  };
  return {
    element,
    update(v, regionIT, warningsIT) {
      for (const d of READOUTS) {
        setText(
          nodes.get(d.key) as HTMLElement,
          formatIT(v[d.key] * (d.scale ?? 1), d.digits, d.unit),
        );
      }
      setText(region, `Regione: ${regionIT}`);
      setText(warnings, warningsIT);
      warnings.hidden = warningsIT === '';
    },
    text: (k) =>
      k === 'region'
        ? (region.textContent ?? '')
        : k === 'warnings'
          ? (warnings.textContent ?? '')
          : (nodes.get(k)?.textContent ?? ''),
    dispose() {
      element.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// d-q current plane (SVG)
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/** View box of the plane (px) and plot margins. */
const W = 420;
const H = 340;
const PAD = 28;

/** Data window [A]: i_d ∈ [−1,5·S, 0,75·S], i_q ∈ [−1,15·S, 1,15·S] with S = scale. */
export function planeWindow(scale: number): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: -1.5 * scale, x1: 0.75 * scale, y0: -1.15 * scale, y1: 1.15 * scale };
}

/** Map (i_d, i_q) [A] to SVG px with equal scaling on both axes (circles look round). */
export function planeMapper(scale: number): (p: Pt) => Pt {
  const w = planeWindow(scale);
  const sx = (W - 2 * PAD) / (w.x1 - w.x0);
  const sy = (H - 2 * PAD) / (w.y1 - w.y0);
  const s = Math.min(sx, sy);
  const cx = PAD + (W - 2 * PAD - s * (w.x1 - w.x0)) / 2;
  const cy = PAD + (H - 2 * PAD - s * (w.y1 - w.y0)) / 2;
  return ([x, y]) => [cx + (x - w.x0) * s, cy + (w.y1 - y) * s];
}

/** SVG path "M…L…" of a polyline (empty for < 2 points). */
export function pathOf(pts: readonly Pt[], map: (p: Pt) => Pt): string {
  if (pts.length < 2) return '';
  return pts
    .map((p, k) => {
      const [x, y] = map(p);
      return `${k === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export interface PlaneCurves {
  circle: Pt[];
  ellipse: Pt[];
  mtpa: Pt[];
  mtpaGen: Pt[];
  torque: Pt[];
}

export interface DqPlane extends Disposable {
  readonly element: HTMLElement;
  /** Static curves (on any setting change). `scale` = I used for the window [A]. */
  setCurves(c: PlaneCurves, scale: number): void;
  /** Operating point (actual current) and set-point. */
  setPoint(op: Pt, ref: Pt): void;
  /** Rendered point in SVG px (tests). */
  pointPx(): Pt;
}

export function createDqPlane(container: HTMLElement): DqPlane {
  const clipId = uniqueId('pm-clip');
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pm-plane__svg', role: 'img' });
  const defs = svg('defs', {});
  const clip = svg('clipPath', { id: clipId });
  clip.append(svg('rect', { x: PAD, y: PAD, width: W - 2 * PAD, height: H - 2 * PAD }));
  defs.append(clip);
  const frame = svg('rect', {
    x: PAD,
    y: PAD,
    width: W - 2 * PAD,
    height: H - 2 * PAD,
    class: 'pm-plane__frame',
  });
  const axisD = svg('line', { class: 'pm-plane__axis' });
  const axisQ = svg('line', { class: 'pm-plane__axis' });
  /** "i_d [A]" with a real subscript (no ASCII pseudo-notation, QA-016). */
  const axisLabel = (sub: string, anchor: string): SVGTextElement => {
    const t = svg('text', { class: 'pm-plane__label', 'text-anchor': anchor }, 'i');
    t.append(svg('tspan', { 'baseline-shift': 'sub', 'font-size': '75%' }, sub), ' [A]');
    return t;
  };
  const labelD = axisLabel('d', 'end');
  const labelQ = axisLabel('q', 'start');
  const g = svg('g', { 'clip-path': `url(#${clipId})` });
  const ellipse = svg('path', { class: 'pm-plane__ellipse', fill: 'none' });
  const circle = svg('path', { class: 'pm-plane__circle', fill: 'none' });
  const mtpa = svg('path', { class: 'pm-plane__mtpa', fill: 'none' });
  const mtpaGen = svg('path', { class: 'pm-plane__mtpa', fill: 'none' });
  const torque = svg('path', { class: 'pm-plane__torque', fill: 'none' });
  const ref = svg('circle', { r: 7, class: 'pm-plane__ref' });
  const vec = svg('line', { class: 'pm-plane__vec' });
  const op = svg('circle', { r: 5.5, class: 'pm-plane__op' });
  g.append(ellipse, circle, mtpa, mtpaGen, torque, vec, ref, op);
  const ticks = svg('g', { class: 'pm-plane__ticks' });
  root.append(defs, frame, g, axisD, axisQ, ticks, labelD, labelQ);

  const legend = el('ul', { class: 'pm-plane__legend' }, [
    el('li', { class: 'pm-key pm-key--circle', text: 'Limite di corrente Iₘₐₓ' }),
    el('li', { class: 'pm-key pm-key--ellipse', text: 'Limite di tensione (ellisse)' }),
    el('li', { class: 'pm-key pm-key--mtpa', text: 'Curva MTPA' }),
    el('li', { class: 'pm-key pm-key--torque', text: 'Coppia costante T' }),
    el('li', { class: 'pm-key pm-key--op', text: 'Punto di lavoro (○ = richiesto)' }),
  ]);
  const captionId = uniqueId('pm-plane-cap');
  const caption = el('figcaption', {
    class: 'pm-plane__caption',
    text: 'Le correnti ammesse stanno dentro il cerchio e, a regime, dentro l’ellisse: più è alta la velocità, più l’ellisse si stringe.',
    attrs: { id: captionId },
  });
  root.setAttribute('aria-labelledby', captionId);
  const element = el('figure', { class: 'pm-plane', attrs: { 'data-testid': 'pm-dq-plane' } }, [
    el('h3', { class: 'pm-subtitle', text: 'Piano delle correnti d-q' }),
    root,
    legend,
    caption,
  ]);
  container.append(element);

  let map = planeMapper(400);
  let last: Pt = [0, 0];
  const setCurves = (c: PlaneCurves, scale: number): void => {
    map = planeMapper(scale);
    circle.setAttribute('d', pathOf(c.circle, map));
    ellipse.setAttribute('d', pathOf(c.ellipse, map));
    mtpa.setAttribute('d', pathOf(c.mtpa, map));
    mtpaGen.setAttribute('d', pathOf(c.mtpaGen, map));
    torque.setAttribute('d', pathOf(c.torque, map));
    const w = planeWindow(scale);
    const [ox, oy] = map([0, 0]);
    const [xl] = map([w.x0, 0]);
    const [xr] = map([w.x1, 0]);
    const [, yt] = map([0, w.y1]);
    const [, yb] = map([0, w.y0]);
    for (const [ln, a] of [
      [axisD, { x1: xl, y1: oy, x2: xr, y2: oy }],
      [axisQ, { x1: ox, y1: yb, x2: ox, y2: yt }],
    ] as const) {
      for (const [k, v] of Object.entries(a)) ln.setAttribute(k, v.toFixed(1));
    }
    labelD.setAttribute('x', (xr - 2).toFixed(1));
    labelD.setAttribute('y', (oy - 6).toFixed(1));
    labelQ.setAttribute('x', (ox + 6).toFixed(1));
    labelQ.setAttribute('y', (yt + 12).toFixed(1));
    // ticks every "nice" step
    const raw = scale / 2;
    const p10 = 10 ** Math.floor(Math.log10(raw));
    const stepA = [1, 2, 5, 10].map((f) => f * p10).find((s) => s >= raw) ?? raw;
    const tickNodes: SVGElement[] = [];
    for (let v = Math.ceil(w.x0 / stepA) * stepA; v <= w.x1; v += stepA) {
      if (Math.abs(v) < 1e-9) continue;
      const [x] = map([v, 0]);
      tickNodes.push(svg('line', { x1: x, y1: oy - 3, x2: x, y2: oy + 3 }));
      tickNodes.push(
        svg(
          'text',
          { x, y: oy + 15, 'text-anchor': 'middle', class: 'pm-plane__tick' },
          formatIT(v, 0),
        ),
      );
    }
    for (let v = Math.ceil(w.y0 / stepA) * stepA; v <= w.y1; v += stepA) {
      if (Math.abs(v) < 1e-9) continue;
      const [, y] = map([0, v]);
      tickNodes.push(svg('line', { x1: ox - 3, y1: y, x2: ox + 3, y2: y }));
      tickNodes.push(
        svg(
          'text',
          { x: ox - 6, y: y + 4, 'text-anchor': 'end', class: 'pm-plane__tick' },
          formatIT(v, 0),
        ),
      );
    }
    ticks.replaceChildren(...tickNodes);
  };
  const setPoint = (p: Pt, r: Pt): void => {
    const [x, y] = map(p);
    const [rx, ry] = map(r);
    const [ox, oy] = map([0, 0]);
    last = [x, y];
    op.setAttribute('cx', x.toFixed(1));
    op.setAttribute('cy', y.toFixed(1));
    ref.setAttribute('cx', rx.toFixed(1));
    ref.setAttribute('cy', ry.toFixed(1));
    vec.setAttribute('x1', ox.toFixed(1));
    vec.setAttribute('y1', oy.toFixed(1));
    vec.setAttribute('x2', x.toFixed(1));
    vec.setAttribute('y2', y.toFixed(1));
  };
  return {
    element,
    setCurves,
    setPoint,
    pointPx: () => last,
    dispose() {
      element.remove();
    },
  };
}
