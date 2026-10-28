/**
 * Simulator `kers-braking` — "Frenata e recupero di energia".
 *
 * A car of mass m brakes from v₁ to v₂ in t_f. `kersBrakingEvent` (src/physics)
 * splits ΔE_k between the MGU-K (electrical cap P_max, efficiency η) and the
 * disc brakes; the scene plays the event back in real time (×1 or ×0,25).
 */
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule, Theme } from '../../core/types';
import {
  createFormulaPanel,
  createLoop,
  createPlot,
  createSegmented,
  createSimLayout,
  createSimToolbar,
  createSlider,
  el,
  onThemeChange,
  type Slider,
} from '../../ui';
import { createBalance, createPresets } from './panel';
import { createKersScene, type KersScene } from './scene';
import {
  PARAM_KEYS,
  defaultParams,
  params,
  stateAt,
  summarize,
  type EventSummary,
  type KersUiParams,
  type ParamKey,
} from './model';
import './style.css';

export { params } from './model';

export const MODEL_NOTE_IT =
  'decelerazione costante, resistenza aerodinamica e rotolamento trascurate, rendimento η costante, nessun limite di energia per giro o di carica della batteria. Pₘₐₓ è il limite di potenza elettrica dell’MGU-K.';

/** Pause at the end of the event before the playback restarts [s]. */
const END_HOLD = 1.5;

