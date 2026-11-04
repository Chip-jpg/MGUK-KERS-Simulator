/** Live panel of the MGU-K teardown: phase slider, play/pause, view toggles, readouts. */
import type { Disposable, ParamSpec } from '../../core/types';
import {
  createButton,
  createSegmented,
  createSlider,
  el,
  type ButtonHandle,
  type SegmentedHandle,
  type Slider,
} from '../../ui';
import { PRESETS, type KersPreset } from '../kers-braking/model';
import { MGUK_MAX_RPM_BY_ERA, type BrakingState, type MgukEra } from './model';
import type { HousingMode } from './geometry';
import type { PartId } from './stage';
import { PART_INFO } from './tour';

export const PHASE_SPEC: ParamSpec = {
  min: 0,
  max: 1,
  step: 0.001,
  default: 0,
  unit: '',
  labelIT: 'Fase della frenata (0 = inizio, 1 = fine)',
};

type Fmt = (n: number, digits?: number, unit?: string) => string;

export interface PanelOptions {
  formatIT: Fmt;
  initialPhase?: number;
  initialEra?: MgukEra;
  onEra(era: MgukEra): void;
  playing?: boolean;
  onPhase(phase: number): void;
  onPlayToggle(playing: boolean): void;
  onHousing(mode: HousingMode): void;
  onView(view: 'home' | 'mguk'): void;
  /** User picked a part (null = back to the overview). */
  onFocus?(part: PartId | null): void;
  onTour?(running: boolean): void;
}

export interface TeardownPanel extends Disposable {
  readonly element: HTMLElement;
  /** Show a state; `phase` moves the slider only while the sim plays (never while dragging). */
  update(state: BrakingState, phase: number): void;
  setPlaying(playing: boolean): void;
  /** Reflect the focused part (buttons, caption, data-focus-part). */
  setFocus(part: PartId | null): void;
  setTour(running: boolean): void;
}

/** Readout rows: key, Italian label, formatter of the BrakingState. */
export const READOUTS: ReadonlyArray<{
  key: string;
  labelIT: string;
  text: (s: BrakingState, f: Fmt, preset: KersPreset) => string;
}> = [
  { key: 'v', labelIT: 'Velocità', text: (s, f) => f(s.v * 3.6, 0, 'km/h') },
  {
    key: 'rpm',
    labelIT: 'Giri rotore',
    text: (s, f, p) =>
      `${f(s.rpm, 0, 'giri/min')} (${f((s.rpm / MGUK_MAX_RPM_BY_ERA[p.id]) * 100, 1, '%')})`,
  },
  { key: 'torque', labelIT: 'Coppia', text: (s, f) => f(s.torque, 1, 'N·m') },
  {
    key: 'pKers',
    labelIT: 'Potenza elettrica MGU-K → batteria',
    text: (s, f, p) =>
      `${f(s.pKers / 1e3, 0, 'kW')} / ${f(p.values.Pmax, 0, 'kW')} (${f((s.pKers / (p.values.Pmax * 1e3)) * 100, 1, '%')})`,
  },
  { key: 'pMech', labelIT: 'Potenza meccanica', text: (s, f) => f(s.pMech / 1e3, 1, 'kW') },
  { key: 'pBrakes', labelIT: 'Potenza freni', text: (s, f) => f(s.pBrakes / 1e3, 1, 'kW') },
  { key: 'emf', labelIT: 'Tensione indotta (EMF)', text: (s, f) => f(s.emf, 0, 'V') },
  { key: 'current', labelIT: 'Corrente', text: (s, f) => f(s.current, 0, 'A') },
  { key: 'soc', labelIT: 'Carica batteria (SoC)', text: (s, f) => f(s.soc * 100, 1, '%') },
  {
    key: 'recovered',
    labelIT: 'Energia recuperata / limite per giro',
    text: (s, f, p) =>
      `${f(s.recovered / 1e6, 3, 'MJ')} / ${f(p.lapLimitJoules / 1e6, 1, 'MJ')} (${f((s.recovered / p.lapLimitJoules) * 100, 1, '%')})`,
  },
  { key: 'eta', labelIT: 'Rendimento η', text: (_s, f, p) => f(p.values.eta * 100, 0, '%') },
  { key: 'brakeHeat', labelIT: 'Calore freni', text: (s, f) => f(s.brakeHeat / 1e6, 3, 'MJ') },
  { key: 'mgukLoss', labelIT: 'Perdite MGU-K', text: (s, f) => f(s.mgukLoss / 1e6, 3, 'MJ') },
  {
    key: 'phase',
    labelIT: 'Fase della frenata',
    text: (s, f) =>
      `${s.t === 0 ? 'Inizio frenata' : s.pKers <= 0 ? 'Fine frenata (P ≤ 0)' : 'Frenata in corso'} · t = ${f(s.t, 2, 's')}`,
  },
];

