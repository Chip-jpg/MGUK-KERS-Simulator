/**
 * DOM panels of the `car-dynamics` simulator: presets with sources, fixed data,
 * energy balance (numbers + stacked bar) and the side-by-side comparison with the
 * constant-deceleration model of `kers-braking`. No Three.js and no uPlot here
 * (testable in jsdom).
 */
import { formatIT } from '../../core/format';
import { formatRoute } from '../../core/router';
import { createButton, type ButtonHandle } from '../../ui/controls';
import { el } from '../../ui/dom';
import { FIXED, PEAK_SLIP, PRESETS, type CarPreset, type Source, type ZoneSummary } from './model';

export const MODEL_NOTE_IT =
  'vettura puntiforme con trasferimento di carico longitudinale, pneumatici Pacejka semplificati al picco di aderenza (ABS ideale), MGU-K solo sull’asse posteriore, parametri illustrativi.';

function sourceLinks(sources: readonly Source[]): HTMLElement {
  const p = el('span', { class: 'cd-sources' }, ['Fonte: ']);
  sources.forEach((s, i) => {
    if (i > 0) p.append('; ');
    p.append(
      el('a', {
        text: s.labelIT,
        attrs: { href: s.url, target: '_blank', rel: 'noopener noreferrer' },
      }),
    );
  });
  return p;
}

export interface Handle {
  readonly element: HTMLElement;
  dispose(): void;
}

/** "2025 (120 kW)" / "2026 (350 kW)" buttons: they set P_max only. */
export function createPresets(onPreset: (p: CarPreset) => void): Handle {
  const buttons: ButtonHandle[] = [];
  const row = el('div', { class: 'cd-row' });
  const notes = el('div');
  for (const preset of PRESETS) {
    const b = createButton({
      labelIT: preset.labelIT,
      variant: 'secondary',
      title: `${preset.noteIT} Fonte: ${preset.sources.map((s) => s.labelIT).join('; ')}`,
      onClick: () => onPreset(preset),
    });
    b.element.dataset['preset'] = preset.id;
    buttons.push(b);
    row.append(b.element);
    notes.append(
      el('p', { class: 'cd-small' }, [
        el('strong', { text: `${preset.labelIT}: ` }),
        preset.noteIT,
        ' ',
        sourceLinks(preset.sources),
      ]),
    );
  }
  notes.append(
    el('p', {
      class: 'cd-small',
      text: 'I preset cambiano solo Pₘₐₓ; massa, aerodinamica, aderenza e ripartizione restano valori illustrativi.',
    }),
  );
  const element = el('section', { class: 'cd-block', attrs: { 'aria-label': 'Preset MGU-K' } }, [
    el('h3', { class: 'cd-subtitle', text: 'Preset regolamento (solo Pₘₐₓ)' }),
    row,
    notes,
  ]);
  return {
    element,
    dispose() {
      buttons.splice(0).forEach((b) => b.dispose());
      element.remove();
    },
  };
}

/** Links to the theory sections this simulator builds on. */
export function createTheoryLinks(): HTMLElement {
  const links: Array<[string, string]> = [
    ['17-dinamica-frenata', 'Dinamica della frenata'],
    ['10-kers-mguk', 'KERS e MGU-K'],
    ['06-circuito-rl-energia-campo', 'Bilancio energetico (slide 16–17)'],
    ['08-trasformatore-trasporto-joule', 'Effetto Joule'],
  ];
  const p = el('p', { class: 'cd-small cd-links' }, ['Teoria: ']);
  links.forEach(([id, label], i) => {
    if (i > 0) p.append(' · ');
    p.append(el('a', { text: label, attrs: { href: formatRoute({ kind: 'teoria', id }) } }));
  });
  return p;
}

