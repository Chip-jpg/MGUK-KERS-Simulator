/**
 * Simulator `pmsm-dq` — "Macchina sincrona a magneti permanenti: modello d-q"
 * (Phase 4, approfondimento). A representative three-phase PMSM with
 * illustrative parameters: d-q currents under PI control, current circle,
 * voltage ellipse, MTPA, field weakening, torque–speed map for motoring and
 * braking (regeneration). Physics in src/physics/pmsm.ts, composition in model.ts.
 */
import './style.css';
import {
  createFormulaPanel,
  createLoop,
  createPlot,
  createSegmented,
  createSimLayout,
  createSimToolbar,
  createSlider,
  createToggle,
  el,
  formatIT,
  onThemeChange,
  type FormulaItem,
  type Slider,
} from '../../ui';
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import {
  currentCircle,
  defaultSettings,
  derive,
  initialState,
  instant,
  mtpaCurve,
  params,
  PRESETS,
  step as modelStep,
  torqueCurve,
  torqueSpeedMap,
  voltageEllipse,
  withOperatingPoint,
  type Derived,
  type MachineMode,
  type MapData,
  type PmsmSimParams,
  type PresetId,
  type Settings,
  type SimState,
} from './model';
import {
  MODEL_NOTE_IT,
  REGION_LABELS_IT,
  REPRESENTATIVE_NOTE_IT,
  createDqPlane,
  createMachineData,
  createReadouts,
  createTheoryLinks,
  planeWindow,
} from './panel';
import type { PmsmScene, SceneInfo } from './scene';

export { params } from './model';

export const SIM_ID = 'pmsm-dq';

export const MODE_LABELS_IT: Record<MachineMode, string> = {
  motor: 'Motore (accelerazione)',
  generator: 'Generatore (frenata)',
};

/** Fixed window scale of the d-q plane [A]. */
const PLANE_SCALE = 520;
/** Re-draw the maps and the constant-torque curve every N frames (≈ 10 Hz). */
const SLOW_UPDATE_FRAMES = 6;

export const FORMULA_ITEMS: FormulaItem[] = [
  {
    key: 'vd',
    tex: 'v_d = R_s\\,i_d - \\omega_e L_q\\,i_q',
    symbolTex: 'v_d',
    labelIT: 'Tensione sull’asse d (a regime)',
    unit: 'V',
    digits: 1,
    quantity: 'emf',
  },
  {
    key: 'vq',
    tex: 'v_q = R_s\\,i_q + \\omega_e L_d\\,i_d + \\omega_e\\psi_m',
    symbolTex: 'v_q',
    labelIT: 'ωₑψₘ è la f.e.m. a vuoto: l’analogo trifase di V₀ = NBSω',
    unit: 'V',
    digits: 1,
    quantity: 'emf',
    slide: 18,
  },
  {
    key: 'T',
    tex: 'T = \\tfrac{3}{2}\\,p\\,[\\psi_m i_q + (L_d - L_q)\\,i_d i_q]',
    symbolTex: 'T',
    labelIT: 'Coppia: magneti + riluttanza',
    unit: 'N·m',
    digits: 1,
    quantity: 'f',
  },
  {
    key: 'pMech',
    tex: 'P_{\\text{mecc}} = T\\,\\omega_m',
    symbolTex: 'P_{\\text{mecc}}',
    labelIT: 'Potenza all’albero (< 0 in frenata)',
    unit: 'kW',
    scale: 1e-3,
    digits: 2,
    quantity: 'energy',
  },
  {
    key: 'pCu',
    tex: 'P_{\\text{Cu}} = \\tfrac{3}{2}\\,R_s\\,(i_d^2 + i_q^2)',
    symbolTex: 'P_{\\text{Cu}}',
    labelIT: 'Calore Joule nei tre avvolgimenti',
    unit: 'kW',
    scale: 1e-3,
    digits: 2,
    quantity: 'energy',
    slide: 16,
  },
  {
    key: 'pElec',
    tex: 'P_{\\text{el}} = \\tfrac{3}{2}(v_d i_d + v_q i_q) = P_{\\text{mecc}} + P_{\\text{Cu}}',
    symbolTex: 'P_{\\text{el}}',
    labelIT: 'Bilancio a regime (ferro trascurato)',
    unit: 'kW',
    scale: 1e-3,
    digits: 2,
    quantity: 'energy',
    slide: 16,
  },
  {
    key: 'iMag',
    tex: '\\sqrt{i_d^2 + i_q^2} \\le I_{\\max}',
    symbolTex: '|i|',
    labelIT: 'Limite di corrente (cerchio)',
    unit: 'A',
    digits: 1,
    quantity: 'i',
  },
  {
    key: 'vMag',
    tex: '\\sqrt{v_d^2 + v_q^2} \\le V_{\\max} = \\dfrac{V_{\\text{DC}}}{\\sqrt{3}}',
    symbolTex: '|v|',
    labelIT: 'Limite di tensione dell’inverter (ellisse)',
    unit: 'V',
    digits: 1,
    quantity: 'emf',
  },
];

