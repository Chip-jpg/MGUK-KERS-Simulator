/**
 * Simulator `faraday` — "Flusso e legge di Faraday-Neumann".
 *
 * Rotating N-turn loop in a uniform field (Φ = B·S·cos α, f.e.m. = N·B·S·ω·sin ωt)
 * and, as a second mode, the bar sliding on rails (f.e.m. = B·l·v). Physics from
 * `src/physics` via `./model`; Three.js scene in `./scene`; formulas in `./panel`.
 */
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
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
  type FormulaPanel,
  type Plot,
  type Slider,
} from '../../ui';
import { singularTurnsScale } from '../shared/turns';
import { toDegrees360 } from './format';
import { defaultParams, FaradaySim, params, type FaradayMode, type FaradayParams } from './model';
import { formulaItems, panelScales, scalesKey } from './panel';
import { createResetViewButton, snapshotRenderStats } from '../../render';
import { createFaradayScene, sceneStats, type FaradayScene } from './scene';

export { params, defaultParams, FaradaySim } from './model';
export type { FaradayParams, FaradayMode } from './model';

export const MODEL_NOTE_IT =
  'campo B uniforme, spira rigida monofase, nessuna resistenza/autoinduzione della spira; ω e v sono imposte (la coppia/forza di Lenz non è modellata); l’MGU-K reale è una macchina trifase. Nella scena le linee di campo sono calcolate per due espansioni polari affacciate (uniformi al centro, con frange ai bordi); lampadina e particelle di corrente usano un carico resistivo illustrativo: velocità delle particelle ∝ f.e.m., luminosità ∝ f.e.m.² (solo P/Pₘₐₓ, nessun valore assoluto).';

let liveMounts = 0;
let totalMounts = 0;
let currentScene: FaradayScene | null = null;