/** Fixed illustrative data (not sliders). */
export function createFixedData(): HTMLElement {
  const items: Array<[string, string]> = [
    ['Altezza del baricentro h', formatIT(FIXED.h, 2, 'm')],
    ['Passo L', formatIT(FIXED.L, 1, 'm')],
    ['Quota statica del peso sull’anteriore', formatIT(FIXED.weightFront * 100, 0, '%')],
    ['Densità dell’aria ρ', formatIT(FIXED.rho, 3, 'kg/m³')],
    [
      'Pneumatico (B, C, E)',
      `${formatIT(FIXED.tyre.B, 0)}; ${formatIT(FIXED.tyre.C, 1)}; ${formatIT(FIXED.tyre.E, 1)}`,
    ],
    ['Scorrimento di picco κ*', formatIT(PEAK_SLIP * 100, 1, '%')],
  ];
  return el('details', { class: 'cd-block cd-fixed' }, [
    el('summary', { text: 'Dati fissi della vettura (illustrativi)' }),
    el(
      'dl',
      { class: 'cd-list' },
      items.map(([k, v]) =>
        el('div', { class: 'cd-list__row' }, [el('dt', { text: k }), el('dd', { text: v })]),
      ),
    ),
    el('p', {
      class: 'cd-small',
      text: 'La deportanza si ripartisce tra gli assi come il peso; la resistenza aerodinamica agisce all’altezza del baricentro. ρ = 1,225 kg/m³ è l’aria standard al livello del mare.',
    }),
  ]);
}

export interface BalanceHandle extends Handle {
  update(s: ZoneSummary): void;
}

type OutKey =
  | 'distance'
  | 'time'
  | 'dEk'
  | 'stored'
  | 'fraction'
  | 'loss'
  | 'brakesFront'
  | 'brakesRear'
  | 'aero'
  | 'cDistance'
  | 'cTime'
  | 'cDEk'
  | 'cStored'
  | 'cFraction'
  | 'cLoss'
  | 'cBrakes'
  | 'cAero';

/**
 * Energy balance and comparison: ΔEₖ = in batteria + perdite MGU-K + freni ant. +
 * freni post. + aerodinamica, next to the constant-deceleration model of
 * `kers-braking` with the same v₁, v₂ and braking time.
 */
