import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import {
  createButton,
  createFormulaPanel,
  createLoop,
  createPlot,
  createSimLayout,
  createSimToolbar,
  createSlider,
  createToggle,
  el,
  formatIT,
  type Slider,
} from '../../ui';
import { magneticEnergy, rlTimeConstant } from '../../physics';
import { createHeatBody, createResetViewButton, snapshotRenderStats } from '../../render';
import {
  T_END_TAUS,
  advance,
  analyticGeneratorEnergy,
  currentPlotData,
  currentRatioAtTau,
  energyBalance,
  inductanceFromSolenoid,
  initialState,
  selfEmf,
  steadyCurrent,
  timeScale,
  type RlInputs,
  type RlState,
} from './model';
import { createEnergyBars } from './panel';
import { defaultParams, params, type ParamKey, type RlParams } from './params';
import type { RlScene, RlSceneInfo } from './scene';
import {
  PARTICLE_SPEED_PER_AMP,
  PARTICLE_VMAX,
  RESISTOR_THERMAL,
  RES_T_SCALE_C,
  cellCount,
  circuitPowers,
  currentRef,
  sceneStats,
} from './visual';
import './style.css';

export { params } from './params';

const fmt = (x: number, d = 0, u?: string): string => formatIT(x, d, u);

export const MODEL_NOTE_IT =
  'componenti ideali, generatore senza resistenza interna, induttanza costante (nessuna saturazione). ' +
  `Nella scena: pile disegnate ∝ E (1,5 V ciascuna); particelle di corrente con velocità ∝ i (${fmt(PARTICLE_SPEED_PER_AMP, 1)} unità/s per A, massimo ${fmt(PARTICLE_VMAX, 1)} unità/s); ` +
  'linee di B calcolate per un solenoide finito (somma di spire coassiali), seminate a flusso uguale: il loro numero è ∝ i/I* con I* = fondo scala 1-2-5 sopra I₀; ' +
  'bagliore viola ∝ energia del campo ½·L·i² (pieno = energia a regime ½·L·I₀²); freccia ambra ∝ |f.e.m. autoindotta| = L·|di/dt| (uguale a E all’istante della chiusura); ' +
  'nastri di energia con raggio ∝ potenza: generatore E·i = Joule R·i² + campo L·i·di/dt. ' +
  `Filo del resistore: modello termico concentrato C·dT/dt = R·i² − hA·(T − T₀), T₀ = 20 °C, con valori illustrativi C = ${fmt(RESISTOR_THERMAL.C, 2)} J/K, hA = ${fmt(RESISTOR_THERMAL.hA, 1)} W/K; bagliore di corpo nero solo sopra 700 K, falsi colori a richiesta.`;

const ID = 'rl-energy';

export interface MountOptions {
  /** Create the Three.js scene (false in jsdom tests: no WebGL). Default true. */
  scene?: boolean;
}

let mounted = 0;
let mountsTotal = 0;