/** Read-only debug data for e2e leak checks (exposed only when `debugEnabled()`). */
interface KersDebug {
  liveMounts: number;
  mountsTotal: number;
  scene: () => ReturnType<KersScene['info']> | null;
  simTime: () => number;
}
let liveMounts = 0;
let mountsTotal = 0;

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const values: KersUiParams = defaultParams();
  let summary: EventSummary = summarize(values);
  let simT = 0;
  let hold = 0;
  let speed = 1;
  const offs: Array<() => void> = [];

  // --- Scene (WebGL may be unavailable: the rest of the page still works) ---
  let scene: KersScene | null = null;
  try {
    scene = createKersScene(layout.scene, ctx.theme);
  } catch {
    layout.scene.append(
      el('p', { class: 'sim-placeholder', text: 'Grafica 3D non disponibile (WebGL).' }),
    );
  }
  const hud = el('div', { class: 'kers-hud' });
  const hudLines = {
    t: el('span'),
    v: el('span'),
    kers: el('span', { class: 'kers-hud__kers' }),
    brakes: el('span', { class: 'kers-hud__brakes' }),
    stored: el('span', { class: 'kers-hud__kers' }),
  };
  hud.append(...Object.values(hudLines));
  layout.sceneOverlay.append(hud);

  // --- Controls ---
  const presets = createPresets({
    onPreset: (p) => {
      for (const k of PARAM_KEYS) setParam(k, p.values[k]);
      recompute();
    },
    onMinMass: (kg) => {
      setParam('m', kg);
      recompute();
    },
  });
  layout.controls.append(presets.element);

  const sliders = {} as Record<ParamKey, Slider>;
  for (const key of PARAM_KEYS) {
    const spec = params[key];
    const hintIT =
      key === 'eta'
        ? 'Valore illustrativo (0,9 di default).'
        : key === 'Pmax'
          ? 'Limite sulla potenza elettrica inviata alla batteria.'
          : key === 'm'
            ? '800 kg: valore tondo illustrativo.'
            : undefined;
    const s = createSlider({
      spec,
      id: `kers-${key}`,
      ...(hintIT ? { hintIT } : {}),
      onInput: (v) => {
        values[key] = v;
        recompute();
      },
    });
    sliders[key] = s;
    layout.controls.append(s.element);
  }
  function setParam(key: ParamKey, v: number): void {
    sliders[key].set(v);
    values[key] = sliders[key].value;
  }

  const speedCtl = createSegmented<'0.25' | '1'>({
    labelIT: 'Velocità di riproduzione',
    options: [
      { value: '0.25', labelIT: '×0,25' },
      { value: '1', labelIT: '×1 (tempo reale)' },
    ],
    value: '1',
    onChange: (v) => (speed = Number(v)),
  });
  layout.controls.append(speedCtl.element);

  // --- Formulas ---
  const formulas = createFormulaPanel(layout.formulas, [
    {
      key: 'dEk',
      tex: '\\Delta E_k = \\tfrac12\\, m\\,(v_1^2 - v_2^2)',
      labelIT: 'Energia cinetica da smaltire',
      symbolTex: '\\Delta E_k',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
      quantity: 'energy',
    },
    {
      key: 'pMean',
      tex: '\\bar P = \\Delta E_k / t_f',
      labelIT: 'Potenza media di frenata',
      symbolTex: '\\bar P',
      unit: 'kW',
      scale: 1e-3,
      digits: 0,
    },
    {
      key: 'eRec',
      tex: 'E_{rec} = \\eta \\int_0^{t_f} \\min\\!\\left(P_{fren},\\ P_{\\max}/\\eta\\right) dt',
      labelIT: 'Energia elettrica accumulata (Pₘₐₓ limite elettrico)',
      symbolTex: 'E_{rec}',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
      quantity: 'energy',
      slide: 17,
    },
    {
      key: 'eDiss',
      tex: 'E_{diss} = \\Delta E_k - E_{rec}',
      labelIT: 'Calore: freni a disco + perdite MGU-K',
      symbolTex: 'E_{diss}',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
      slide: 16,
    },
    {
      key: 'tRec',
      tex: 't_{rec} = \\eta\\,\\Delta E_k / P_{\\max}',
      labelIT: 'Tempo per assorbire tutta ΔEₖ alla potenza massima',
      symbolTex: 't_{rec}',
      unit: 's',
      digits: 1,
    },
    {
      key: 'v',
      tex: 'v(t) = v_1 - a\\,t,\\quad a = (v_1 - v_2)/t_f',
      labelIT: 'Velocità durante la frenata (istante attuale)',
      symbolTex: 'v',
      unit: 'km/h',
      scale: 3.6,
      digits: 0,
    },
    {
      key: 'pKers',
      tex: 'P_{MGU\\text{-}K}(t) = \\eta\\,\\min\\!\\left(P_{fren}(t),\\ P_{\\max}/\\eta\\right)',
      labelIT: 'Potenza elettrica verso la batteria (istante attuale)',
      symbolTex: 'P_{MGU\\text{-}K}',
      unit: 'kW',
      scale: 1e-3,
      digits: 0,
      quantity: 'energy',
    },
  ]);

  // --- Plot + energy balance ---
  const plot = createPlot(layout.plots, {
    titleIT: 'Potenza in frenata: MGU-K e freni a disco',
    series: [
      {
        labelIT: 'Totale frenata (MGU-K + freni)',
        unit: 'kW',
        quantity: 'neutral',
        fill: true,
        digits: 0,
      },
      {
        labelIT: 'MGU-K → batteria (elettrica)',
        unit: 'kW',
        quantity: 'energy',
        fill: true,
        digits: 0,
      },
    ],
    xLabelIT: 't',
    xUnit: 's',
    yLabelIT: 'P [kW]',
    capacity: 256,
  });
  plot.element.append(
    el('p', {
      class: 'kers-caption',
      text: 'Area viola: potenza elettrica accumulata dall’MGU-K (al massimo Pₘₐₓ). Fascia grigia tra le due curve: potenza dissipata nei freni a disco e nelle perdite dell’MGU-K.',
    }),
  );
  const balance = createBalance(layout.plots);

  // --- Loop ---
  const loop = createLoop(
    {
      step(dt) {
        if (simT >= values.tBrake) {
          hold += dt * speed;
          if (hold >= END_HOLD) {
            hold = 0;
            simT = 0;
          }
        } else {
          simT = Math.min(values.tBrake, simT + dt * speed);
        }
      },
      render: () => draw(),
    },
    { autoStart: !ctx.reducedMotion },
  );
  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      for (const k of PARAM_KEYS) setParam(k, params[k].default);
      speedCtl.set('1');
      speed = 1;
      recompute();
    },
  });

  let lastHud = '';
  function draw(): void {
    const st = stateAt(values, simT);
    const r = summary.result;
    const peak = summary.peakPower;
    scene?.update({
      x: st.x,
      kersLevel: values.Pmax > 0 ? st.pKers / (values.Pmax * 1e3) : 0,
      brakeLevel: peak > 0 ? st.pBrakes / peak : 0,
      batteryFill: r.dEk > 0 ? st.stored / r.dEk : 0,
    });
    scene?.render();
    formulas.update({ v: st.v, pKers: st.pKers });
    const fmt = ctx.formatIT;
    const texts = [
      `t = ${fmt(st.t, 2, 's')} / ${fmt(values.tBrake, 1, 's')}`,
      `v = ${fmt(st.v * 3.6, 0, 'km/h')}`,
      `MGU-K → batteria: ${fmt(st.pKers / 1e3, 0, 'kW')}`,
      `Freni + perdite: ${fmt(st.pBrakes / 1e3, 0, 'kW')}`,
      `In batteria: ${fmt(st.stored / 1e6, 3, 'MJ')}`,
    ];
    const joined = texts.join('|');
    if (joined !== lastHud) {
      lastHud = joined;
      [hudLines.t, hudLines.v, hudLines.kers, hudLines.brakes, hudLines.stored].forEach(
        (n, i) => (n.textContent = texts[i] ?? ''),
      );
    }
  }

  function recompute(): void {
    summary = summarize(values);
    const r = summary.result;
    simT = 0;
    hold = 0;
    formulas.update({
      dEk: r.dEk > 0 ? r.dEk : Number.NaN,
      pMean: r.dEk > 0 ? summary.meanPower : Number.NaN,
      eRec: r.dEk > 0 ? r.recovered : Number.NaN,
      eDiss: r.dEk > 0 ? r.dissipated : Number.NaN,
      tRec: r.dEk > 0 ? r.timeToRecoverAtPmax : Number.NaN,
    });
    const tr = r.powerTrace;
    plot.setData(
      tr.map((p) => p.t),
      tr.map((p) => (p.pKers + p.pBrakes) / 1e3),
      tr.map((p) => p.pKers / 1e3),
    );
    balance.update(summary);
    draw();
  }

  offs.push(
    onThemeChange((theme: Theme) => {
      scene?.setTheme(theme);
      draw();
    }),
  );

  recompute();
  liveMounts += 1;
  mountsTotal += 1;
  const unregisterDebug = registerDebugHook<KersDebug>('kers-braking', {
    get liveMounts() {
      return liveMounts;
    },
    get mountsTotal() {
      return mountsTotal;
    },
    scene: () => scene?.info() ?? null,
    simTime: () => simT,
  });

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      offs.splice(0).forEach((off) => off());
      toolbar.dispose();
      presets.dispose();
      for (const k of PARAM_KEYS) sliders[k].dispose();
      speedCtl.dispose();
      formulas.dispose();
      plot.dispose();
      balance.dispose();
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
      liveMounts -= 1;
      unregisterDebug();
    },
  };
}

const sim: SimModule = {
  id: 'kers-braking',
  titleIT: 'Frenata e recupero di energia',
  summaryIT:
    'Un’auto frena da v₁ a v₂: l’MGU-K recupera energia elettrica fino alla potenza massima Pₘₐₓ, il resto diventa calore nei freni a disco.',
  slideRefs: [16, 17, 18, 19],
  theoryId: '10-kers-mguk',
  mount,
};

export default sim;