export function createBalance(container: HTMLElement): BalanceHandle {
  const outs = new Map<OutKey, HTMLElement>();
  const out = (key: OutKey): HTMLElement => {
    const node = el('td', { class: 'cd-out', text: '—', dataset: { out: key } });
    outs.set(key, node);
    return node;
  };
  const row = (labelIT: string, a: OutKey, b: OutKey | null, cls = ''): HTMLElement =>
    el('tr', { class: cls }, [
      el('th', { text: labelIT, attrs: { scope: 'row' } }),
      out(a),
      b ? out(b) : el('td', { class: 'cd-out', text: '—' }),
    ]);

  const message = el('p', {
    class: 'cd-message',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  message.hidden = true;

  const segs = {
    stored: el('span', { class: 'cd-bar__seg cd-seg--stored' }),
    loss: el('span', { class: 'cd-bar__seg cd-seg--loss' }),
    front: el('span', { class: 'cd-bar__seg cd-seg--front' }),
    rear: el('span', { class: 'cd-bar__seg cd-seg--rear' }),
    aero: el('span', { class: 'cd-bar__seg cd-seg--aero' }),
  };
  const bar = el('div', { class: 'cd-bar', attrs: { 'aria-hidden': 'true' } }, Object.values(segs));
  const legend = el('ul', { class: 'cd-legend' }, [
    el('li', { class: 'cd-seg--stored', text: 'In batteria' }),
    el('li', { class: 'cd-seg--loss', text: 'Perdite MGU-K' }),
    el('li', { class: 'cd-seg--front', text: 'Freni anteriori' }),
    el('li', { class: 'cd-seg--rear', text: 'Freni posteriori' }),
    el('li', { class: 'cd-seg--aero', text: 'Resistenza aerodinamica' }),
  ]);

  const table = el('table', { class: 'cd-table' }, [
    el('caption', { text: 'Stessi v₁, v₂ e stessa durata della frenata' }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Grandezza', attrs: { scope: 'col' } }),
        el('th', { text: 'Questo modello', attrs: { scope: 'col' } }),
        el('th', { text: 'Decelerazione costante', attrs: { scope: 'col' } }),
      ]),
    ]),
    el('tbody', {}, [
      row('Spazio di frenata', 'distance', 'cDistance'),
      row('Tempo di frenata', 'time', 'cTime'),
      row('Energia cinetica ΔEₖ', 'dEk', 'cDEk', 'cd-tr--total'),
      row('In batteria', 'stored', 'cStored', 'cd-tr--stored'),
      row('Quota recuperata', 'fraction', 'cFraction'),
      row('Perdite MGU-K', 'loss', 'cLoss'),
      row('Freni anteriori', 'brakesFront', null),
      row('Freni posteriori', 'brakesRear', null),
      row('Freni (totale, modello a decelerazione costante)', 'cBrakes', null, 'cd-tr--sub'),
      row('Resistenza aerodinamica', 'aero', 'cAero'),
    ]),
  ]);

  const element = el(
    'section',
    { class: 'cd-balance', attrs: { 'aria-label': 'Bilancio energetico e confronto' } },
    [
      el('h3', { class: 'plot__title', text: 'Bilancio energetico della frenata' }),
      message,
      bar,
      legend,
      table,
      el('p', {
        class: 'cd-small',
        text: 'Decelerazione costante: il modello del simulatore «Frenata e recupero di energia» (senza aerodinamica, l’MGU-K può prendere tutta la potenza di frenata fino a Pₘₐₓ/η). Qui invece l’MGU-K frena solo l’asse posteriore.',
      }),
    ],
  );
  container.append(element);

  const set = (key: OutKey, text: string): void => {
    const node = outs.get(key);
    if (node && node.textContent !== text) node.textContent = text;
  };

  return {
    element,
    update(s) {
      const z = s.zone;
      const c = s.compare;
      const braking = z.dEk > 0 && c !== null;
      message.textContent = braking
        ? ''
        : 'Non è una frenata: v₂ deve essere minore di v₁ (l’auto non rallenta e non c’è energia da recuperare).';
      message.hidden = braking;
      element.classList.toggle('cd-balance--idle', !braking);
      const mj = (j: number): string => (braking ? formatIT(j / 1e6, 2, 'MJ') : '—');
      const pct = (f: number): string => (braking ? formatIT(f * 100, 1, '%') : '—');
      set('distance', braking ? formatIT(z.distance, 1, 'm') : '—');
      set('time', braking ? formatIT(z.tBrake, 2, 's') : '—');
      set('dEk', mj(z.dEk));
      set('stored', mj(z.eStored));
      set('fraction', pct(z.recoveredFraction));
      set('loss', mj(z.eMgukLoss));
      set('brakesFront', mj(z.eBrakesFront));
      set('brakesRear', mj(z.eBrakesRear));
      set('aero', mj(z.eAero));
      set('cDistance', braking ? formatIT(c.distance, 1, 'm') : '—');
      set('cTime', braking ? formatIT(z.tBrake, 2, 's') : '—');
      set('cDEk', braking ? mj(c.result.dEk) : '—');
      set('cStored', braking ? mj(c.result.recovered) : '—');
      set('cFraction', braking ? pct(c.recoveredFraction) : '—');
      set('cLoss', braking ? mj(c.mgukLoss) : '—');
      set('cBrakes', braking ? mj(c.brakes) : '—');
      set('cAero', braking ? formatIT(0, 2, 'MJ') : '—');
      const w = (j: number): string => `${braking ? (j / z.dEk) * 100 : 0}%`;
      segs.stored.style.width = w(z.eStored);
      segs.loss.style.width = w(z.eMgukLoss);
      segs.front.style.width = w(z.eBrakesFront);
      segs.rear.style.width = w(z.eBrakesRear);
      segs.aero.style.width = w(z.eAero);
    },
    dispose() {
      element.remove();
    },
  };
}
