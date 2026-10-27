/**
 * DOM parts of the `alternator-motor` simulator that do not need WebGL:
 * the three-phase note, the live readouts and the energy-flow diagram
 * (inline SVG, arrow thickness ∝ power). Testable in jsdom.
 */
import { el, formatIT, uniqueId } from '../../ui';
import type { Disposable } from '../../core/types';
import type { MachineMode } from './model';

export const THREE_PHASE_NOTE_IT =
  "Nota: l'MGU-K reale è una macchina sincrona trifase a magneti permanenti; qui usiamo una sola spira (modello monofase delle slide 18–19).";

export const MODEL_NOTE_IT =
  'B uniforme, una spira rettangolare, nessuna saturazione o perdita nel ferro, alimentazione ideale; autoinduzione della spira trascurata, batteria in frenata modellata come carico resistivo equivalente R_c, motore con alimentazione sincronizzata v_s = V_s·sin θ (corrente sempre in fase con la f.e.m., coppia media positiva), velocità limitata a 150 rad/s.';

/** Captions of the three nodes and of the loss node, per mode. */
export const FLOW_LABELS_IT: Record<
  MachineMode,
  { nodes: [string, string, string]; loss: string; sentence: string }
> = {
  generator: {
    nodes: ['Energia cinetica', 'Energia elettrica', 'Batteria'],
    loss: 'Calore Joule',
    sentence: 'Energia cinetica → energia elettrica → batteria (+ calore Joule)',
  },
  motor: {
    nodes: ['Batteria', 'Energia elettrica', 'Energia meccanica'],
    loss: 'Calore Joule',
    sentence: 'Batteria → energia elettrica → energia meccanica (+ calore Joule)',
  },
};

/** Powers driving the flow arrows (cycle-averaged, W). */
export interface FlowPowers {
  /** Arrow 1: generator mechanical → electrical (emf·i); motor battery → electrical (v_s·i). */
  p1: number;
  /** Arrow 2: generator electrical → battery (R_c·i²); motor electrical → mechanical (emf·i). */
  p2: number;
  /** Joule loss R_w·i². */
  pLoss: number;
}

export const ARROW_MIN_PX = 1.5;
export const ARROW_MAX_PX = 16;

/** Stroke width ∝ power: ARROW_MIN + (MAX − MIN)·P/P_ref (clamped). */
export function arrowWidth(p: number, pRef: number): number {
  if (!(pRef > 0) || !(p > 0)) return ARROW_MIN_PX;
  return ARROW_MIN_PX + (ARROW_MAX_PX - ARROW_MIN_PX) * Math.min(1, p / pRef);
}

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

export interface EnergyFlow extends Disposable {
  readonly element: HTMLElement;
  setMode(mode: MachineMode): void;
  update(p: FlowPowers): void;
  /** Current stroke widths [arrow1, arrow2, loss] (tests). */
  widths(): [number, number, number];
}

export function createEnergyFlow(container: HTMLElement, mode: MachineMode): EnergyFlow {
  const head = uniqueId('am-head');
  const headLoss = uniqueId('am-head-loss');
  const W = 600;
  const H = 190;
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'am-flow__svg',
    role: 'img',
    'aria-labelledby': '',
  });
  const nodeX = [90, 300, 510];
  const nodeY = 60;
  const boxes = nodeX.map((x) =>
    svg('rect', {
      x: x - 80,
      y: nodeY - 24,
      width: 160,
      height: 48,
      rx: 8,
      class: 'am-flow__node',
    }),
  );
  const labels = nodeX.map((x) =>
    svg('text', { x, y: nodeY + 5, 'text-anchor': 'middle', class: 'am-flow__label' }),
  );
  const lossBox = svg('rect', {
    x: 220,
    y: 136,
    width: 160,
    height: 40,
    rx: 8,
    class: 'am-flow__node am-flow__node--loss',
  });
  const lossLabel = svg('text', {
    x: 300,
    y: 161,
    'text-anchor': 'middle',
    class: 'am-flow__label',
  });
  const a1 = svg('line', {
    x1: 172,
    y1: nodeY,
    x2: 212,
    y2: nodeY,
    class: 'am-flow__arrow',
    'marker-end': `url(#${head})`,
  });
  const a2 = svg('line', {
    x1: 382,
    y1: nodeY,
    x2: 422,
    y2: nodeY,
    class: 'am-flow__arrow',
    'marker-end': `url(#${head})`,
  });
  const a3 = svg('line', {
    x1: 300,
    y1: 86,
    x2: 300,
    y2: 122,
    class: 'am-flow__arrow am-flow__arrow--loss',
    'marker-end': `url(#${headLoss})`,
  });
  const v1 = svg('text', {
    x: 192,
    y: nodeY - 30,
    'text-anchor': 'middle',
    class: 'am-flow__value',
  });
  const v2 = svg('text', {
    x: 402,
    y: nodeY - 30,
    'text-anchor': 'middle',
    class: 'am-flow__value',
  });
  const v3 = svg('text', { x: 312, y: 108, 'text-anchor': 'start', class: 'am-flow__value' });
  const defs = svg('defs', {});
  for (const [id, cls] of [
    [head, 'am-flow__head'],
    [headLoss, 'am-flow__head am-flow__head--loss'],
  ] as const) {
    const m = svg('marker', {
      id,
      viewBox: '0 0 10 10',
      refX: 2,
      refY: 5,
      markerWidth: 3,
      markerHeight: 3,
      orient: 'auto-start-reverse',
      markerUnits: 'strokeWidth',
    });
    m.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }));
    defs.append(m);
  }
  root.append(defs, ...boxes, ...labels, lossBox, lossLabel, a1, a2, a3, v1, v2, v3);

  const caption = el('figcaption', { class: 'am-flow__caption' });
  const element = el(
    'figure',
    { class: 'am-flow q-energy', attrs: { 'data-testid': 'am-energy-flow' } },
    [el('h3', { class: 'am-flow__title', text: 'Flusso di energia' })],
  );
  element.append(root, caption);
  const captionId = uniqueId('am-flow-cap');
  caption.id = captionId;
  root.setAttribute('aria-labelledby', captionId);
  container.append(element);

  let pRef = 1;
  let w: [number, number, number] = [ARROW_MIN_PX, ARROW_MIN_PX, ARROW_MIN_PX];

  const setMode = (m: MachineMode): void => {
    const L = FLOW_LABELS_IT[m];
    labels.forEach((t, k) => (t.textContent = L.nodes[k] as string));
    lossLabel.textContent = L.loss;
    caption.textContent = L.sentence;
    element.dataset['mode'] = m;
    pRef = 1;
  };
  setMode(mode);

  const fmtW = (p: number): string => formatIT(p, Math.abs(p) < 10 ? 2 : 1, 'W');

  return {
    element,
    setMode,
    update(p) {
      // Reference adapts to the largest power seen (slow decay), so the arrows stay readable.
      pRef = Math.max(pRef * 0.995, p.p1, p.p2, p.pLoss, 1e-9);
      w = [arrowWidth(p.p1, pRef), arrowWidth(p.p2, pRef), arrowWidth(p.pLoss, pRef)];
      a1.setAttribute('stroke-width', w[0].toFixed(2));
      a2.setAttribute('stroke-width', w[1].toFixed(2));
      a3.setAttribute('stroke-width', w[2].toFixed(2));
      v1.textContent = fmtW(p.p1);
      v2.textContent = fmtW(p.p2);
      v3.textContent = fmtW(p.pLoss);
    },
    widths: () => w,
    dispose() {
      element.remove();
    },
  };
}

