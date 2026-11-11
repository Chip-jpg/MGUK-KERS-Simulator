/**
 * Simulator `alternator-motor` — "Alternatore ⇄ motore (MGU-K)".
 * One rotor/stator machine in two modes: generator (braking: the Lenz torque
 * opposes the motion, kinetic energy → electric energy → battery) and motor
 * (battery current → Lorentz force F = B·I·L → torque). Physics in model.ts.
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
  el,
  type FormulaItem,
  type FormulaPanel,
  type Slider,
} from '../../ui';
import { createBattery, DEFAULT_BATTERY } from '../../physics/battery';
import { createReadoutGrid } from '../../ui/readout';
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import {
  MODE_PARAMS,
  defaultParams,
  energyBalance,
  initialState,
  instant,
  params,
  rpm,
  batteryMachineStep,
  WINDING_THERMAL,
  type MachineMode,
  type MachineParams,
  type MachineState,
} from './model';
import {
  MODEL_NOTE_IT,
  THREE_PHASE_NOTE_IT,
  createTheoryLinks,
  createEnergyFlow,
  createReadouts,
  type FlowPowers,
} from './panel';
import {
  autoRange,
  createHeatBody,
  createResetViewButton,
  holdPeak,
  snapshotRenderStats,
} from '../../render';
import { F_LOG_RANGE, PARTICLE_SPEED_PER_AMP, sceneStats } from './constants';
import type { MachineScene, SceneInfo } from './scene';

export { params } from './model';

export const SIM_ID = 'alternator-motor';

export const MODE_LABELS_IT: Record<MachineMode, string> = {
  generator: 'Generatore (frenata)',
  motor: 'Motore (accelerazione)',
};

/** Time constant of the cycle-averaged powers shown in readouts and flow [s]. */
const POWER_AVG_TAU = 0.3;

export function formulaItems(mode: MachineMode): FormulaItem[] {
  const gen = mode === 'generator';
  return [
    {
      key: 'phi',
      tex: '\\Phi = B\\,S\\cos\\theta',
      symbolTex: '\\Phi',
      labelIT: 'Flusso attraverso una spira (S = L·w)',
      unit: 'Wb',
      digits: 4,
      quantity: 'b',
    },
    {
      key: 'emf',
      tex: '\\varepsilon = N\\,B\\,S\\,\\omega\\sin\\theta',
      symbolTex: '\\varepsilon',
      labelIT: gen ? 'f.e.m. indotta (Faraday-Neumann)' : 'Forza controelettromotrice (Lenz)',
      unit: 'V',
      digits: 2,
      quantity: 'emf',
    },
    {
      key: 'i',
      tex: gen
        ? 'i = \\dfrac{\\varepsilon}{R_w + R_c}'
        : 'i = \\dfrac{V_s\\sin\\theta - \\varepsilon}{R_w}',
      symbolTex: 'i',
      labelIT: gen
        ? 'Corrente indotta nel carico'
        : 'Corrente dalla batteria (alimentazione sincronizzata)',
      unit: 'A',
      digits: 2,
      quantity: 'i',
    },
    {
      key: 'F',
      tex: 'F = N\\,B\\,i\\,L',
      symbolTex: 'F',
      labelIT: 'Forza su un lato attivo (N spire) — ponte del modello, non nella presentazione',
      unit: 'N',
      digits: 2,
      quantity: 'f',
    },
    {
      key: 'tau',
      tex: '\\tau = 2\\cdot\\dfrac{w}{2}\\,F\\sin\\theta = N\\,B\\,i\\,S\\sin\\theta',
      symbolTex: '\\tau',
      labelIT: gen
        ? 'Coppia frenante: per Lenz si oppone alla rotazione'
        : 'Coppia motrice: corrente nel campo magnetico',
      unit: 'N·m',
      digits: 3,
      quantity: 'f',
    },
    {
      key: 'pConv',
      tex: '\\tau\\,\\omega = \\varepsilon\\, i',
      symbolTex: 'P',
      labelIT: 'Potenza convertita meccanica ⇄ elettrica',
      unit: 'W',
      digits: 2,
      quantity: 'energy',
    },
    {
      key: 'pJ',
      tex: 'P_J = R_w\\, i^2',
      symbolTex: 'P_J',
      labelIT: 'Calore Joule nell’avvolgimento',
      unit: 'W',
      digits: 2,
      quantity: 'energy',
    },
    {
      key: 'E',
      tex: gen
        ? 'E_{\\text{mecc}} = E_{\\text{batt}} + E_J'
        : 'E_{\\text{batt}} = E_{\\text{mecc}} + \\Delta E_{\\text{cin}} + E_J',
      symbolTex: gen ? 'E_{\\text{mecc}}' : 'E_{\\text{batt}}',
      labelIT: 'Bilancio energetico dalla ripartenza',
      unit: 'J',
      digits: 2,
      quantity: 'energy',
    },
  ];
}

