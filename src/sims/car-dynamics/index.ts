/**
 * Simulator `car-dynamics` — "Dinamica della vettura: frenata combinata MGU-K + freni"
 * (Phase 4, approfondimento).
 *
 * A point-mass car with Pacejka tyres, drag and downforce brakes at the limit from v₁
 * to v₂ (`simulateBrakingZone`, RK4 at 1/240 s). The MGU-K brakes the rear axle up to
 * P_max/η of mechanical power (D8), the friction brakes do the rest. The scene plays the
 * zone back in real time (×1 or ×0,25); plots, energy bars and the comparison with the
 * constant-deceleration model of `kers-braking` come from the same result.
 */
import './style.css';
import {
  createButton,
  createFormulaPanel,
  createLoop,
  createPlot,
  createSegmented,
  createSimLayout,
  createSimToolbar,
  createSlider,
  createToggle,
  el,
  onThemeChange,
  type FormulaItem,
  type Slider,
} from '../../ui';
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import { G_STANDARD, type CarBrakingSample } from '../../physics';
import {
  PARAM_KEYS,
  defaultParams,
  energiesOf,
  idealBalancePercent,
  pacejkaCurve,
  params,
  sampleAt,
  speedDistance,
  summarize,
  withPoints,
  type CarUiParams,
  type ParamKey,
  type ZoneSummary,
} from './model';
import {
  MODEL_NOTE_IT,
  createBalance,
  createFixedData,
  createPresets,
  createTheoryLinks,
} from './panel';
import type { CarScene, SceneInfo } from './scene';

export { params } from './model';

export const SIM_ID = 'car-dynamics';

/** Pause at the end of the zone before the playback restarts [s]. */
const END_HOLD = 1.5;
/** Re-draw the Pacejka operating points every N frames (≈ 10 Hz). */
const SLOW_UPDATE_FRAMES = 6;

export const LIMIT_LABELS_IT = {
  front: 'anteriore',
  rear: 'posteriore',
  both: 'entrambi (ripartizione ideale)',
} as const;
export const MGUK_LIMIT_LABELS_IT = {
  power: 'potenza massima Pₘₐₓ',
  'rear-axle': 'forza frenante dell’asse posteriore',
  off: 'spenta (Pₘₐₓ = 0)',
} as const;

export const FORMULA_ITEMS: FormulaItem[] = [
  {
    key: 'fz',
    tex: 'F_z = m\\,g + \\tfrac12\\,\\rho\\,C_z A\\,v^2',
    symbolTex: 'F_z',
    labelIT: 'Carico verticale: peso + deportanza',
    unit: 'kN',
    scale: 1e-3,
    digits: 1,
    quantity: 'f',
  },
  {
    key: 'drag',
    tex: 'D = \\tfrac12\\,\\rho\\,C_x A\\,v^2',
    symbolTex: 'D',
    labelIT: 'Resistenza aerodinamica',
    unit: 'kN',
    scale: 1e-3,
    digits: 2,
    quantity: 'f',
  },
  {
    key: 'fx',
    tex: 'F_x \\le \\mu\\,F_z,\\quad F_{x,\\text{ant}} = \\beta\\,F_x',
    symbolTex: 'F_x',
    labelIT: 'Forza frenante degli pneumatici (asse al limite in κ*, ripartizione β)',
    unit: 'kN',
    scale: 1e-3,
    digits: 1,
    quantity: 'f',
  },
  {
    key: 'kappa',
    tex: 'F_x = F_z\\,\\mu\\,\\sin\\!\\big(C\\arctan(B\\kappa - E(B\\kappa - \\arctan B\\kappa))\\big)',
    symbolTex: '\\kappa_{\\text{post}}',
    labelIT: 'Pacejka semplificata: scorrimento delle ruote posteriori',
    unit: '%',
    scale: 100,
    digits: 1,
  },
  {
    key: 'fMguk',
    tex: 'F_{\\text{MGU-K}} = \\min\\!\\big(F_{x,\\text{post}},\\ P_{\\max}/(\\eta\\,v)\\big)',
    symbolTex: 'F_{\\text{MGU-K}}',
    labelIT: 'MGU-K solo sull’asse posteriore (Pₘₐₓ è il limite elettrico)',
    unit: 'kN',
    scale: 1e-3,
    digits: 2,
    quantity: 'f',
  },
  {
    key: 'decel',
    tex: 'm\\,a = F_x + D',
    symbolTex: 'a',
    labelIT: 'Decelerazione (in multipli di g)',
    unit: 'g',
    scale: 1 / G_STANDARD,
    digits: 2,
  },
  {
    key: 'pBatt',
    tex: 'P_{\\text{batt}} = \\eta\\,F_{\\text{MGU-K}}\\,v \\le P_{\\max}',
    symbolTex: 'P_{\\text{batt}}',
    labelIT: 'Potenza elettrica verso la batteria',
    unit: 'kW',
    scale: 1e-3,
    digits: 0,
    quantity: 'energy',
  },
  {
    key: 'dEk',
    tex: '\\Delta E_k = E_{\\text{MGU-K}} + E_{\\text{freni}} + E_{\\text{aero}}',
    symbolTex: '\\Delta E_k',
    labelIT: 'Bilancio energetico dell’intera frenata',
    unit: 'MJ',
    scale: 1e-6,
    digits: 2,
    quantity: 'energy',
  },
  {
    key: 'eBatt',
    tex: 'E_{\\text{batt}} = \\eta\\,E_{\\text{MGU-K}} \\le P_{\\max}\\,t_f',
    symbolTex: 'E_{\\text{batt}}',
    labelIT: 'Energia elettrica accumulata nella frenata',
    unit: 'MJ',
    scale: 1e-6,
    digits: 2,
    quantity: 'energy',
  },
];

