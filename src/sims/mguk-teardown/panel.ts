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
import type { BrakingState } from './model';
import type { HousingMode } from './geometry';

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
  playing?: boolean;
  onPhase(phase: number): void;
  onPlayToggle(playing: boolean): void;
  onHousing(mode: HousingMode): void;
  onView(view: 'home' | 'mguk'): void;
}

export interface TeardownPanel extends Disposable {
  readonly element: HTMLElement;
  /** Show a state; `phase` moves the slider only while the sim plays (never while dragging). */
  update(state: BrakingState, phase: number): void;
  setPlaying(playing: boolean): void;
}

/** Readout rows: key, Italian label, formatter of the BrakingState. */
export const READOUTS: ReadonlyArray<{
  key: string;
  labelIT: string;
  text: (s: BrakingState, f: Fmt) => string;
}> = [
  { key: 'v', labelIT: 'Velocità', text: (s, f) => f(s.v * 3.6, 0, 'km/h') },
  { key: 'rpm', labelIT: 'Giri rotore', text: (s, f) => f(s.rpm, 0, 'giri/min') },
  { key: 'torque', labelIT: 'Coppia', text: (s, f) => f(s.torque, 1, 'N·m') },
  { key: 'pKers', labelIT: 'Potenza MGU-K → batteria', text: (s, f) => f(s.pKers / 1e3, 0, 'kW') },
  { key: 'emf', labelIT: 'Tensione indotta (EMF)', text: (s, f) => f(s.emf, 0, 'V') },
  { key: 'current', labelIT: 'Corrente', text: (s, f) => f(s.current, 0, 'A') },
  { key: 'soc', labelIT: 'Carica batteria (SoC)', text: (s, f) => f(s.soc * 100, 1, '%') },
];

export function createTeardownPanel(host: HTMLElement, o: PanelOptions): TeardownPanel {
  const element = el('section', { class: 'mgt-panel', attrs: { 'aria-label': 'Pannello MGU-K' } });
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

  const grid = el('dl', { class: 'mgt-grid' });
  const outs = new Map<string, HTMLElement>();
  for (const r of READOUTS) {
    const dd = el('dd', { dataset: { out: r.key }, text: '—' });
    outs.set(r.key, dd);
    grid.append(el('div', { class: 'mgt-grid__row' }, [el('dt', { text: r.labelIT }), dd]));
  }
  const cap = el('p', {
    class: 'mgt-cap',
    text: 'Potenza ≤ 0 (fine frenata): il nastro viola si spegne. La rotazione è mostrata 100 volte più lenta del reale.',
  });

  element.append(
    el('div', { class: 'mgt-row' }, [play.element]),
    slider.element,
    grid,
    housing.element,
    view.element,
    cap,
  );
  host.append(element);

  return {
    element,
    update(s, phase) {
      for (const r of READOUTS) {
        const n = outs.get(r.key);
        const t = r.text(s, o.formatIT);
        if (n && n.textContent !== t) n.textContent = t;
      }
      if (playing && Math.abs(phase - lastPhase) > 1e-6) {
        lastPhase = phase;
        slider.set(phase);
      }
    },
    setPlaying,
    dispose() {
      play.dispose();
      slider.dispose();
      housing.dispose();
      view.dispose();
      element.remove();
    },
  };
}
