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
import { createResetViewButton, snapshotRenderStats } from '../../render';
import { PHYSICS_DT, kelvinToCelsius } from '../../physics';
import {
  DISC_START_DEFAULT_C,
  DISC_START_OPTIONS_C,
  createDiscPair,
  type DiscStartC,
} from '../shared/car/discs';
import { createBalance, createPresets } from './panel';
import { carStats, createKersScene, type KersScene } from './scene';
import {
  FRONT_BRAKE_SHARE,
  PARAM_KEYS,
  defaultParams,
  params,
  powersAt,
  stateAt,
  summarize,
  toSI,
  type InstantPowers,
  type EventSummary,
  type KersUiParams,
  type ParamKey,
} from './model';
import './style.css';

export { params } from './model';

export const MODEL_NOTE_IT =
  'decelerazione costante, resistenza aerodinamica e rotolamento trascurate, rendimento η costante, nessun limite di energia per giro o di carica della batteria. Pₘₐₓ è il limite di potenza elettrica dell’MGU-K. Nella scena: spessore dei nastri viola ∝ potenza (0,12 m a 350 kW); temperatura dei dischi da un modello termico a un nodo per disco (dischi carbonio-carbonio illustrativi: 1,2 kg anteriori, 0,9 kg posteriori, c = 1400 J/(kg·K); raffreddamento per convezione e irraggiamento), con la potenza dei freni a disco ripartita in modo fisso 60 % anteriore / 40 % posteriore; tutto il calore va nel disco (pastiglie e pinze non modellate); colore del corpo nero alla temperatura calcolata.';

/** Pause at the end of the event before the playback restarts [s]. */
const END_HOLD = 1.5;

/** Read-only debug data for e2e leak checks (exposed only when `debugEnabled()`). */
interface KersDebug {
  liveMounts: number;
  mountsTotal: number;
  scene: () => ReturnType<KersScene['info']> | null;
  simTime: () => number;
  discs: () => { tFront: number; tRear: number; startC: number };
  foundation: () => ReturnType<typeof snapshotRenderStats>;
  car: () => typeof carStats;
  seek: (t: number) => void;
  tier: () => string | null;
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
  let si = toSI(values);
  const r0Distance = (): number => (si.v1 > si.v2 ? ((si.v1 + si.v2) / 2) * si.tBrake : 0);
  let zoneDistance = r0Distance();
  let startC: DiscStartC = DISC_START_DEFAULT_C;
  const discs = createDiscPair(startC);
  const pw: InstantPowers = { v: 0, pBrake: 0, pMech: 0, pElec: 0, pLoss: 0, pDiscs: 0 };
  const offs: Array<() => void> = [];