/** Read-only diagnostics for e2e (leak check, displayed-value gate). */
export interface CarDynamicsDebug {
  liveMounts: number;
  canvases: number;
  renderer: SceneInfo | null;
  frames: number;
  simT: number;
  aero: boolean;
  params: CarUiParams;
  tBrake: number;
  distance: number;
  dEk: number;
  eMguk: number;
  eStored: number;
  eMgukLoss: number;
  eBrakesFront: number;
  eBrakesRear: number;
  eAero: number;
  balanceError: number;
  compareRecovered: number | null;
  compareDistance: number | null;
}

let liveMounts = 0;
const mounted = new WeakMap<HTMLElement, Disposable>();

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  mounted.get(host)?.dispose(); // idempotent: a second mount replaces the first
  liveMounts++;

  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const values: CarUiParams = defaultParams();
  let aero = true;
  let summary: ZoneSummary = summarize(values, aero);
  let simT = 0;
  let hold = 0;
  let speed = 1;
  let frames = 0;
  const offs: Array<() => void> = [];

  // --- Controls ---------------------------------------------------------------------
  layout.controls.append(createTheoryLinks());
  const presets = createPresets((p) => {
    setParam('Pmax', p.Pmax);
    recompute();
  });
  layout.controls.append(presets.element);

  const hints: Partial<Record<ParamKey, string>> = {
    m: '800 kg: valore tondo illustrativo, non la massa regolamentare.',
    Pmax: 'Limite sulla potenza elettrica inviata alla batteria: l’MGU-K assorbe al più Pₘₐₓ/η.',
    eta: 'Valore illustrativo (0,9 di default).',
    mu: 'Valore illustrativo per pneumatici da corsa.',
    balance: 'Quota della forza frenante totale sull’asse anteriore.',
  };
  const sliders = {} as Record<ParamKey, Slider>;
  const addSlider = (key: ParamKey): void => {
    const hintIT = hints[key];
    const s = createSlider({
      spec: params[key],
      id: `cd-${key}`,
      ...(hintIT ? { hintIT } : {}),
      onInput: (v) => {
        values[key] = v;
        recompute();
      },
    });
    sliders[key] = s;
    layout.controls.append(s.element);
  };
  for (const key of ['v1', 'v2', 'm', 'Pmax', 'eta', 'mu'] as const) addSlider(key);
  const aeroCtl = createToggle({
    labelIT: 'Aerodinamica (resistenza e deportanza)',
    checked: aero,
    onChange: (on) => {
      aero = on;
      sliders.CdA.setDisabled(!on);
      sliders.ClA.setDisabled(!on);
      recompute();
    },
  });
  aeroCtl.element.classList.add('cd-block');
  layout.controls.append(aeroCtl.element);
  for (const key of ['CdA', 'ClA', 'balance'] as const) addSlider(key);
  const idealBtn = createButton({
    labelIT: 'Ripartizione ideale',
    variant: 'ghost',
    title: 'Imposta β = quota statica + μ·h/L: entrambi gli assi arrivano al limite insieme.',
    onClick: () => {
      setParam('balance', Math.round(idealBalancePercent(values.mu)));
      recompute();
    },
  });
  idealBtn.element.classList.add('cd-ideal');
  layout.controls.append(idealBtn.element);

  const speedCtl = createSegmented<'0.25' | '1'>({
    labelIT: 'Velocità di riproduzione',
    options: [
      { value: '0.25', labelIT: '×0,25' },
      { value: '1', labelIT: '×1 (tempo reale)' },
    ],
    value: '1',
    onChange: (v) => (speed = Number(v)),
  });
  speedCtl.element.classList.add('cd-block');
  layout.controls.append(speedCtl.element, createFixedData());

  function setParam(key: ParamKey, v: number): void {
    sliders[key].set(v);
    values[key] = sliders[key].value;
  }

  // --- Scene (lazy; WebGL may be unavailable) --------------------------------------
  const hud = el('div', { class: 'cd-hud' });
  const hudLines = {
    t: el('span'),
    v: el('span'),
    a: el('span'),
    limit: el('span'),
    mguk: el('span', { class: 'cd-hud__energy' }),
    batt: el('span', { class: 'cd-hud__energy' }),
  };
  hud.append(...Object.values(hudLines));
  const legend = el('div', { class: 'cd-legend-scene' }, [
    el('span', { class: 'q-f', text: 'Frecce verdi: forze (1 m ≈ 8 kN)' }),
    el('span', { text: 'Linea colorata: punto di frenata · linea chiara: fine frenata' }),
    el('span', { class: 'cd-hud__energy', text: 'Viola: MGU-K → batteria' }),
  ]);
  layout.sceneOverlay.append(hud, legend);

  let scene: CarScene | null = null;
  let disposed = false;
  void import('./scene')
    .then(({ createCarScene }) => {
      if (disposed) return;
      try {
        scene = createCarScene(layout.scene, ctx.theme);
      } catch (e) {
        console.warn('car-dynamics: WebGL non disponibile', e);
        layout.scene.append(
          el('p', { class: 'sim-placeholder', text: 'Grafica 3D non disponibile (WebGL).' }),
        );
      }
    })
    .finally(() => {
      if (!disposed) draw();
    });
  offs.push(
    onThemeChange((t) => {
      scene?.setTheme(t);
      draw();
    }),
  );

  // --- Formulas, plots, balance --------------------------------------------------------
  const formulas = createFormulaPanel(layout.formulas, FORMULA_ITEMS);

  const plotV = createPlot(layout.plots, {
    titleIT: 'Velocità in funzione dello spazio',
    series: [
      { labelIT: 'Questo modello', unit: 'km/h', quantity: 'accent', digits: 0 },
      {
        labelIT: 'Decelerazione costante (stesso tempo)',
        unit: 'km/h',
        quantity: 'neutral',
        digits: 0,
        dash: [6, 4],
      },
    ],
    xLabelIT: 'x',
    xUnit: 'm',
    yLabelIT: 'v [km/h]',
    capacity: 512,
    height: 200,
  });
  const plotP = createPlot(layout.plots, {
    titleIT: 'Potenza di frenata (aree impilate)',
    series: [
      {
        labelIT: 'Totale (+ aerodinamica)',
        unit: 'kW',
        quantity: 'neutral',
        fill: true,
        digits: 0,
      },
      { labelIT: 'Fino ai freni anteriori', unit: 'kW', quantity: 'accent', fill: true, digits: 0 },
      {
        labelIT: 'Fino ai freni posteriori',
        unit: 'kW',
        quantity: 'neutral',
        dash: [6, 4],
        fill: true,
        digits: 0,
      },
      {
        labelIT: 'Fino alle perdite MGU-K',
        unit: 'kW',
        quantity: 'energy',
        dash: [3, 3],
        digits: 0,
      },
      { labelIT: 'MGU-K → batteria', unit: 'kW', quantity: 'energy', fill: true, digits: 0 },
    ],
    xLabelIT: 't',
    xUnit: 's',
    yLabelIT: 'P [kW]',
    capacity: 512,
    height: 200,
  });
  plotP.element.append(
    el('p', {
      class: 'cd-small',
      text: 'Curve cumulative: dal basso MGU-K → batteria (viola pieno), perdite MGU-K, freni posteriori, freni anteriori, resistenza aerodinamica. La curva più alta è la potenza totale di frenata.',
    }),
  );
  const plotK = createPlot(layout.plots, {
    titleIT: 'Pneumatico: curva di Pacejka (forza frenante / carico verticale)',
    series: [
      { labelIT: 'Forza / carico', quantity: 'f', digits: 2 },
      { labelIT: 'Asse anteriore (punto di lavoro)', quantity: 'neutral', digits: 2, width: 7 },
      { labelIT: 'Asse posteriore (punto di lavoro)', quantity: 'accent', digits: 2, width: 7 },
    ],
    xLabelIT: 'κ',
    xUnit: '%',
    capacity: 256,
    height: 200,
  });
  const balance = createBalance(layout.plots);

  let curve = pacejkaCurve(values.mu);
  let curveMu = values.mu;
  function updatePacejka(s: CarBrakingSample): void {
    if (curveMu !== values.mu) {
      curve = pacejkaCurve(values.mu);
      curveMu = values.mu;
    }
    const pts = withPoints(
      curve.k,
      curve.mu,
      [
        { x: s.kappaFront * 100, y: s.muFront },
        { x: s.kappaRear * 100, y: s.muRear },
      ],
      0.4,
    );
    plotK.setData(pts.xs, pts.curve, ...pts.cols);
  }

  // --- Loop ---------------------------------------------------------------------------
  const loop = createLoop(
    {
      step(dt) {
        const tEnd = summary.zone.tBrake;
        if (simT >= tEnd) {
          hold += dt * speed;
          if (hold >= END_HOLD) {
            hold = 0;
            simT = 0;
          }
        } else {
          simT = Math.min(tEnd, simT + dt * speed);
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
      aero = true;
      aeroCtl.set(true);
      sliders.CdA.setDisabled(false);
      sliders.ClA.setDisabled(false);
      speedCtl.set('1');
      speed = 1;
      recompute();
    },
  });

  let lastHud = '';
  function draw(): void {
    const z = summary.zone;
    const s = sampleAt(z, simT);
    const si = summary.si;
    const e = energiesOf(s, si.eta, si.m, si.v1);
    const pk = (x: number, peak: number): number => (peak > 0 ? x / peak : 0);
    const brakePeak = Math.max(summary.peakBrakesFront, summary.peakBrakesRear);
    scene?.update({
      x: s.x,
      distance: z.distance,
      drag: s.drag,
      downforceFront: s.downforce * (si.weightFront ?? 0.45),
      downforceRear: s.downforce * (1 - (si.weightFront ?? 0.45)),
      fxFront: s.fxFront,
      fxRear: s.fxRear,
      brakeFrontLevel: pk(s.pBrakesFront, brakePeak),
      brakeRearLevel: pk(s.pBrakesRear, brakePeak),
      kersLevel: si.Pmax > 0 ? s.pStored / si.Pmax : 0,
      batteryFill: z.dEk > 0 ? e.stored / z.dEk : 0,
    });
    scene?.render();
    formulas.update({
      fz: s.fzTotal,
      drag: s.drag,
      fx: s.fxTotal,
      kappa: s.kappaRear,
      fMguk: s.fMguk,
      decel: z.dEk > 0 ? s.decel : Number.NaN,
      pBatt: s.pStored,
    });
    if (frames++ % SLOW_UPDATE_FRAMES === 0) updatePacejka(s);
    const fmt = ctx.formatIT;
    const braking = z.dEk > 0;
    const texts = [
      `t = ${fmt(s.t, 2, 's')} / ${fmt(z.tBrake, 2, 's')}`,
      `v = ${fmt(s.v * 3.6, 0, 'km/h')} · x = ${fmt(s.x, 1, 'm')}`,
      braking ? `a = ${fmt(s.decel / G_STANDARD, 2, 'g')}` : 'a = —',
      `Asse al limite: ${LIMIT_LABELS_IT[s.limit]}`,
      `MGU-K limitata da: ${MGUK_LIMIT_LABELS_IT[s.mgukLimit]}`,
      `In batteria: ${fmt(e.stored / 1e6, 3, 'MJ')} (${fmt(s.pStored / 1e3, 0, 'kW')})`,
    ];
    const joined = texts.join('|');
    if (joined !== lastHud) {
      lastHud = joined;
      Object.values(hudLines).forEach((n, i) => (n.textContent = texts[i] ?? ''));
    }
  }

  function recompute(): void {
    summary = summarize(values, aero);
    const z = summary.zone;
    simT = 0;
    hold = 0;
    const braking = z.dEk > 0;
    formulas.update({
      dEk: braking ? z.dEk : Number.NaN,
      eBatt: braking ? z.eStored : Number.NaN,
    });
    const sd = speedDistance(summary);
    plotV.setData(sd.x, sd.v, sd.vConst);
    const step = Math.max(1, Math.floor(z.trace.length / 300));
    const tr = z.trace.filter((_, i, arr) => i % step === 0 || i === arr.length - 1);
    const kw = (f: (s: CarBrakingSample) => number): number[] => tr.map((s) => f(s) / 1e3);
    plotP.setData(
      tr.map((s) => s.t),
      kw((s) => s.pMguk + s.pBrakesRear + s.pBrakesFront + s.pAero),
      kw((s) => s.pMguk + s.pBrakesRear + s.pBrakesFront),
      kw((s) => s.pMguk + s.pBrakesRear),
      kw((s) => s.pMguk),
      kw((s) => s.pStored),
    );
    balance.update(summary);
    frames = 0; // refresh the Pacejka points on the next draw
    draw();
  }

  recompute();

  const debugFn = (): CarDynamicsDebug => {
    const z = summary.zone;
    return {
      liveMounts,
      canvases: layout.scene.querySelectorAll('canvas').length,
      renderer: scene ? scene.info() : null,
      frames,
      simT,
      aero,
      params: { ...values },
      tBrake: z.tBrake,
      distance: z.distance,
      dEk: z.dEk,
      eMguk: z.eMguk,
      eStored: z.eStored,
      eMgukLoss: z.eMgukLoss,
      eBrakesFront: z.eBrakesFront,
      eBrakesRear: z.eBrakesRear,
      eAero: z.eAero,
      balanceError: z.balanceError,
      compareRecovered: summary.compare?.result.recovered ?? null,
      compareDistance: summary.compare?.distance ?? null,
    };
  };
  const unregisterDebug = registerDebugHook(SIM_ID, debugFn);

  const handle: Disposable = {
    dispose() {
      if (disposed) return;
      disposed = true;
      liveMounts--;
      loop.dispose();
      offs.splice(0).forEach((off) => off());
      toolbar.dispose();
      presets.dispose();
      for (const k of PARAM_KEYS) sliders[k].dispose();
      aeroCtl.dispose();
      idealBtn.dispose();
      speedCtl.dispose();
      formulas.dispose();
      plotV.dispose();
      plotP.dispose();
      plotK.dispose();
      balance.dispose();
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
      unregisterDebug();
      if (mounted.get(host) === handle) mounted.delete(host);
    },
  };
  mounted.set(host, handle);
  return handle;
}

const sim: SimModule = {
  id: SIM_ID,
  titleIT: 'Dinamica della vettura: frenata combinata MGU-K + freni',
  summaryIT:
    'Approfondimento (Fase 4): una vettura con pneumatici, resistenza aerodinamica e deportanza frena al limite da v₁ a v₂. L’MGU-K frena l’asse posteriore fino al suo limite di potenza, i freni a disco fanno il resto: la quota recuperata dipende da velocità, aderenza e Pₘₐₓ.',
  theoryId: '15-dinamica-frenata',
  mount,
};

export default sim;