/** Read-only debug hook for the e2e leak / fps checks (`window.__kersDebug.faraday()`). */
function debugSnapshot(): Record<string, unknown> {
  return {
    liveMounts,
    totalMounts,
    ...sceneStats,
    rendererMemory: currentScene?.memory() ?? null,
    render: currentScene?.info() ?? null,
    tier: currentScene?.stage.tier ?? null,
    foundation: snapshotRenderStats(),
    canvases: document.querySelectorAll('.sim-scene canvas').length,
  };
}

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  // Idempotent: a second mount into the same host replaces the first.
  (host as HTMLElement & { __faradayDispose?: () => void }).__faradayDispose?.();
  const unregisterDebug = registerDebugHook('faraday', debugSnapshot);
  liveMounts++;
  totalMounts++;

  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const sim = new FaradaySim(defaultParams(), 'rotating');
  const disposers: Array<() => void> = [];

  // --- scene (skipped gracefully where WebGL is unavailable, e.g. jsdom) ---------
  let scene: FaradayScene | null = null;
  try {
    scene = createFaradayScene(layout.scene, layout.sceneOverlay, ctx);
    currentScene = scene;
  } catch {
    layout.scene.append(
      el('p', {
        class: 'sim-placeholder',
        text: 'Grafica 3D non disponibile in questo browser (WebGL disattivato): formule e grafici restano attivi.',
      }),
    );
  }
  disposers.push(() => {
    scene?.dispose();
    if (currentScene === scene) currentScene = null;
  });

  // --- controls ------------------------------------------------------------------
  const mode = createSegmented<FaradayMode>({
    labelIT: 'Esperimento',
    options: [
      { value: 'rotating', labelIT: 'Spira rotante' },
      { value: 'motional', labelIT: 'Moto traslatorio' },
    ],
    value: 'rotating',
    onChange: (m) => {
      sim.setMode(m);
      applyModeUI();
      refreshPanel(true);
      plotsClear();
      draw();
    },
  });
  disposers.push(() => mode.dispose());
  layout.controls.append(mode.element);

  const sliders = {} as Record<keyof FaradayParams, Slider>;
  const groups = {
    common: el('div', { class: 'faraday-group' }),
    rotating: el('div', { class: 'faraday-group' }),
    motional: el('div', { class: 'faraday-group' }),
  };
  const groupOf: Record<keyof FaradayParams, keyof typeof groups> = {
    B: 'common',
    S: 'rotating',
    N: 'rotating',
    omega: 'rotating',
    l: 'motional',
    v: 'motional',
  };
  for (const key of Object.keys(params) as Array<keyof FaradayParams>) {
    const s = createSlider({
      spec: params[key],
      id: `faraday-${key}`,
      ...(key === 'omega'
        ? { hintIT: 'Frequenza f = ω/2π e periodo T sono nel pannello Formule.' }
        : {}),
      onInput: (v) => {
        sim.setParams({ [key]: v });
        refreshPanel(false);
        draw();
      },
    });
    singularTurnsScale(s.element);
    sliders[key] = s;
    groups[groupOf[key]].append(s.element);
    disposers.push(() => s.dispose());
  }
  layout.controls.append(groups.common, groups.rotating, groups.motional);
  const applyModeUI = (): void => {
    groups.rotating.hidden = sim.mode !== 'rotating';
    groups.motional.hidden = sim.mode !== 'motional';
  };
  applyModeUI();

  // --- formulas + plots (rebuilt only when the display prefixes change) -----------
  let panel: FormulaPanel | null = null;
  let phiPlot: Plot | null = null;
  let emfPlot: Plot | null = null;
  let scales = panelScales(sim.mode, sim.params);
  let panelKey = '';
  const refreshPanel = (force: boolean): void => {
    scales = panelScales(sim.mode, sim.params);
    const key = scalesKey(sim.mode, scales);
    if (!force && key === panelKey && panel) return;
    panelKey = key;
    panel?.dispose();
    panel = createFormulaPanel(layout.formulas, formulaItems(sim.mode, scales));
    phiPlot?.dispose();
    emfPlot?.dispose();
    const rotating = sim.mode === 'rotating';
    phiPlot = createPlot(layout.plots, {
      titleIT: rotating
        ? 'Flusso Φ(t) attraverso una spira'
        : 'Flusso Φ(t) attraverso il circuito dei binari',
      series: [
        { labelIT: 'Φ', unit: scales.phi.unit, quantity: 'b', digits: scales.phi.digits + 1 },
      ],
      xLabelIT: 't',
      xUnit: 's',
      yLabelIT: scales.phi.unit,
      height: 200,
    });
    emfPlot = createPlot(layout.plots, {
      titleIT: 'Forza elettromotrice indotta f.e.m.(t)',
      series: [
        {
          labelIT: 'f.e.m.',
          unit: scales.emf.unit,
          quantity: 'emf',
          digits: scales.emf.digits + 1,
        },
      ],
      xLabelIT: 't',
      xUnit: 's',
      yLabelIT: scales.emf.unit,
      height: 200,
    });
  };
  refreshPanel(true);
  disposers.push(() => {
    panel?.dispose();
    phiPlot?.dispose();
    emfPlot?.dispose();
  });
  const plotsClear = (): void => {
    phiPlot?.clear();
    emfPlot?.clear();
  };

  // --- scene labels (same display scales as the formula panel) -------------------
  const fmt = (v: number, sc: { scale: number; unit: string; digits: number }): string =>
    ctx.formatIT(v * sc.scale, sc.digits, sc.unit);
  const sceneLabels = (r: ReturnType<FaradaySim['readout']>) => {
    const rotating = r.mode === 'rotating';
    const emfRef = rotating ? r.V0 : r.emfMotional;
    const pRel = emfRef === 0 ? 0 : (r.emf / emfRef) ** 2;
    return {
      b: `B = ${ctx.formatIT(sim.params.B, 2, 'T')}`,
      phi: rotating
        ? `Φ = B·S·cos α = ${fmt(r.phi, scales.phi)}`
        : `Φ = B·l·x = ${fmt(r.phi, scales.phi)}`,
      emf: `f.e.m. = ${fmt(r.emf, scales.emf)}`,
      alpha: `α = ${ctx.formatIT(toDegrees360(r.alpha), 0, '°')}`,
      load: `lampada: P/Pₘₐₓ = ${ctx.formatIT(pRel * 100, 0, '%')} · N = ${ctx.formatIT(sim.params.N, 0)} spire`,
    };
  };

  // --- drawing -------------------------------------------------------------------
  const draw = (): void => {
    const r = sim.readout();
    const peak = sim.peakEmf();
    const emfRef = r.mode === 'rotating' ? r.V0 : r.emfMotional;
    scene?.render({
      mode: r.mode,
      p: sim.params,
      alpha: r.alpha,
      emfRatio: emfRef === 0 ? 0 : r.emf / emfRef,
      x: r.x,
      dir: Math.sign(r.vx) || 1,
      labels: sceneLabels(r),
    });
    panel?.update(
      r.mode === 'rotating'
        ? {
            alpha: toDegrees360(r.alpha),
            phi: r.phi,
            emf: r.emf,
            V0: Math.abs(r.V0),
            peak: peak ?? Number.NaN,
            f: r.f,
          }
        : {
            x: r.x,
            phi: r.phi,
            emfMot: r.emfMotional,
            emfFlux: r.emfFromFlux,
            peak: peak ?? Number.NaN,
          },
    );
    const tr = sim.trace();
    const ks = scales.phi.scale;
    const ke = scales.emf.scale;
    phiPlot?.setData(
      tr.t,
      tr.phi.map((v) => v * ks),
    );
    emfPlot?.setData(
      tr.t,
      tr.emf.map((v) => v * ke),
    );
  };

  const loop = createLoop(
    { step: () => sim.step(), render: () => draw() },
    { autoStart: !ctx.reducedMotion },
  );
  disposers.push(() => loop.dispose());

  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      const d = defaultParams();
      for (const key of Object.keys(sliders) as Array<keyof FaradayParams>)
        sliders[key].set(d[key]);
      sim.setParams(d);
      sim.reset();
      refreshPanel(true);
      plotsClear();
      draw();
    },
  });
  disposers.push(() => toolbar.dispose());
  if (scene) {
    const resetView = createResetViewButton(scene.stage);
    layout.toolbar.append(resetView.element);
    disposers.push(() => resetView.dispose());
  }

  disposers.push(
    onThemeChange((th) => {
      scene?.setTheme(th);
      draw();
    }),
  );

  draw();

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const d of disposers.splice(0).reverse()) d();
    layout.dispose();
    host.replaceChildren();
    delete (host as HTMLElement & { __faradayDispose?: () => void }).__faradayDispose;
    liveMounts--;
    unregisterDebug();
  };
  (host as HTMLElement & { __faradayDispose?: () => void }).__faradayDispose = dispose;
  return { dispose };
}

const sim: SimModule = {
  id: 'faraday',
  titleIT: 'Flusso e legge di Faraday-Neumann',
  summaryIT:
    'Una bobina di N spire ruota in un campo magnetico uniforme: il flusso Φ = B·S·cos α varia e induce la f.e.m. N·B·S·ω·sin(ωt). In alternativa, una sbarretta scorre su due binari: f.e.m. = B·l·v.',
  theoryId: '03-faraday-neumann',
  mount,
};

export default sim;
