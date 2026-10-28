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
  onThemeChange,
  type Slider,
} from '../../ui';
import { rlTimeConstant } from '../../physics';
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
import { createRlScene, sceneCounters, type RlScene } from './scene';
import './style.css';

export { params } from './params';

export const MODEL_NOTE_IT =
  'componenti ideali, generatore senza resistenza interna, induttanza costante (nessuna saturazione).';

const ID = 'rl-energy';

export interface MountOptions {
  /** Create the Three.js scene (false in jsdom tests: no WebGL). Default true. */
  scene?: boolean;
}

let mounted = 0;

export function mountRl(
  host: HTMLElement,
  ctx: AppContext,
  options: MountOptions = {},
): Disposable {
  mounted++;
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

  let scene: RlScene | null = null;
  if (options.scene !== false) {
    try {
      scene = createRlScene(layout.scene, layout.sceneOverlay, ctx.theme);
    } catch {
      scene = null;
      layout.scene.append(
        el('p', { class: 'sim-placeholder', text: 'WebGL non disponibile: scena 3D disattivata.' }),
      );
    }
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
      slide: 15,
    },
    {
      key: 'tau',
      tex: String.raw`\tau = \dfrac{L}{R}`,
      symbolTex: '\\tau',
      unit: 's',
      digits: 4,
      slide: 15,
    },
    {
      key: 'i',
      tex: String.raw`i(t) = I_0\left(1 - e^{-t/\tau}\right)`,
      symbolTex: 'i',
      unit: 'A',
      digits: 3,
      quantity: 'i',
      slide: 15,
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
      slide: 15,
    },
    {
      key: 'emfSelf',
      tex: String.raw`\text{f.e.m.}_L = -L\,\dfrac{\Delta i}{\Delta t}`,
      symbolTex: '\\text{f.e.m.}_L',
      unit: 'V',
      digits: 3,
      quantity: 'emf',
      slide: 13,
      labelIT: 'F.e.m. autoindotta: si oppone alla variazione di i',
    },
    {
      key: 'L',
      tex: String.raw`L = \mu_0\,\mu_r\,\dfrac{N^2 S}{l}`,
      symbolTex: 'L',
      unit: 'H',
      digits: 4,
      quantity: 'b',
      slide: 14,
      labelIT: 'Induttanza (solenoide se attivato)',
    },
    {
      key: 'UM',
      tex: String.raw`U_M = \tfrac12\,L\,i^2`,
      symbolTex: 'U_M',
      unit: 'J',
      digits: 4,
      quantity: 'energy',
      slide: 17,
    },
    {
      key: 'gen',
      tex: String.raw`E\,i\,\Delta t = R\,i^2\,\Delta t + L\,i\,\Delta i`,
      symbolTex: 'E_{gen}',
      unit: 'J',
      digits: 4,
      quantity: 'energy',
      slide: 16,
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
      s = advance(s, inp, Math.min(dt * timeScale(tau), tEnd - s.t));
      dirty = true;
    },
    render() {
      draw();
    },
  });
  if (ctx.reducedMotion) loop.pause();

  function draw(): void {
    const I0 = steadyCurrent(inp);
    const b = energyBalance(s, inp.L);
    const emf = closed ? selfEmf(inp, s.i) : 0;
    scene?.render({
      closed,
      i: s.i,
      I0,
      q: inp.E > 0 ? s.Egen / inp.E : 0,
      tau,
      emfSelf: emf,
      E: inp.E,
      R: inp.R,
      L: inp.L,
    });
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

  const offTheme = onThemeChange((th) => scene?.setTheme(th));
  resetState();
  draw();

  const unregisterDebug = registerDebugHook(ID, () => ({
    mounted,
    renderers: sceneCounters.renderers,
    geometries: sceneCounters.geometries,
    materials: sceneCounters.materials,
    info: scene?.info() ?? null,
    t: s.t,
    i: s.i,
    tauRatio: currentRatioAtTau(inp),
    balance: energyBalance(s, inp.L),
  }));

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      mounted--;
      loop.dispose();
      offTheme();
      toolbar.dispose();
      switchBtn.dispose();
      toggle.dispose();
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
  slideRefs: [12, 13, 14, 15, 16, 17],
  theoryId: '06-circuito-rl-energia-campo',
  mount: (host, ctx) => mountRl(host, ctx),
};

export default sim;