/** Live readouts (accessible `<dl>`). */
export interface ReadoutValues {
  omega: number;
  rpm: number;
  emf: number;
  i: number;
  tau: number;
  pMech: number;
  pElec: number;
  pJoule: number;
  /** Efficiency in [0, 1] or NaN when undefined. */
  eta: number;
  /** Energy-balance relative error since the last restart. */
  balance: number;
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
  { key: 'omega', labelIT: 'Velocità angolare ω', digits: 1, unit: 'rad/s' },
  { key: 'rpm', labelIT: 'Giri al minuto', digits: 0, unit: 'giri/min' },
  { key: 'emf', labelIT: 'f.e.m. ε', digits: 2, unit: 'V', quantity: 'emf' },
  { key: 'i', labelIT: 'Corrente i', digits: 2, unit: 'A', quantity: 'i' },
  { key: 'tau', labelIT: 'Coppia elettromagnetica τ', digits: 3, unit: 'N·m', quantity: 'f' },
  {
    key: 'pMech',
    labelIT: 'Potenza meccanica P_mecc (media)',
    digits: 2,
    unit: 'W',
    quantity: 'energy',
  },
  {
    key: 'pElec',
    labelIT: 'Potenza elettrica P_elett (media)',
    digits: 2,
    unit: 'W',
    quantity: 'energy',
  },
  { key: 'pJoule', labelIT: 'Potenza Joule P_J (media)', digits: 2, unit: 'W', quantity: 'energy' },
  { key: 'eta', labelIT: 'Rendimento η', digits: 1, unit: '%', scale: 100 },
  { key: 'balance', labelIT: 'Errore del bilancio energetico', digits: 1 },
];

export interface Readouts extends Disposable {
  readonly element: HTMLElement;
  update(v: ReadoutValues): void;
  text(key: keyof ReadoutValues): string;
}

export function formatBalance(rel: number): string {
  if (!Number.isFinite(rel)) return '—';
  if (rel === 0) return '0';
  const e = Math.floor(Math.log10(rel));
  const m = rel / 10 ** e;
  return `${formatIT(m, 1)}·10^${e}`;
}

export function createReadouts(container: HTMLElement): Readouts {
  const list = el('dl', { class: 'am-readouts__list' });
  const element = el(
    'section',
    { class: 'am-readouts', attrs: { 'aria-label': 'Grandezze misurate' } },
    [el('h3', { class: 'am-readouts__title', text: 'Grandezze misurate' }), list],
  );
  const nodes = new Map<keyof ReadoutValues, HTMLElement>();
  for (const d of READOUTS) {
    const dd = el('dd', { class: 'am-readouts__value', text: '—', attrs: { 'data-key': d.key } });
    nodes.set(d.key, dd);
    list.append(
      el('div', { class: `am-readouts__row${d.quantity ? ` q-${d.quantity}` : ''}` }, [
        el('dt', { text: d.labelIT }),
        dd,
      ]),
    );
  }
  container.append(element);
  return {
    element,
    update(v) {
      for (const d of READOUTS) {
        const raw = v[d.key];
        const txt =
          d.key === 'balance'
            ? formatBalance(raw)
            : formatIT(raw * (d.scale ?? 1), d.digits, d.unit);
        const n = nodes.get(d.key) as HTMLElement;
        if (n.textContent !== txt) n.textContent = txt;
      }
    },
    text: (k) => nodes.get(k)?.textContent ?? '',
    dispose() {
      element.remove();
    },
  };
}
