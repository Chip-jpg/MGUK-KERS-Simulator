/**
 * DOM panels of the `kers-braking` simulator: regulation presets, energy
 * balance card (numbers + stacked bar) and per-lap context. No Three.js here.
 */
import { formatIT } from '../../core/format';
// Direct imports (not the `ui` barrel) keep uPlot out of this module, so it is testable in jsdom.
import { createButton, type ButtonHandle } from '../../ui/controls';
import { el } from '../../ui/dom';
import {
  LAP_LIMIT_2025,
  LAP_RANGE_2026,
  MIN_MASS_2026,
  PRESETS,
  type EventSummary,
  type KersPreset,
  type Source,
} from './model';

function sourceLinks(sources: readonly Source[]): HTMLElement {
  const p = el('span', { class: 'kers-sources' }, ['Fonte: ']);
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

export interface PresetsHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

/** Preset buttons "2025 (120 kW)", "2026 (350 kW)" and "Massa minima 2026". */
export function createPresets(o: {
  onPreset: (p: KersPreset) => void;
  onMinMass: (kg: number) => void;
}): PresetsHandle {
  const buttons: ButtonHandle[] = [];
  const row = el('div', { class: 'kers-presets__row' });
  const notes = el('div', { class: 'kers-presets__notes' });
  for (const preset of PRESETS) {
    const label = preset.verified ? preset.labelIT : `${preset.labelIT} — valore da verificare`;
    const b = createButton({
      labelIT: label,
      variant: 'secondary',
      title: `${preset.noteIT} Fonte: ${preset.sources.map((s) => s.labelIT).join('; ')}`,
      onClick: () => o.onPreset(preset),
    });
    b.element.dataset['preset'] = preset.id;
    buttons.push(b);
    row.append(b.element);
    notes.append(
      el('p', { class: 'kers-presets__note' }, [
        el('strong', { text: `${preset.labelIT}: ` }),
        preset.noteIT,
        preset.verified ? '' : ' (valore da verificare)',
        ' ',
        sourceLinks(preset.sources),
      ]),
    );
  }
  if (MIN_MASS_2026.verified) {
    const b = createButton({
      labelIT: `Massa minima 2026 (${formatIT(MIN_MASS_2026.kg, 0, 'kg')})`,
      variant: 'ghost',
      title: MIN_MASS_2026.noteIT,
      onClick: () => o.onMinMass(MIN_MASS_2026.kg),
    });
    b.element.dataset['preset'] = 'min-mass-2026';
    buttons.push(b);
    row.append(b.element);
    notes.append(
      el('p', { class: 'kers-presets__note' }, [
        el('strong', { text: 'Massa: ' }),
        `800 kg è un valore tondo illustrativo, non la massa regolamentare. Massa minima 2026: ${MIN_MASS_2026.noteIT} `,
        sourceLinks(MIN_MASS_2026.sources),
      ]),
    );
  }
  const element = el('section', { class: 'kers-presets', attrs: { 'aria-label': 'Preset' } }, [
    el('h3', { class: 'kers-subtitle', text: 'Preset regolamento' }),
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

export interface BalanceHandle {
  readonly element: HTMLElement;
  update(s: EventSummary): void;
  dispose(): void;
}

type OutKey =
  | 'dEk'
  | 'recovered'
  | 'dissipated'
  | 'brakes'
  | 'mgukLoss'
  | 'fraction'
  | 'tRec'
  | 'meanPower'
  | 'lapShare';

/** Energy balance card: ΔE_k = recuperata + freni + perdite MGU-K, with a stacked bar. */
export function createBalance(container: HTMLElement): BalanceHandle {
  const outs = new Map<OutKey, HTMLElement>();
  const out = (key: OutKey): HTMLElement => {
    const node = el('span', { class: 'kers-out', text: '—', dataset: { out: key } });
    outs.set(key, node);
    return node;
  };
  const row = (labelIT: string, key: OutKey, cls = '', hintIT?: string): HTMLElement =>
    el('div', { class: `kers-row ${cls}` }, [
      el('dt', {}, [labelIT, hintIT ? el('span', { class: 'kers-hint', text: hintIT }) : null]),
      el('dd', {}, [out(key)]),
    ]);

  const message = el('p', {
    class: 'kers-message',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  message.hidden = true;

  const segRec = el('span', { class: 'kers-bar__seg kers-bar__seg--rec' });
  const segBrakes = el('span', { class: 'kers-bar__seg kers-bar__seg--brakes' });
  const segLoss = el('span', { class: 'kers-bar__seg kers-bar__seg--loss' });
  const bar = el('div', { class: 'kers-bar', attrs: { 'aria-hidden': 'true' } }, [
    segRec,
    segBrakes,
    segLoss,
  ]);
  const legend = el('ul', { class: 'kers-legend' }, [
    el('li', { class: 'kers-legend__rec', text: 'Recuperata (in batteria)' }),
    el('li', { class: 'kers-legend__brakes', text: 'Calore nei freni a disco' }),
    el('li', { class: 'kers-legend__loss', text: 'Perdite MGU-K / convertitore' }),
  ]);

  const lapLine = el('p', { class: 'kers-context' }, [
    'Limite di recupero per giro (2025, MGU-K → batteria): ',
    el('strong', { text: formatIT(LAP_LIMIT_2025.joules / 1e6, 0, 'MJ') }),
    '. Questa frenata ne usa: ',
    out('lapShare'),
    '. ',
    sourceLinks(LAP_LIMIT_2025.sources),
  ]);
  const lap2026 = el('p', { class: 'kers-context' }, [
    `Energia recuperabile per giro nel 2026: ${LAP_RANGE_2026.textIT} `,
    el('span', { class: 'badge badge--small', text: 'valore da verificare' }),
    ' ',
    sourceLinks(LAP_RANGE_2026.sources),
  ]);

  const element = el(
    'section',
    { class: 'kers-balance', attrs: { 'aria-label': 'Bilancio energetico della frenata' } },
    [
      el('h3', { class: 'plot__title', text: 'Bilancio energetico della frenata' }),
      message,
      el('dl', { class: 'kers-list' }, [
        row('Energia cinetica da smaltire ΔEₖ', 'dEk', 'kers-row--total'),
        row('Recuperata (in batteria)', 'recovered', 'kers-row--rec'),
        row('Dissipata (freni + perdite MGU-K)', 'dissipated'),
        row('di cui calore nei freni a disco', 'brakes', 'kers-row--sub'),
        row('di cui perdite MGU-K / convertitore', 'mgukLoss', 'kers-row--sub'),
        row('Quota recuperata (sul totale ΔEₖ)', 'fraction'),
        row('Potenza media di frenata (ΔEₖ / durata)', 'meanPower'),
        row(
          'Tempo per assorbire tutta ΔEₖ alla potenza massima',
          'tRec',
          '',
          'η·ΔEₖ / Pₘₐₓ: l’MGU-K assorbe Pₘₐₓ/η e in batteria arriva solo η·ΔEₖ',
        ),
      ]),
      bar,
      legend,
      lapLine,
      lap2026,
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
      const r = s.result;
      const braking = r.dEk > 0;
      if (s.notBraking) {
        message.textContent =
          'Non è una frenata: v₂ è maggiore di v₁, l’auto accelera e non c’è energia da recuperare.';
      } else if (s.noChange) {
        message.textContent = 'Nessuna frenata: v₁ = v₂, l’energia cinetica non cambia.';
      }
      message.hidden = braking;
      element.classList.toggle('kers-balance--idle', !braking);
      const mj = (j: number): string => (braking ? formatIT(j / 1e6, 2, 'MJ') : '—');
      set('dEk', mj(r.dEk));
      set('recovered', mj(r.recovered));
      set('dissipated', mj(r.dissipated));
      set('brakes', mj(s.brakes));
      set('mgukLoss', mj(s.mgukLoss));
      set('fraction', braking ? formatIT(s.recoveredFraction * 100, 1, '%') : '—');
      set('meanPower', braking ? formatIT(s.meanPower / 1e3, 0, 'kW') : '—');
      set('tRec', braking ? formatIT(r.timeToRecoverAtPmax, 1, 's') : '—');
      set(
        'lapShare',
        braking ? formatIT((r.recovered / LAP_LIMIT_2025.joules) * 100, 0, '%') : '—',
      );
      const pct = (j: number): string => `${braking ? (j / r.dEk) * 100 : 0}%`;
      segRec.style.width = pct(r.recovered);
      segBrakes.style.width = pct(s.brakes);
      segLoss.style.width = pct(s.mgukLoss);
    },
    dispose() {
      element.remove();
    },
  };
}