export function createTeardownPanel(host: HTMLElement, o: PanelOptions): TeardownPanel {
  const element = el('section', { class: 'mgt-panel', attrs: { 'aria-label': 'Pannello MGU-K' } });
  let preset = PRESETS.find((p) => p.id === (o.initialEra ?? '2025'))!;
  let lastState: BrakingState | undefined;
  const era = createSegmented<MgukEra>({
    labelIT: 'Regolamento',
    options: PRESETS.map((p) => ({ value: p.id, labelIT: p.labelIT })),
    value: preset.id,
    onChange: (id) => {
      preset = PRESETS.find((p) => p.id === id)!;
      note.textContent = preset.noteIT;
      if (lastState) update(lastState, lastPhase);
      o.onEra(id);
    },
  });
  const note = el('p', { class: 'mgt-note', text: preset.noteIT });
  const capBadge = el('span', {
    class: 'badge badge--small',
    text: 'limite potenza attivo',
    dataset: { out: 'powerCapActive' },
  });
  capBadge.hidden = true;
  const bars = new Map<string, HTMLProgressElement>();
  let playing = o.playing ?? true;
  let lastPhase = o.initialPhase ?? 0;

  const slider: Slider = createSlider({
    spec: PHASE_SPEC,
    value: lastPhase,
    id: 'mgt-phase',
    digits: 2,
    onInput: (v) => {
      lastPhase = v;
      o.onPhase(v);
    },
  });
  const play: ButtonHandle = createButton({
    labelIT: playing ? 'Pausa' : 'Riproduci',
    icon: playing ? '⏸' : '▶',
    variant: 'primary',
    onClick: () => {
      setPlaying(!playing);
      o.onPlayToggle(playing);
    },
  });
  function setPlaying(p: boolean): void {
    playing = p;
    play.setLabel(p ? 'Pausa' : 'Riproduci', p ? '⏸' : '▶');
  }

  const housing: SegmentedHandle<HousingMode> = createSegmented<HousingMode>({
    labelIT: 'Involucro',
    options: [
      { value: 'cutaway', labelIT: 'Spaccato' },
      { value: 'glass', labelIT: 'Vetro' },
    ],
    value: 'cutaway',
    onChange: o.onHousing,
  });
  const view: SegmentedHandle<'home' | 'mguk'> = createSegmented<'home' | 'mguk'>({
    labelIT: 'Vista',
    options: [
      { value: 'home', labelIT: 'Insieme' },
      { value: 'mguk', labelIT: 'MGU-K' },
    ],
    value: 'home',
    onChange: o.onView,
  });

  // Part buttons: each toggles focus (aria-pressed); the "Insieme" / "MGU-K" view radios leave it.
  let focus: PartId | null = null;
  let tourOn = false;
  const partBtns = new Map<PartId, ButtonHandle>();
  const partRow = el('div', {
    class: 'mgt-parts',
    attrs: { role: 'group', 'aria-label': 'Parti da inquadrare' },
  });
  for (const p of PART_INFO) {
    const b = createButton({
      labelIT: p.labelIT,
      onClick: () => o.onFocus?.(focus === p.id ? null : p.id),
    });
    b.element.setAttribute('aria-pressed', 'false');
    b.element.dataset['part'] = p.id;
    partBtns.set(p.id, b);
    partRow.append(b.element);
  }
  const caption = el('p', {
    class: 'mgt-caption',
    attrs: { 'aria-live': 'polite' },
    dataset: { out: 'partCaption' },
  });
  caption.hidden = true;
  const tour = createButton({
    labelIT: 'Tour automatico',
    icon: '⟳',
    onClick: () => o.onTour?.(!tourOn),
  });
  tour.element.setAttribute('aria-pressed', 'false');
  tour.element.dataset['tour'] = 'toggle';
  function setFocus(p: PartId | null): void {
    focus = p;
    for (const [id, b] of partBtns) b.element.setAttribute('aria-pressed', String(id === p));
    if (p) element.dataset['focusPart'] = p;
    else delete element.dataset['focusPart'];
    const info = PART_INFO.find((x) => x.id === p);
    caption.hidden = !info;
    caption.textContent = info?.captionIT ?? '';
  }
  function setTour(on: boolean): void {
    tourOn = on;
    tour.element.setAttribute('aria-pressed', String(on));
    element.dataset['tour'] = on ? 'on' : 'off';
  }
  element.dataset['tour'] = 'off';
  // Clicking the already selected view radio does not fire `change`: still leave the part focus.
  view.element.addEventListener('click', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && focus && t.value === view.value) {
      o.onView(t.value as 'home' | 'mguk');
    }
  });

  const grid = el('dl', { class: 'mgt-grid' });
  const outs = new Map<string, HTMLElement>();
  for (const r of READOUTS) {
    const dd = el('span', { dataset: { out: r.key }, text: '—' });
    const value = el('dd', {}, [dd]);
    if (r.key === 'pKers') value.append(capBadge);
    if (r.key === 'soc' || r.key === 'recovered') {
      const bar = document.createElement('progress');
      bar.className = 'mgt-bar';
      bar.max = 1;
      bar.value = 0;
      bar.setAttribute('aria-label', r.labelIT);
      bars.set(r.key, bar);
      value.append(bar);
    }
    outs.set(r.key, dd);
    grid.append(el('div', { class: 'mgt-grid__row' }, [el('dt', { text: r.labelIT }), value]));
  }
  const cap = el('p', {
    class: 'mgt-cap',
    text: 'Potenza ≤ 0 (fine frenata): il nastro viola si spegne. La rotazione è mostrata 100 volte più lenta del reale.',
  });

  element.append(
    el('div', { class: 'mgt-row' }, [play.element, tour.element]),
    partRow,
    caption,
    slider.element,
    era.element,
    grid,
    note,
    housing.element,
    view.element,
    cap,
  );
  host.append(element);

  function update(s: BrakingState, phase: number): void {
    lastState = s;
    capBadge.hidden = !s.powerCapActive;
    bars.get('soc')!.value = s.soc;
    bars.get('recovered')!.value = s.recovered / preset.lapLimitJoules;
    for (const r of READOUTS) {
      const n = outs.get(r.key);
      const t = r.text(s, o.formatIT, preset);
      if (n && n.textContent !== t) n.textContent = t;
    }
    if (playing && Math.abs(phase - lastPhase) > 1e-6) {
      lastPhase = phase;
      slider.set(phase);
    }
  }
  return {
    element,
    update,
    setPlaying,
    setFocus,
    setTour,
    dispose() {
      for (const b of partBtns.values()) b.dispose();
      tour.dispose();
      play.dispose();
      slider.dispose();
      housing.dispose();
      view.dispose();
      era.dispose();
      element.remove();
    },
  };
}