/** Read-only diagnostics for e2e (leak check, displayed-value gate). */
export interface AlternatorDebug {
  liveMounts: number;
  canvases: number;
  renderer: SceneInfo | null;
  tier: string | null;
  scene: typeof sceneStats;
  foundation: Record<string, number>;
  mode: MachineMode;
  t: number;
  omega: number;
  relError: number;
  input: number;
  soc: number;
  depleted: boolean;
  tau: number;
}

let liveMounts = 0;
const mounted = new WeakMap<HTMLElement, Disposable>();

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  mounted.get(host)?.dispose(); // idempotent: a second mount replaces the first
  liveMounts++;

  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const p: MachineParams = defaultParams();
  let mode: MachineMode = 'generator';
  let s: MachineState = initialState(mode, p);
  let s0: MachineState = s;
  const avg = { pConv: 0, pElec: 0, pJoule: 0, pMech: 0 };
  const batterySpec = {
    ...DEFAULT_BATTERY,
    capacity: 5000,
    chargePower: 1000,
    dischargePower: 1000,
  };
  let battery = createBattery(batterySpec, 0.5);
  let soc = 0.5;
  let batteryLoss = 0;
  let avgDumpLoss = 0;
  let energyIn = 0,
    energyOut = 0;

  let pPeak = 0;
  let pRef = 1;
  let tauPeak = 0;
  const heat = createHeatBody(WINDING_THERMAL);
  let stepCount = 0;
  const offs: (() => void)[] = [];

  // --- side column: three-phase note, mode, restart, readouts, sliders --------
  const note = el('p', {
    class: 'am-three-phase',
    text: THREE_PHASE_NOTE_IT,
    attrs: { role: 'note' },
  });
  const modeCtl = createSegmented<MachineMode>({
    labelIT: 'Modalità della macchina',
    options: [
      { value: 'generator', labelIT: MODE_LABELS_IT.generator },
      { value: 'motor', labelIT: MODE_LABELS_IT.motor },
    ],
    value: mode,
    onChange: (m) => setMode(m),
  });
  modeCtl.element.classList.add('am-mode');
  const restart = createButton({
    labelIT: 'Riavvia la prova',
    icon: '⟲',
    title: 'Riparte da θ₀ con i parametri attuali (generatore: da ω₀; motore: da fermo)',
    onClick: () => restartRun(),
  });
  const restartWrap = el('div', { class: 'am-restart' }, [restart.element]);
  layout.controls.append(note, createTheoryLinks(), modeCtl.element, restartWrap);
  const readouts = createReadouts(layout.controls);
  const batteryState = el('p', {
    class: 'battery-state',
    text: '● Batteria disponibile',
    attrs: { role: 'status' },
  });
  const batteryBar = el('progress', {
    class: 'battery-gauge',
    attrs: { max: 1, value: soc, 'aria-label': 'Carica batteria' },
  });
  layout.controls.append(batteryState, batteryBar);
  const batteryReadouts = createReadoutGrid(layout.controls, [
    { key: 'soc', labelIT: 'Carica batteria', unit: '%', digits: 1 },
    { key: 'energy', labelIT: 'Energia disponibile', unit: 'kJ', scale: 0.001, digits: 2 },
    { key: 'in', labelIT: 'Energia immessa', unit: 'kJ', scale: 0.001, digits: 2 },
    { key: 'out', labelIT: 'Energia prelevata', unit: 'kJ', scale: 0.001, digits: 2 },
    { key: 'loss', labelIT: 'Perdite batteria e carico', unit: 'W', digits: 2 },
  ]);
  const recharge = createButton({
    labelIT: 'Ricarica',
    icon: '↯',
    onClick: () => {
      battery = createBattery(batterySpec, 0.5);
      soc = 0.5;
      render();
    },
  });
  layout.controls.append(recharge.element);
  const initialSoc = createSlider({
    id: 'am-initial-soc',
    spec: {
      min: 0,
      max: 100,
      step: 1,
      default: 50,
      unit: '%',
      labelIT: 'Carica iniziale batteria',
    },
    onInput: (value) => {
      battery = createBattery(batterySpec, value / 100);
      soc = value / 100;
      render();
    },
  });
  layout.controls.append(initialSoc.element);

  const sliders = new Map<keyof MachineParams, Slider>();
  layout.controls.append(el('h3', { class: 'am-subtitle', text: 'Parametri della macchina' }));
  for (const key of Object.keys(params) as (keyof MachineParams)[]) {
    const slider = createSlider({
      spec: params[key],
      value: p[key],
      id: `am-${key}`,
      hintIT: key === 'omega0' ? 'Si applica con «Riavvia la prova».' : undefined,
      onInput: (v) => {
        p[key] = v;
        s0 = s; // energy balance restarts from the current state
      },
    });
    sliders.set(key, slider);
    layout.controls.append(slider.element);
  }

  // --- scene overlay --------------------------------------------------------
  const badge = el('div', { class: 'am-mode-badge' });
  const legendEnergy = el('span', { class: 'q-energy', text: 'Energia: nastri, raggio ∝ P' });
  const legend = el('div', { class: 'am-legend' }, [
    el('span', { class: 'q-b', text: 'Campo B: linee calcolate nel traferro' }),
    el('span', {
      class: 'q-i',
      text: `Corrente i: particelle, ${ctx.formatIT(PARTICLE_SPEED_PER_AMP, 2)} unità/s per A`,
    }),
    el('span', {
      class: 'q-f',
      text: `Forza F e coppia τ: frecce ∝ log₁₀|F| (${F_LOG_RANGE[0]} N … ${F_LOG_RANGE[1] / 1000} kN)`,
    }),
    legendEnergy,
  ]);
  layout.sceneOverlay.append(badge);
  layout.addSceneLegend(legend);

  // --- 3D scene (skipped where WebGL is unavailable, e.g. jsdom) -------------
  let scene: MachineScene | null = null;
  let disposed = false;
  void import('./scene')
    .then(({ createMachineScene }) => {
      if (disposed) return;
      try {
        scene = createMachineScene(layout.scene, layout.sceneOverlay, ctx);
        const resetView = createResetViewButton(scene.stage);
        layout.toolbar.append(resetView.element);
        offs.push(() => resetView.dispose());
      } catch (e) {
        console.warn('alternator-motor: WebGL non disponibile', e);
      }
    })
    .finally(() => {
      if (!disposed) render();
    });

  // --- plots, flow, formulas -------------------------------------------------
  const flow = createEnergyFlow(layout.plots, mode);
  const plotEmf = createPlot(layout.plots, {
    titleIT: 'f.e.m. e corrente',
    series: [
      { labelIT: 'f.e.m. ε', unit: 'V', quantity: 'emf', digits: 2 },
      { labelIT: 'Corrente i', unit: 'A', quantity: 'i', digits: 2 },
    ],
    xLabelIT: 't',
    xUnit: 's',
    xWindow: 4,
    height: 200,
  });
  const plotP = createPlot(layout.plots, {
    titleIT: 'Potenze istantanee',
    series: [
      { labelIT: 'Convertita τω = εi', unit: 'W', quantity: 'f', digits: 2 },
      { labelIT: 'Elettrica (batteria)', unit: 'W', quantity: 'energy', digits: 2 },
      { labelIT: 'Joule R·i²', unit: 'W', quantity: 'i', digits: 2, dash: [6, 4] },
    ],
    xLabelIT: 't',
    xUnit: 's',
    xWindow: 4,
    height: 200,
  });
  let formulas: FormulaPanel = createFormulaPanel(layout.formulas, formulaItems(mode));

  // --- simulation -------------------------------------------------------------
  function restartRun(): void {
    s = initialState(mode, p);
    s0 = s;
    avg.pConv = avg.pElec = avg.pJoule = avg.pMech = 0;
    avgDumpLoss = 0;
    pPeak = tauPeak = 0;
    stepCount = 0;
    plotEmf.clear();
    plotP.clear();
    flow.setMode(mode);
    render();
  }

  function setMode(m: MachineMode): void {
    if (m !== modeCtl.value) modeCtl.set(m);
    mode = m;
    for (const [key, sl] of sliders) {
      const only = (Object.keys(MODE_PARAMS) as MachineMode[]).find((mm) =>
        MODE_PARAMS[mm].includes(key),
      );
      sl.element.hidden = only !== undefined && only !== m;
    }
    formulas.dispose();
    formulas = createFormulaPanel(layout.formulas, formulaItems(m));
    badge.textContent = MODE_LABELS_IT[m];
    restartRun();
  }

  function physicsStep(dt: number): void {
    const previousJoule = s.y[4] ?? 0;
    const result = batteryMachineStep(mode, p, s, battery, dt, batterySpec);
    s = result.state;
    battery = result.battery;
    soc = result.soc;
    batteryLoss = result.batteryLoss + result.dumpLoss;
    energyIn += Math.max(0, -result.terminalPower) * dt;
    energyOut += Math.max(0, result.terminalPower) * dt;
    const q = instant(mode, p, s.y[0] as number, s.y[1] as number, !battery.depleted);

    heat.step(Math.max(0, (s.y[4] ?? 0) - previousJoule) / dt, dt);
    pPeak = holdPeak(pPeak, Math.max(avg.pConv, avg.pElec), dt, 4);
    pRef = autoRange(pRef, pPeak, 0.1);
    tauPeak = holdPeak(tauPeak, Math.max(Math.abs(q.tauEm), Math.abs(q.tauShaft)), dt, 2);
    const a = dt / POWER_AVG_TAU;
    avg.pConv += a * (q.pConv - avg.pConv);
    avg.pElec += a * (Math.abs(result.terminalPower) - avg.pElec);
    avgDumpLoss += a * (result.dumpLoss - avgDumpLoss);
    avg.pJoule += a * (q.pJoule - avg.pJoule);
    avg.pMech += a * (q.pMech - avg.pMech);
    if (stepCount++ % 2 === 0) {
      plotEmf.push(s.t, q.emf, q.i);
      plotP.push(s.t, q.pConv, Math.abs(result.terminalPower), q.pJoule);
    }
  }

  function render(): void {
    const theta = s.y[0] as number;
    const omega = s.y[1] as number;
    const q = instant(mode, p, theta, omega, !battery.depleted);
    batteryBar.value = soc;
    batteryReadouts.update({
      soc: soc * 100,
      energy: battery.energy,
      in: energyIn,
      out: energyOut,
      loss: batteryLoss,
    });
    const stateText = battery.depleted
      ? '⚠ Batteria scarica — ricaricare almeno al 5 %'
      : mode === 'motor'
        ? '▶ Erogazione — motore'
        : '↯ Recupero — frenata (Lenz)';
    if (batteryState.textContent !== stateText) batteryState.textContent = stateText;
    batteryState.dataset['empty'] = String(battery.depleted);

    const bal = energyBalance(mode, p, s0, s);
    const gen = mode === 'generator';
    const etaNum = gen ? avg.pElec : avg.pConv;
    const etaDen = gen ? avg.pConv : avg.pElec;
    readouts.update({
      omega,
      rpm: rpm(omega),
      emf: q.emf,
      i: q.i,
      tau: q.tauEm,
      pMech: avg.pConv,
      pElec: avg.pElec,
      pJoule: avg.pJoule,
      eta: etaDen > 1e-9 ? etaNum / etaDen : Number.NaN,
      balance: bal.relError,
    });
    const powers: FlowPowers = gen
      ? { p1: avg.pConv, p2: avg.pElec, pLoss: avg.pJoule + avgDumpLoss }
      : { p1: avg.pElec, p2: avg.pConv, pLoss: avg.pJoule };
    flow.update(powers);
    formulas.update({
      phi: q.phi,
      emf: q.emf,
      i: q.i,
      F: q.forceSide,
      tau: q.tauEm,
      pConv: q.pConv,
      pJ: q.pJoule,
      E: bal.input,
    });
    // Same frame as the readouts: no one-frame lag between the two panels (QA-018).
    formulas.flush();
    if (scene) {
      const kelvin = heat.T;
      legendEnergy.textContent = `Energia: nastri, raggio ∝ P (spessore pieno = ${ctx.formatIT(pRef, pRef < 1 ? 1 : 0, 'W')})`;
      const tauShaftName = gen ? 'τ ruote' : 'τ carico';
      scene.update({
        mode,
        theta,
        omega,
        p,
        q,
        pConv: avg.pConv,
        pElec: avg.pElec,
        pJoule: avg.pJoule,
        pRef,
        tauRef: Math.max(tauPeak, 1e-3),
        T: kelvin,
        soc,
        labels: {
          b: `B = ${ctx.formatIT(p.B, 2, 'T')}`,
          emf: `ε = ${ctx.formatIT(q.emf, 1, 'V')}`,
          i: `i = ${ctx.formatIT(q.i, 2, 'A')}`,
          force: `F = ${ctx.formatIT(Math.abs(q.forceSide), 1, 'N')}`,
          tauEm: `τₑₘ = ${ctx.formatIT(q.tauEm, 2, 'N·m')}`,
          tauShaft: `${tauShaftName} = ${ctx.formatIT(Math.abs(q.tauShaft), 2, 'N·m')}`,
          battery: `Batteria ${ctx.formatIT(soc * 100, 1, '%')}`,
          heat: `T avv. = ${ctx.formatIT(kelvin - 273.15, 1, '°C')}`,
          flywheel: `J = ${ctx.formatIT(p.J, 2, 'kg·m²')}\nω = ${ctx.formatIT(omega, 1, 'rad/s')}`,
          pMech: `P mecc. = ${ctx.formatIT(avg.pConv, 1, 'W')}`,
          pElec: `P batt. = ${ctx.formatIT(avg.pElec, 1, 'W')}`,
          pJoule: `P Joule = ${ctx.formatIT(avg.pJoule, 1, 'W')}`,
        },
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
      battery = createBattery(batterySpec, 0.5);
      soc = 0.5;
      energyIn = energyOut = 0;
      initialSoc.set(50);
      for (const sl of sliders.values()) sl.reset();
      setMode('generator');
    },
  });
  setMode(mode);

  // --- debug hook ----------------------------------------------------------------
  const debugFn = (): AlternatorDebug => {
    const bal = energyBalance(mode, p, s0, s);
    return {
      liveMounts,
      canvases: layout.scene.querySelectorAll('canvas').length, // WebGL canvas only
      renderer: scene ? scene.info() : null,
      tier: scene?.stage.tier ?? null,
      scene: { ...sceneStats },
      foundation: snapshotRenderStats(),
      mode,
      t: s.t,
      omega: s.y[1] as number,
      relError: bal.relError,
      input: bal.input,
      soc,
      depleted: battery.depleted,
      tau: instant(mode, p, s.y[0]!, s.y[1]!, !battery.depleted).tauEm,
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
      plotEmf.dispose();
      plotP.dispose();
      flow.dispose();
      readouts.dispose();
      recharge.dispose();
      initialSoc.dispose();
      batteryReadouts.dispose();
      for (const sl of sliders.values()) sl.dispose();
      modeCtl.dispose();
      restart.dispose();
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
  titleIT: 'Alternatore ⇄ motore (MGU-K)',
  summaryIT:
    'La stessa macchina in due modi: in frenata è un generatore (la coppia di Lenz si oppone al moto e l’energia cinetica va in batteria), in accelerazione è un motore (la corrente della batteria nel campo magnetico produce una coppia: principio inverso dell’alternatore, collegamento al simulatore).',
  theoryId: '10-kers-mguk',
  mount,
};

export default sim;
