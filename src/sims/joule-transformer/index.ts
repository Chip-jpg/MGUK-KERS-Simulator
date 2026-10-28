import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import {
  createFormulaPanel,
  createLoop,
  createSimLayout,
  createSimToolbar,
  createSlider,
  el,
  onThemeChange,
  type Slider,
} from '../../ui';
import { computeTransmission, type TransmissionInputs } from './model';
import { createComparisonChart, createResultsPanel } from './panel';
import { defaultInputs, params, type ParamKey } from './params';
import { createTransformerScene, sceneCounters, type TransformerScene } from './scene';
import './style.css';

export { params } from './params';

export const MODEL_NOTE_IT =
  'trasformatore ideale (nessuna perdita, accoppiamento perfetto), linea puramente resistiva, valori efficaci.';

const ID = 'joule-transformer';

export interface MountOptions {
  /** Create the Three.js scene (false in jsdom tests: no WebGL). Default true. */
  scene?: boolean;
}

/** Live mounts (leak check via the debug hook). */
let mounted = 0;

interface DebugApi {
  mounted: number;
  renderers: number;
  geometries: number;
  materials: number;
  info: ReturnType<TransformerScene['info']> | null;
  lossFactor: number;
}

/** Mount implementation; `SimModule.mount` calls it with defaults. */
export function mountTransformer(
  host: HTMLElement,
  ctx: AppContext,
  options: MountOptions = {},
): Disposable {
  mounted++;
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const state: TransmissionInputs = defaultInputs();
  let t = 0;
  let lastFactor = Number.NaN;

  let scene: TransformerScene | null = null;
  if (options.scene !== false) {
    try {
      scene = createTransformerScene(layout.scene, layout.sceneOverlay, ctx.theme);
    } catch {
      scene = null;
      layout.scene.append(
        el('p', { class: 'sim-placeholder', text: 'WebGL non disponibile: scena 3D disattivata.' }),
      );
    }
  }

  const formulas = createFormulaPanel(layout.formulas, [
    {
      key: 'V2',
      tex: String.raw`\dfrac{\Delta V_1}{\Delta V_2} = \dfrac{N_1}{N_2}`,
      symbolTex: 'V_2',
      unit: 'kV',
      scale: 1e-3,
      digits: 1,
      quantity: 'emf',
      labelIT: 'Trasformatore statico ideale',
    },
    {
      key: 'I2',
      tex: String.raw`I_2 = I_1\,\dfrac{N_1}{N_2}`,
      symbolTex: 'I_2',
      unit: 'A',
      digits: 1,
      quantity: 'i',
      labelIT: 'La corrente scala al contrario della tensione',
    },
    {
      key: 'P2',
      tex: String.raw`V_1 I_1 = V_2 I_2`,
      symbolTex: 'P',
      unit: 'MW',
      scale: 1e-6,
      digits: 3,
      quantity: 'energy',
      labelIT: 'Conservazione della potenza (ideale)',
    },
    {
      key: 'I',
      tex: String.raw`I = \dfrac{P}{V_2}`,
      symbolTex: 'I',
      unit: 'A',
      digits: 1,
      quantity: 'i',
      labelIT: 'Corrente di linea',
    },
    {
      key: 'loss',
      tex: String.raw`P_J = R\,I^2 = \dfrac{R\,P^2}{V_2^{\,2}}`,
      symbolTex: 'P_J',
      unit: 'kW',
      scale: 1e-3,
      digits: 2,
      quantity: 'energy',
      labelIT: 'Perdita per effetto Joule',
    },
    {
      key: 'fraction',
      tex: String.raw`P_J / P`,
      symbolTex: 'P_J/P',
      unit: '%',
      scale: 100,
      digits: 3,
      quantity: 'energy',
      labelIT: 'Frazione della potenza persa in linea',
    },
  ]);

  const results = createResultsPanel(layout.controls);
  const chart = createComparisonChart(layout.plots);

  const recompute = (): void => {
    const r = computeTransmission(state);
    results.update(r);
    lastFactor = chart.update(r, state.P, state.Rline);
    formulas.update({
      V2: r.V2,
      I2: r.I2,
      P2: r.P2,
      I: r.line.I,
      loss: r.line.loss,
      fraction: r.line.fraction,
    });
    scene?.update(r, state.N1, state.N2);
  };

  const sliders: Slider[] = [];
  const sliderBox = el('div', { class: 'jt-sliders' });
  layout.controls.prepend(sliderBox);
  (Object.keys(params) as ParamKey[]).forEach((key) => {
    const s = createSlider({
      spec: params[key],
      id: `${ID}-${key}`,
      onInput: (v) => {
        state[key] = v;
        recompute();
        loop.stepOnce();
      },
    });
    sliders.push(s);
    sliderBox.append(s.element);
  });

  const loop = createLoop({
    step(dt) {
      t += dt;
    },
    render() {
      scene?.render(t);
    },
  });
  if (ctx.reducedMotion) loop.pause();

  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      Object.assign(state, defaultInputs());
      (Object.keys(params) as ParamKey[]).forEach((k, i) => sliders[i]?.set(params[k].default));
      t = 0;
      recompute();
      loop.stepOnce();
    },
  });

  const offTheme = onThemeChange((th) => scene?.setTheme(th));
  recompute();
  scene?.render(t);

  const unregisterDebug = registerDebugHook(ID, (): DebugApi => ({
    mounted,
    renderers: sceneCounters.renderers,
    geometries: sceneCounters.geometries,
    materials: sceneCounters.materials,
    info: scene?.info() ?? null,
    lossFactor: lastFactor,
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
      sliders.splice(0).forEach((s) => s.dispose());
      formulas.dispose();
      results.dispose();
      chart.dispose();
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
  titleIT: 'Trasformatore e perdite Joule',
  summaryIT:
    'Catena di trasporto centrale → elevatore → linea AT → abbassatore → utenze: con il trasformatore ideale la potenza si conserva, e alzando la tensione di 10 volte le perdite R·I² in linea calano di 100 volte.',
  theoryId: '08-trasformatore-trasporto-joule',
  mount: (host, ctx) => mountTransformer(host, ctx),
};

export default sim;