export function mountRl(
  host: HTMLElement,
  ctx: AppContext,
  options: MountOptions = {},
): Disposable {
  mounted++;
  mountsTotal++;
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const p: RlParams = defaultParams();
  let fromSolenoid = false;
  let closed = false;
  let s: RlState = initialState();
  let dirty = true;

  const inputs = (): RlInputs => ({
    E: p.E,
    R: p.R,
    L: fromSolenoid ? inductanceFromSolenoid(p.N, p.S, p.l, p.muR) : p.L,
  });
  let inp = inputs();
  let tau = rlTimeConstant(inp.R, inp.L);

  const heat = createHeatBody(RESISTOR_THERMAL);
  let thermal = false;
  let disposed = false;
  const offs: Array<() => void> = [];
  let scene: RlScene | null = null;

  // --- scene overlay: legend + thermal scale ----------------------------------------------
  const thermalNow = el('span', { class: 'rl-thermal__now' });
  const thermalLegend = el(
    'div',
    { class: 'rl-thermal', attrs: { hidden: true, 'data-testid': 'thermal-legend' } },
    [
      el('span', {
        class: 'rl-thermal__title',
        text: 'Temperatura del filo del resistore (falsi colori)',
      }),
      el('span', { class: 'rl-thermal__bar', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'rl-thermal__ticks' }, [
        el('span', { text: `${RES_T_SCALE_C[0]} °C` }),
        el('span', { text: `${(RES_T_SCALE_C[0] + RES_T_SCALE_C[1]) / 2} °C` }),
        el('span', { text: `${RES_T_SCALE_C[1]} °C` }),
      ]),
      thermalNow,
    ],
  );
  const legend = el('div', { class: 'rl-legend-3d' }, [
    el('span', {
      class: 'q-i',
      text: `Corrente: particelle, ${fmt(PARTICLE_SPEED_PER_AMP, 1)} unità/s per A`,
    }),
    el('span', { class: 'q-b', text: 'Campo B: linee calcolate, numero ∝ i' }),
    el('span', { class: 'q-emf', text: 'f.e.m. autoindotta: freccia ∝ L·|di/dt|' }),
    el('span', { class: 'q-energy', text: 'Energia: bagliore ∝ ½·L·i², nastri ∝ potenza' }),
  ]);
  layout.sceneOverlay.append(legend, thermalLegend);
  if (options.scene !== false) {
    void import('./scene')
      .then(({ createRlScene }) => {
        if (disposed) return;
        try {
          scene = createRlScene(layout.scene, layout.sceneOverlay, ctx);
          const resetView = createResetViewButton(scene.stage);
          layout.toolbar.append(resetView.element);
          offs.push(() => resetView.dispose());
          draw();
          scene.prewarm();
          scene.render();
        } catch (e) {
          scene = null;
          console.warn('rl-energy: WebGL non disponibile', e);
          layout.scene.append(
            el('p', {
              class: 'sim-placeholder',
              text: 'WebGL non disponibile: scena 3D disattivata.',
            }),
          );
        }
      })
      .catch(() => undefined);
  }

  // --- controls ---------------------------------------------------------------
  const switchBtn = createButton({
    labelIT: 'Chiudi interruttore',
    variant: 'primary',
    icon: '⏻',
    onClick: () => setClosed(!closed),
  });
  const status = el('p', { class: 'rl-status', attrs: { 'aria-live': 'polite' } });
  const sliders = new Map<ParamKey, Slider>();
  const mk = (key: ParamKey): Slider => {
    const sl = createSlider({
      spec: params[key],
      id: `${ID}-${key}`,
      onInput: (v) => {
        p[key] = v;
        paramsChanged();
      },
    });
    sliders.set(key, sl);
    return sl;
  };
  const solenoidBox = el('div', { class: 'rl-solenoid', attrs: { hidden: true } });
  const toggle = createToggle({
    labelIT: 'L da solenoide (L = μ₀μᵣN²S/l)',
    onChange: (b) => {
      fromSolenoid = b;
      solenoidBox.hidden = !b;
      sliders.get('L')?.setDisabled(b);
      paramsChanged();
    },
  });
  const box = el('div', { class: 'rl-controls' }, [
    switchBtn.element,
    status,
    mk('E').element,
    mk('R').element,
    mk('L').element,
    toggle.element,
    solenoidBox,
  ]);
  solenoidBox.append(mk('N').element, mk('S').element, mk('l').element, mk('muR').element);
  const thermalToggle = createToggle({
    labelIT: 'Mostra temperatura del resistore',
    onChange: (b) => {
      thermal = b;
      thermalLegend.hidden = !b;
      loop.stepOnce();
    },
  });
  box.append(thermalToggle.element);

  const tauRatioNode = el('strong', { attrs: { 'data-testid': 'tau-ratio' } });
  const readout = el('p', { class: 'rl-tau' }, ['i(τ) = ', tauRatioNode, ' di I₀']);
  box.append(readout);
  layout.controls.append(box);

  const formulas = createFormulaPanel(layout.formulas, [
    {
      key: 'I0',
      tex: String.raw`I_0 = \dfrac{E}{R}`,
      symbolTex: 'I_0',
      unit: 'A',
      digits: 3,
      quantity: 'i',
    },
    {
      key: 'tau',
      tex: String.raw`\tau = \dfrac{L}{R}`,
      symbolTex: '\\tau',
      unit: 's',
      digits: 4,
    },
    {
      key: 'i',
      tex: String.raw`i(t) = I_0\left(1 - e^{-t/\tau}\right)`,
      symbolTex: 'i',
      unit: 'A',
      digits: 3,
      quantity: 'i',
      labelIT: 'Extracorrente di chiusura (valore simulato)',
    },
    {
      key: 'ratio',
      tex: String.raw`\dfrac{i(\tau)}{I_0} = 1 - e^{-1}`,
      symbolTex: 'i(\\tau)/I_0',
      unit: '%',
      scale: 100,
      digits: 1,
      quantity: 'i',
    },
    {
      key: 'emfSelf',
      tex: String.raw`\text{f.e.m.}_L = -L\,\dfrac{\Delta i}{\Delta t}`,
      symbolTex: '\\text{f.e.m.}_L',
      unit: 'V',
      digits: 3,
      quantity: 'emf',
      labelIT: 'F.e.m. autoindotta: si oppone alla variazione di i',
    },
    {
      key: 'L',
      tex: String.raw`L = \mu_0\,\mu_r\,\dfrac{N^2 S}{l}`,
      symbolTex: 'L',
      unit: 'H',
      digits: 4,
      quantity: 'b',
      labelIT: 'Induttanza (solenoide se attivato)',
    },
    {
      key: 'UM',
      tex: String.raw`U_M = \tfrac12\,L\,i^2`,
      symbolTex: 'U_M',
      unit: 'J',
      digits: 4,
      quantity: 'energy',
    },
    {
      key: 'gen',
      tex: String.raw`E\,i\,\Delta t = R\,i^2\,\Delta t + L\,i\,\Delta i`,
      symbolTex: 'E_{\\text{gen}}',
      unit: 'J',
      digits: 4,
      quantity: 'energy',
      labelIT: 'Bilancio energetico: generatore = Joule + campo',
    },
  ]);

  // --- plots ------------------------------------------------------------------
  const currentPlot = createPlot(layout.plots, {
    titleIT: 'Corrente i(t) alla chiusura, con τ = L/R e asintoto I₀ = E/R',
    xLabelIT: 't',
    xUnit: 's',
    capacity: 260,
    series: [
      { labelIT: 'i(t) teorica', unit: 'A', quantity: 'i' },
      { labelIT: 'I₀ = E/R', unit: 'A', quantity: 'neutral', dash: [6, 4], width: 1.5 },
      { labelIT: 'τ = L/R', unit: 'A', quantity: 'accent', width: 2 },
      { labelIT: 'i simulata (RK4), istante attuale', unit: 'A', quantity: 'emf', width: 2 },
    ],
  });
  const tauNote = el('p', { class: 'rl-plot-note', attrs: { 'data-testid': 'tau-note' } });
  currentPlot.element.append(tauNote);
  const energyPlot = createPlot(layout.plots, {
    titleIT: 'Energie nel tempo',
    xLabelIT: 't',
    xUnit: 's',
    capacity: 900,
    series: [
      { labelIT: 'Generatore', unit: 'J', quantity: 'energy', digits: 4 },
      { labelIT: 'Joule', unit: 'J', quantity: 'i', digits: 4 },
      { labelIT: 'Campo ½Li²', unit: 'J', quantity: 'b', digits: 4 },
    ],
  });
  // Before the switch closes the energy plot would be empty axes: show a hint (QA-017).
  const energyHint = el('p', {
    class: 'rl-plot-hint',
    text: 'Chiudi l’interruttore per avviare il transitorio',
    attrs: { 'data-testid': 'energy-hint' },
  });
  energyPlot.element.classList.add('rl-energy-plot', 'rl-energy-plot--idle');
  energyPlot.element.append(energyHint);
  const bars = createEnergyBars(layout.plots);

  // --- logic ------------------------------------------------------------------
  function resetState(): void {
    s = initialState();
    heat.reset();
    energyPlot.clear();
    energyPlot.push(0, 0, 0, 0);
    dirty = true;
  }
  function setClosed(c: boolean): void {
    closed = c;
    energyHint.hidden = c;
    energyPlot.element.classList.toggle('rl-energy-plot--idle', !c);
    switchBtn.setLabel(c ? 'Apri e azzera' : 'Chiudi interruttore', c ? '↺' : '⏻');
    resetState();
    if (c && loop.isPaused() && !ctx.reducedMotion) {
      loop.resume();
      toolbar.refresh();
    }
    loop.stepOnce();
  }
  function paramsChanged(): void {
    inp = inputs();
    tau = rlTimeConstant(inp.R, inp.L);
    resetState();
    loop.stepOnce();
  }

  const loop = createLoop({
    step(dt) {
      const tEnd = T_END_TAUS * tau;
      if (!closed || s.t >= tEnd) return;
      stepSim(Math.min(dt * timeScale(tau), tEnd - s.t));
    },
    render() {
      draw();
    },
  });
  if (ctx.reducedMotion) loop.pause();

  /** Advance the model by h of simulated time (RK4) and the resistor wire (exact step). */
  function stepSim(h: number): void {
    const joule0 = s.EJoule;
    s = advance(s, inp, h);
    // mean Joule power over the step = the model's own integrated R·i² heat / h
    const P = h > 0 ? (s.EJoule - joule0) / h : 0;
    heat.step(P, h);
    dirty = true;
  }

  function draw(): void {
    const I0 = steadyCurrent(inp);
    const b = energyBalance(s, inp.L);
    const emf = closed ? selfEmf(inp, s.i) : 0;
    if (scene) {
      const Iref = currentRef(I0);
      const pw = circuitPowers(inp.E, inp.R, s.i);
      const U = magneticEnergy(inp.L, s.i);
      const Tc = heat.T - 273.15;
      scene.update({
        closed,
        i: s.i,
        Iref,
        E: inp.E,
        emfSelf: emf,
        U,
        Uref: magneticEnergy(inp.L, I0),
        pGen: pw.gen,
        pJoule: pw.joule,
        pField: pw.field,
        pRef: inp.E * Iref,
        T: heat.T,
        thermal,
        core: fromSolenoid && p.muR > 1,
        snap: loop.isPaused(),
        texts: {
          battery: `E = ${fmt(inp.E, 1, 'V')} · ${cellCount(inp.E)} pile · E·i = ${fmt(pw.gen, pw.gen < 10 ? 2 : 1, 'W')}`,
          switch: closed ? 'interruttore chiuso' : 'interruttore aperto',
          current: `i = ${fmt(s.i, 3, 'A')} (${fmt(I0 > 0 ? (100 * s.i) / I0 : 0, 1, '%')} di I₀)`,
          resistor: `R = ${fmt(inp.R, 1, 'Ω')} · R·i² = ${fmt(pw.joule, pw.joule < 10 ? 2 : 1, 'W')} · ${fmt(Tc, 1, '°C')}`,
          solenoid: `L = ${fmt(inp.L, 3, 'H')} · B ∝ i`,
          emf: `f.e.m. autoindotta −L·di/dt = ${fmt(emf, 2, 'V')}`,
          energy: `½·L·i² = ${fmt(U, U < 0.1 ? 4 : 3, 'J')}`,
        },
      });
      thermalNow.textContent = `Ora: ${fmt(Tc, 1, '°C')} (R·i² = ${fmt(pw.joule, 2, 'W')})`;
      scene.render();
    }
    if (!dirty) return;
    dirty = false;
    const ratio = currentRatioAtTau(inp);
    tauRatioNode.textContent = formatIT(ratio * 100, 1, '%');
    formulas.update({
      I0,
      tau,
      i: s.i,
      ratio,
      emfSelf: emf,
      L: inp.L,
      UM: b.field,
      gen: b.gen,
    });
    const tEnd = T_END_TAUS * tau;
    bars.update(b, analyticGeneratorEnergy(inp, tEnd));
    if (s.t > 0) energyPlot.push(s.t, b.gen, b.joule, b.field);
    const [xs, ...ys] = currentPlotData(inp, s.t, s.i);
    currentPlot.setData(xs, ...ys);
    tauNote.textContent = `Linea verticale verde: τ = L/R = ${formatIT(tau, tau < 0.01 ? 6 : 4, 's')}, dove i(τ) = ${formatIT(ratio * 100, 1, '%')} di I₀ = ${formatIT(I0, 3, 'A')}. Linea tratteggiata: asintoto I₀ = E/R. Linea ambra: istante attuale della simulazione.`;
    const k = timeScale(tau);
    status.textContent = closed
      ? `t = ${formatIT(s.t, 4, 's')} = ${formatIT(s.t / tau, 2)} τ${s.t >= tEnd ? ' (regime raggiunto)' : ''} · rallentatore: 1 s reale = ${formatIT(k, k < 0.01 ? 5 : 3, 's')} simulati`
      : 'Interruttore aperto (i = 0). Premi «Chiudi interruttore» per avviare il transitorio.';
  }

  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      Object.assign(p, defaultParams());
      for (const [k, sl] of sliders) sl.set(params[k].default);
      toggle.set(false);
      fromSolenoid = false;
      solenoidBox.hidden = true;
      sliders.get('L')?.setDisabled(false);
      setClosed(false);
      paramsChanged();
    },
  });

  resetState();
  draw();

  const unregisterDebug = registerDebugHook(ID, () => ({
    mounted,
    mountsTotal,
    tier: scene?.stage.tier ?? null,
    scene: (scene?.info() ?? null) as RlSceneInfo | null,
    sceneStats: { ...sceneStats },
    foundation: { ...snapshotRenderStats() },
    t: s.t,
    tau,
    i: s.i,
    T: heat.T,
    closed,
    tauRatio: currentRatioAtTau(inp),
    balance: energyBalance(s, inp.L),
    /** Close the switch (if open), pause, and integrate up to simulated time t [s]. */
    seek(tSim: number): void {
      if (!closed) setClosed(true);
      loop.pause();
      toolbar.refresh();
      const target = Math.min(tSim, T_END_TAUS * tau);
      while (s.t < target - 1e-12) stepSim(Math.min(tau / 50, target - s.t));
      draw();
    },
  }));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      mounted--;
      loop.dispose();
      for (const off of offs) off();
      toolbar.dispose();
      switchBtn.dispose();
      toggle.dispose();
      thermalToggle.dispose();
      for (const sl of sliders.values()) sl.dispose();
      sliders.clear();
      formulas.dispose();
      currentPlot.dispose();
      energyPlot.dispose();
      bars.dispose();
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
      unregisterDebug();
    },
  };
}

const sim: SimModule = {
  id: ID,
  titleIT: 'Autoinduzione, circuito RL, energia',
  summaryIT:
    'Chiudi l’interruttore: l’autoinduzione frena la corrente, che cresce come i(t) = I₀·(1 − exp(−t/τ)) con τ = L/R. L’energia del generatore si divide tra calore Joule ed energia del campo magnetico ½LI².',
  theoryId: '06-circuito-rl-energia-campo',
  mount: (host, ctx) => mountRl(host, ctx),
};

export default sim;