/** Read-only diagnostics for e2e (leak check, displayed-value gate). */
export interface PmsmDebug {
  liveMounts: number;
  canvases: number;
  renderer: SceneInfo | null;
  mode: MachineMode;
  auto: boolean;
  t: number;
  steps: number;
  id: number;
  iq: number;
  idRef: number;
  iqRef: number;
  torque: number;
  pMech: number;
  pElec: number;
  pCu: number;
  vRatio: number;
  region: string;
  /** Envelope torque at the current speed for the current mode (signed). */
  envelopeTorque: number;
  baseRpm: number;
  slowMotion: number;
}

let liveMounts = 0;
const mounted = new WeakMap<HTMLElement, Disposable>();

/** Linear interpolation in the map (x ascending). */
function interpMap(xs: readonly number[], ys: readonly number[], x: number): number {
  for (let k = 1; k < xs.length; k++) {
    const x1 = xs[k] as number;
    if (x <= x1) {
      const x0 = xs[k - 1] as number;
      const a = (x - x0) / (x1 - x0);
      return (ys[k - 1] as number) + a * ((ys[k] as number) - (ys[k - 1] as number));
    }
  }
  return ys[ys.length - 1] ?? Number.NaN;
}

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  mounted.get(host)?.dispose(); // idempotent: a second mount replaces the first
  liveMounts++;

  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const settings: Settings = defaultSettings();
  let d: Derived = derive(settings);
  let s: SimState = initialState(d);
  let map: MapData = torqueSpeedMap(d.machine, settings.iMax, d.vMax);
  let mapKey = '';
  let frame = 0;
  let steps = 0;
  const offs: (() => void)[] = [];

  // --- side column ----------------------------------------------------------------
  const note = el('p', { class: 'pm-note', text: REPRESENTATIVE_NOTE_IT, attrs: { role: 'note' } });
  const modeCtl = createSegmented<MachineMode>({
    labelIT: 'Modalità della macchina',
    options: [
      { value: 'motor', labelIT: MODE_LABELS_IT.motor },
      { value: 'generator', labelIT: MODE_LABELS_IT.generator },
    ],
    value: settings.mode,
    onChange: (m) => {
      settings.mode = m;
      onSettings();
    },
  });
  modeCtl.element.classList.add('pm-block');
  layout.controls.append(note, createTheoryLinks(), modeCtl.element);
  const readouts = createReadouts(layout.controls);

  layout.controls.append(el('h3', { class: 'pm-subtitle', text: 'Comando delle correnti' }));
  const autoCtl = createToggle({
    labelIT: 'MTPA automatico (con deflussaggio)',
    checked: settings.auto,
    onChange: (b) => {
      settings.auto = b;
      onSettings();
    },
  });
  autoCtl.element.classList.add('pm-block');
  layout.controls.append(autoCtl.element);

  const sliders = new Map<keyof PmsmSimParams, Slider>();
  const addSlider = (key: keyof PmsmSimParams, hintIT?: string): void => {
    const slider = createSlider({
      spec: params[key],
      value: settings[key],
      id: `pm-${key}`,
      hintIT,
      onInput: (v) => {
        settings[key] = v;
        onSettings();
      },
    });
    sliders.set(key, slider);
    layout.controls.append(slider.element);
  };
  addSlider(
    'iRef',
    'Il controllo sceglie le correnti d e q con la massima coppia per ampere, entro i limiti.',
  );
  addSlider('idRef', 'Negativa: indebolisce il campo dei magneti (deflussaggio).');
  addSlider('iqRef', 'Il segno dipende dalla modalità: positiva in motore, negativa in frenata.');
  addSlider('speedRpm', 'Velocità imposta dall’esterno (auto o banco prova).');
  layout.controls.append(el('h3', { class: 'pm-subtitle', text: 'Limiti dell’inverter' }));
  addSlider('iMax');
  addSlider('vdc', 'Vₘₐₓ = (tensione DC)/√3 è la massima ampiezza della tensione di fase.');

  layout.controls.append(el('h3', { class: 'pm-subtitle', text: 'Macchina' }));
  const presetCtl = createSegmented<PresetId>({
    labelIT: 'Esempio didattico (parametri illustrativi)',
    options: [
      { value: 'ipm', labelIT: PRESETS.ipm.labelIT },
      { value: 'spm', labelIT: PRESETS.spm.labelIT },
    ],
    value: settings.preset,
    onChange: (p) => {
      settings.preset = p;
      onSettings();
    },
  });
  presetCtl.element.classList.add('pm-block');
  const machineData = createMachineData();
  layout.controls.append(presetCtl.element, machineData.element);

  // --- scene overlay ------------------------------------------------------------------
  const badge = el('div', { class: 'pm-badge' });
  const slowMo = el('div', { class: 'pm-slowmo', attrs: { 'data-testid': 'pm-slowmo' } });
  const legend = el('div', { class: 'pm-legend' }, [
    el('span', { class: 'q-b', text: 'Campo dello statore (∝ corrente)' }),
    el('span', { class: 'pm-legend__axes', text: 'Assi d e q del rotore' }),
    el('span', { class: 'pm-legend__phase', text: 'Conduttori a, b, c (⊙ uscente, ⊗ entrante)' }),
  ]);
  legend.append(
    el('span', { class: 'pm-legend__note', text: 'Schema a una coppia polare (angoli elettrici)' }),
  );
  layout.sceneOverlay.append(badge, slowMo, legend);

  let scene: PmsmScene | null = null;
  let disposed = false;
  void import('./scene')
    .then(({ createPmsmScene }) => {
      if (disposed) return;
      try {
        scene = createPmsmScene(layout.scene, layout.sceneOverlay, ctx.theme);
      } catch (e) {
        console.warn('pmsm-dq: WebGL non disponibile', e);
      }
    })
    .finally(() => {
      if (!disposed) render();
    });
  offs.push(onThemeChange((t) => scene?.setTheme(t)));

  // --- plots ---------------------------------------------------------------------------
  const plane = createDqPlane(layout.plots);
  const plotT = createPlot(layout.plots, {
    titleIT: 'Mappa coppia–velocità (motore e frenata)',
    series: [
      { labelIT: 'Coppia massima in motore', unit: 'N·m', quantity: 'f', digits: 1 },
      { labelIT: 'Coppia massima in frenata', unit: 'N·m', quantity: 'f', digits: 1, dash: [6, 4] },
      { labelIT: 'Punto di lavoro', unit: 'N·m', quantity: 'neutral', digits: 1, width: 7 },
    ],
    xLabelIT: 'n',
    xUnit: 'giri/min',
    capacity: 128,
    height: 210,
  });
  const plotP = createPlot(layout.plots, {
    titleIT: 'Potenza meccanica massima',
    series: [
      { labelIT: 'Potenza in motore', unit: 'kW', quantity: 'energy', digits: 1 },
      { labelIT: 'Potenza in frenata', unit: 'kW', quantity: 'energy', digits: 1, dash: [6, 4] },
      { labelIT: 'Punto di lavoro', unit: 'kW', quantity: 'neutral', digits: 1, width: 7 },
    ],
    xLabelIT: 'n',
    xUnit: 'giri/min',
    capacity: 128,
    height: 210,
  });
  const plotI = createPlot(layout.plots, {
    titleIT: 'Correnti di fase (animazione rallentata)',
    series: [
      { labelIT: 'Fase a', unit: 'A', quantity: 'i', digits: 1 },
      { labelIT: 'Fase b', unit: 'A', quantity: 'i', digits: 1, dash: [8, 4] },
      { labelIT: 'Fase c', unit: 'A', quantity: 'i', digits: 1, dash: [2, 3] },
    ],
    xLabelIT: 'θₑ/2π',
    xUnit: 'giri elettrici',
    xWindow: 3,
    height: 200,
  });
  const plotV = createPlot(layout.plots, {
    titleIT: 'Tensione della fase a',
    series: [{ labelIT: 'Tensione vₐ', unit: 'V', quantity: 'emf', digits: 1 }],
    xLabelIT: 'θₑ/2π',
    xUnit: 'giri elettrici',
    xWindow: 3,
    height: 200,
  });
  const formulas = createFormulaPanel(layout.formulas, FORMULA_ITEMS);

  // --- logic -----------------------------------------------------------------------------
  function refreshVisibility(): void {
    (sliders.get('iRef') as Slider).element.hidden = !settings.auto;
    (sliders.get('idRef') as Slider).element.hidden = settings.auto;
    (sliders.get('iqRef') as Slider).element.hidden = settings.auto;
  }

  function onSettings(): void {
    d = derive(settings);
    const key = `${settings.preset}|${settings.iMax}|${settings.vdc}`;
    if (key !== mapKey) {
      mapKey = key;
      map = torqueSpeedMap(d.machine, settings.iMax, d.vMax);
      machineData.update(d.machine);
    }
    badge.textContent = MODE_LABELS_IT[settings.mode];
    slowMo.textContent = `Rallentatore: 1 s di animazione = ${formatIT(d.k * 1e3, d.k < 0.01 ? 2 : 1, 'ms')} reali`;
    refreshVisibility();
    frame = 0; // force a slow update on the next render
    render();
  }

  function physicsStep(dt: number): void {
    s = modelStep(s, d, dt);
    steps++;
    if (steps % 2 === 0) {
      const q = instant(s, d);
      const x = s.thetaE / (2 * Math.PI);
      plotI.push(x, q.ia, q.ib, q.ic);
      plotV.push(x, q.va);
    }
  }

  function envelopeAt(rpm: number): number {
    return interpMap(map.rpm, settings.mode === 'motor' ? map.tMotor : map.tGen, rpm);
  }

  function warnings(q: ReturnType<typeof instant>): string {
    const w: string[] = [];
    if (q.iMag > settings.iMax * 1.001) w.push('Attenzione: corrente oltre il limite Iₘₐₓ.');
    if (q.saturated)
      w.push('Tensione al limite: l’inverter non riesce a imporre la corrente richiesta.');
    if (d.region === 'infeasible')
      w.push('A questa velocità nessuna corrente rispetta il limite di tensione.');
    return w.join(' ');
  }

  function render(): void {
    const q = instant(s, d);
    readouts.update(
      {
        torque: q.torque,
        pMech: q.pMech,
        pElec: q.pElec,
        pCu: q.pCu,
        eta: q.eta,
        id: q.id,
        iq: q.iq,
        vd: q.vd,
        vq: q.vq,
        vRatio: q.vRatio,
        baseRpm: d.baseRpm,
      },
      REGION_LABELS_IT[d.region],
      warnings(q),
    );
    formulas.update({
      vd: q.vd,
      vq: q.vq,
      T: q.torque,
      pMech: q.pMech,
      pCu: q.pCu,
      pElec: q.pElec,
      iMag: q.iMag,
      vMag: q.vMag,
    });
    formulas.flush(); // same frame as the readouts (QA-018)
    plane.setPoint([q.id, q.iq], [d.idRef, d.iqRef]);
    if (frame++ % SLOW_UPDATE_FRAMES === 0) {
      const w = planeWindow(PLANE_SCALE);
      const mt = mtpaCurve(d.machine, Math.max(settings.iMax, PLANE_SCALE) * 1.2);
      plane.setCurves(
        {
          circle: currentCircle(settings.iMax),
          ellipse: voltageEllipse(d.machine, d.omegaE, d.vMax),
          mtpa: mt.motor,
          mtpaGen: mt.generator,
          torque: Math.abs(q.torque) > 0.5 ? torqueCurve(d.machine, q.torque, w.x0, w.x1) : [],
        },
        PLANE_SCALE,
      );
      const delta = 0.025 * (map.rpm[map.rpm.length - 1] ?? 1);
      const t = withOperatingPoint(
        map.rpm,
        [map.tMotor, map.tGen],
        settings.speedRpm,
        q.torque,
        delta,
      );
      plotT.setData(t.xs, ...t.cols, t.op);
      const p = withOperatingPoint(
        map.rpm,
        [map.pMotorKw, map.pGenKw],
        settings.speedRpm,
        q.pMech / 1e3,
        delta,
      );
      plotP.setData(p.xs, ...p.cols, p.op);
    }
    if (scene) {
      scene.update({
        thetaE: s.thetaE,
        currentAngle: q.currentAngle,
        currentRel: q.iMag / Math.max(settings.iMax, 1),
        ia: q.ia,
        ib: q.ib,
        ic: q.ic,
      });
      scene.render();
    }
  }

  const loop = createLoop(
    { step: physicsStep, render: () => render() },
    { autoStart: !ctx.reducedMotion },
  );
  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      for (const sl of sliders.values()) sl.reset();
      Object.assign(settings, defaultSettings());
      modeCtl.set(settings.mode);
      presetCtl.set(settings.preset);
      autoCtl.set(settings.auto);
      d = derive(settings);
      s = initialState(d);
      plotI.clear();
      plotV.clear();
      onSettings();
    },
  });
  onSettings();

  // --- debug hook ---------------------------------------------------------------------------
  const debugFn = (): PmsmDebug => {
    const q = instant(s, d);
    return {
      liveMounts,
      canvases: layout.scene.querySelectorAll('canvas').length,
      renderer: scene ? scene.info() : null,
      mode: settings.mode,
      auto: settings.auto,
      t: s.t,
      steps,
      id: q.id,
      iq: q.iq,
      idRef: d.idRef,
      iqRef: d.iqRef,
      torque: q.torque,
      pMech: q.pMech,
      pElec: q.pElec,
      pCu: q.pCu,
      vRatio: q.vRatio,
      region: d.region,
      envelopeTorque: envelopeAt(settings.speedRpm),
      baseRpm: d.baseRpm,
      slowMotion: 1 / d.k,
    };
  };
  const unregisterDebug = registerDebugHook(SIM_ID, debugFn);

  const handle: Disposable = {
    dispose() {
      if (disposed) return;
      disposed = true;
      liveMounts--;
      loop.dispose();
      for (const off of offs) off();
      toolbar.dispose();
      formulas.dispose();
      plotT.dispose();
      plotP.dispose();
      plotI.dispose();
      plotV.dispose();
      plane.dispose();
      readouts.dispose();
      for (const sl of sliders.values()) sl.dispose();
      modeCtl.dispose();
      presetCtl.dispose();
      autoCtl.dispose();
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
  titleIT: 'Macchina sincrona a magneti permanenti: modello d-q',
  summaryIT:
    'Approfondimento (Fase 4): dalla spira delle slide a una macchina trifase rappresentativa. Correnti d e q, limiti di corrente e di tensione, MTPA, deflussaggio e mappa coppia–velocità in motore e in frenata spiegano perché il recupero è limitato in potenza.',
  slideRefs: [18, 19],
  theoryId: '16-pmsm-dq',
  mount,
};

export default sim;