  // --- Scene (WebGL may be unavailable: the rest of the page still works) ---
  let scene: KersScene | null = null;
  try {
    scene = createKersScene(layout.scene, layout.sceneOverlay, ctx);
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

  const discCtl = createSegmented<string>({
    labelIT: 'Temperatura iniziale dei dischi',
    options: DISC_START_OPTIONS_C.map((c) => ({
      value: String(c),
      labelIT: c === 25 ? 'Freddi 25 °C' : c === 300 ? 'In temperatura 300 °C' : 'Caldi 500 °C',
    })),
    value: String(startC),
    onChange: (v) => {
      startC = Number(v) as DiscStartC;
      discs.reset(startC);
      simT = 0;
      hold = 0;
      draw();
    },
  });
  layout.controls.append(discCtl.element);

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
      tex: 'E_{\\text{rec}} = \\eta \\int_0^{t_f} \\min\\!\\left(P_{\\text{fren}},\\ P_{\\max}/\\eta\\right) dt',
      labelIT: 'Energia elettrica accumulata (Pₘₐₓ limite elettrico)',
      symbolTex: 'E_{\\text{rec}}',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
      quantity: 'energy',
    },
    {
      key: 'eDiss',
      tex: 'E_{\\text{diss}} = \\Delta E_k - E_{\\text{rec}}',
      labelIT: 'Calore: freni a disco + perdite MGU-K',
      symbolTex: 'E_{\\text{diss}}',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
    },
    {
      key: 'tRec',
      tex: 't_{\\text{rec}} = \\eta\\,\\Delta E_k / P_{\\max}',
      labelIT: 'Tempo per assorbire tutta ΔEₖ alla potenza massima',
      symbolTex: 't_{\\text{rec}}',
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
      tex: 'P_{\\text{MGU-K}}(t) = \\eta\\,\\min\\!\\left(P_{\\text{fren}}(t),\\ P_{\\max}/\\eta\\right)',
      labelIT: 'Potenza elettrica verso la batteria (istante attuale)',
      symbolTex: 'P_{\\text{MGU-K}}',
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
      step: (dt) => advance(dt * speed),
      render: () => draw(),
    },
    { autoStart: !ctx.reducedMotion },
  );
  /** One fixed physics step of h seconds of event time. */
  function advance(h: number): void {
    // disc temperatures: fixed step on the disc-brake power at the current instant
    powersAt(si, simT < values.tBrake ? simT : values.tBrake, pw);
    discs.step(pw.pDiscs * FRONT_BRAKE_SHARE, pw.pDiscs * (1 - FRONT_BRAKE_SHARE), pw.v, h);
    if (simT >= values.tBrake) {
      hold += h;
      if (hold >= END_HOLD) {
        hold = 0;
        simT = 0;
        discs.reset(startC);
      }
    } else {
      simT = Math.min(values.tBrake, simT + h);
    }
  }
  /** Debug/screenshots: replay the event from 0 to t (fixed steps, discs included). */
  function seek(t: number): void {
    simT = 0;
    hold = 0;
    discs.reset(startC);
    const end = Math.min(t, values.tBrake + END_HOLD * 0.99);
    let tt = 0;
    while (tt < end - 1e-9) {
      advance(PHYSICS_DT);
      tt += PHYSICS_DT;
    }
    draw();
  }
  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      for (const k of PARAM_KEYS) setParam(k, params[k].default);
      speedCtl.set('1');
      speed = 1;
      discCtl.set(String(DISC_START_DEFAULT_C));
      startC = DISC_START_DEFAULT_C;
      recompute();
    },
  });

  const resetView = scene ? createResetViewButton(scene.core.stage) : null;
  if (resetView) layout.toolbar.append(resetView.element);

  let lastHud = '';
  function draw(): void {
    const st = stateAt(values, simT);
    const r = summary.result;
    const fmt = ctx.formatIT;
    if (scene) {
      const done = simT >= values.tBrake;
      powersAt(si, done ? values.tBrake : simT, pw);
      const xEnd = Math.max(0, st.x);
      scene.render({
        x: done ? xEnd + si.v2 * hold : st.x,
        v: done ? si.v2 : st.v,
        distance: zoneDistance,
        timeScale: speed,
        pitch: 0,
        heave: 0,
        tFront: discs.tFront,
        tRear: discs.tRear,
        batteryFill: r.dEk > 0 ? st.stored / r.dEk : 0,
        pMech: pw.pMech,
        pElec: pw.pElec,
        pLoss: pw.pLoss,
        texts: {
          mguk: `MGU-K → batteria ${fmt(pw.pElec / 1e3, 0, 'kW')}`,
          battery: `Batteria ${fmt(st.stored / 1e6, 2, 'MJ')}`,
          discFront: `Disco ant. ${fmt(kelvinToCelsius(discs.tFront), 0, '°C')}`,
          discRear: `Disco post. ${fmt(kelvinToCelsius(discs.tRear), 0, '°C')}`,
        },
      });
    }
    formulas.update({ v: st.v, pKers: st.pKers });
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
    si = toSI(values);
    zoneDistance = r0Distance();
    const r = summary.result;
    simT = 0;
    hold = 0;
    discs.reset(startC);
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
    onThemeChange((_theme: Theme) => {
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
    discs: () => ({ tFront: discs.tFront, tRear: discs.tRear, startC }),
    foundation: () => snapshotRenderStats(),
    car: () => ({ ...carStats }),
    seek,
    tier: () => scene?.core.stage.tier ?? null,
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
      discCtl.dispose();
      resetView?.dispose();
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
  theoryId: '10-kers-mguk',
  mount,
};

export default sim;
