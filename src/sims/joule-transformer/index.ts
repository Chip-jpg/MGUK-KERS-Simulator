import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import { coreFluxPeak } from '../../physics';
import { createResetViewButton, snapshotRenderStats } from '../../render';
import {
  createFormulaPanel,
  createLoop,
  createSimLayout,
  createSimToolbar,
  createSlider,
  createToggle,
  el,
  formatIT,
  type Slider,
} from '../../ui';
import { computeTransmission, type TransmissionInputs, type TransmissionResult } from './model';
import { createComparisonChart, createResultsPanel, fmtSI } from './panel';
import { defaultInputs, params, type ParamKey } from './params';
import type { SceneInfo, TransformerScene } from './scene';
import {
  AC_HZ,
  AC_VISUAL_HZ,
  LINE,
  LINE_C,
  LINE_HA,
  PARTICLE_SPEED_PER_AMP,
  PARTICLE_VMAX,
  SAG_DRAW,
  THERMAL_SPEEDUP,
  T_LIMIT_C,
  T_SCALE_C,
  WINDOW_W,
  heatPerMetre,
  sceneStats,
  litWindows,
  sagAt,
} from './visual';
import './style.css';

export { params } from './params';

const it = (x: number, d = 0): string => formatIT(x, d);

/** Assumptions of the model and of the scene's visual scales. */
export const MODEL_NOTE_IT =
  'trasformatore ideale (nessuna perdita, accoppiamento perfetto), linea puramente resistiva, valori efficaci. ' +
  `Nella scena (scale illustrative, non in scala): spire N₁ : N₂ in proporzione; sezione del filo ∝ corrente (stessa densità di corrente); ` +
  `flusso nel nucleo Φₘₐₓ = √2·V/(2π·f·N) con f = ${AC_HZ} Hz, linee ∝ Φₘₐₓ; corrente alternata mostrata ${it(AC_HZ / AC_VISUAL_HZ)} volte più lenta, ` +
  `particelle con velocità ∝ corrente istantanea (${it(PARTICLE_SPEED_PER_AMP, 3)} unità/s per A, massimo ${it(PARTICLE_VMAX, 1)} unità/s). ` +
  `Conduttore di linea: alluminio Ø ${it(LINE.diameter * 1000)} mm, ${it(LINE.massPerMetre, 1)} kg/m, linea lunga ${it(LINE.length / 1000)} km (andata + ritorno); ` +
  `temperatura da un modello termico concentrato per metro C'·dT/dt = R'·I² − h·π·D·(T − T₀), T₀ = 20 °C, con h = ${it(LINE.h)} W/(m²·K), tempo termico accelerato ${it(THERMAL_SPEEDUP)}×; ` +
  `freccia della campata da ${it(LINE.span)} m calcolata con la catenaria (tiro ${it(LINE.tension / 1000)} kN a 20 °C, dilatazione α = 23·10⁻⁶ /K, allungamento elastico trascurato), disegnata a ${it(SAG_DRAW, 1)} unità per metro; ` +
  `una finestra accesa ogni ${it(WINDOW_W / 1e6, 1)} MW consegnati.`;

const ID = 'joule-transformer';

export interface MountOptions {
  /** Create the Three.js scene (false in jsdom tests: no WebGL). Default true. */
  scene?: boolean;
}

/** Live mounts (leak check via the debug hook). */
let mounted = 0;
let mountsTotal = 0;

interface DebugApi {
  mounted: number;
  mountsTotal: number;
  tier: string | null;
  scene: SceneInfo | null;
  sceneStats: Record<string, number>;
  foundation: Record<string, number>;
  lossFactor: number;
  lineT: number;
  sag: number;
  thermal: boolean;
  tank: boolean;
}

/** Mount implementation; `SimModule.mount` calls it with defaults. */
export function mountTransformer(
  host: HTMLElement,
  ctx: AppContext,
  options: MountOptions = {},
): Disposable {
  mounted++;
  mountsTotal++;
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const state: TransmissionInputs = defaultInputs();
  let t = 0;
  let lastFactor = Number.NaN;
  let r: TransmissionResult = computeTransmission(state);
  let lineT: number = LINE.Tamb;
  let thermal = false;
  let tank = true;
  let disposed = false;
  const offs: Array<() => void> = [];

  // --- scene overlay: legend + thermal scale ----------------------------------------------
  const thermalNow = el('span', { class: 'jt-thermal__now' });
  const thermalLegend = el(
    'div',
    { class: 'jt-thermal', attrs: { hidden: true, 'data-testid': 'thermal-legend' } },
    [
      el('span', { class: 'jt-thermal__title', text: 'Temperatura del conduttore (falsi colori)' }),
      el('span', { class: 'jt-thermal__bar', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'jt-thermal__ticks' }, [
        el('span', { text: `${T_SCALE_C[0]} °C` }),
        el('span', { text: `${T_LIMIT_C} °C limite tipico` }),
        el('span', { text: `${T_SCALE_C[1]} °C` }),
      ]),
      thermalNow,
    ],
  );
  const legend = el('div', { class: 'jt-legend' }, [
    el('span', {
      class: 'q-i',
      text: `Corrente: particelle, velocità ∝ i istantanea (${it(PARTICLE_SPEED_PER_AMP, 3)} unità/s per A; 50 Hz rallentati ${it(AC_HZ / AC_VISUAL_HZ)}×)`,
    }),
    el('span', { class: 'q-b', text: 'Flusso nel nucleo: numero di linee ∝ Φₘₐₓ = √2·V/(2π·f·N)' }),
    el('span', {
      class: 'q-energy',
      text: `Finestre accese: 1 ogni ${it(WINDOW_W / 1e6, 1)} MW consegnati`,
    }),
    el('span', { class: 'q-neutral', text: 'Freccia: catenaria calcolata' }),
  ]);
  layout.sceneOverlay.append(legend, thermalLegend);

  let scene: TransformerScene | null = null;
  if (options.scene !== false) {
    void import('./scene')
      .then(({ createTransformerScene }) => {
        if (disposed) return;
        try {
          scene = createTransformerScene(layout.scene, layout.sceneOverlay, ctx);
          const resetView = createResetViewButton(scene.stage);
          layout.toolbar.append(resetView.element);
          offs.push(() => resetView.dispose());
          pushScene();
          scene.prewarm();
          scene.render();
        } catch (e) {
          scene = null;
          console.warn('joule-transformer: WebGL non disponibile', e);
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
    {
      key: 'phi',
      tex: String.raw`\hat\Phi = \dfrac{\sqrt2\,V_1}{2\pi f N_1}`,
      symbolTex: '\\hat\\Phi',
      unit: 'Wb',
      digits: 3,
      quantity: 'b',
      labelIT: 'Flusso di picco nel nucleo (f = 50 Hz, illustrativo)',
    },
  ]);

  const results = createResultsPanel(layout.controls);
  const chart = createComparisonChart(layout.plots);

  const pushScene = (): void => {
    if (!scene) return;
    const q = heatPerMetre(state.Rline, r.line.I);
    const phiUp = coreFluxPeak(state.V1, AC_HZ, state.N1);
    const phiDown = coreFluxPeak(r.Vreceived, AC_HZ, state.N2);
    const Tc = lineT - 273.15;
    const sag = sagAt(lineT);
    scene.update({
      N1: state.N1,
      N2: state.N2,
      I1: r.I1,
      Iline: r.line.I,
      Iout: r.Iout,
      phiUp,
      phiDown,
      T: lineT,
      sag,
      heatPerMetre: q,
      lit: litWindows(r.delivered),
      t,
      thermal,
      tank,
      texts: {
        plant: `Centrale · V₁ = ${fmtSI(state.V1, 'V')} · I₁ = ${fmtSI(r.I1, 'A')}`,
        stepUp: `Elevatore N₁ : N₂ = ${it(state.N1)} : ${it(state.N2)}`,
        core: `Φₘₐₓ = ${it(phiUp, phiUp < 0.1 ? 3 : 2)} Wb`,
        line: `Linea AT · V₂ = ${fmtSI(r.V2, 'V')} · I = ${fmtSI(r.line.I, 'A')}`,
        loss: `Joule R·I² = ${fmtSI(r.line.loss, 'W')} · ${it(q, q < 10 ? 2 : 1)} W/m · ${it(Tc, 1)} °C`,
        sag: `freccia ${it(sag, 1)} m`,
        stepDown: `Abbassatore N₂ : N₁ = ${it(state.N2)} : ${it(state.N1)}`,
        town: `Utenze ${fmtSI(r.delivered, 'W')}`,
      },
    });
    thermalNow.textContent = `Ora: ${it(Tc, 1)} °C (calore ${it(q, q < 10 ? 2 : 1)} W/m)`;
  };

  const recompute = (): void => {
    r = computeTransmission(state);
    results.update(r);
    lastFactor = chart.update(r, state.P, state.Rline);
    formulas.update({
      V2: r.V2,
      I2: r.I2,
      P2: r.P2,
      I: r.line.I,
      loss: r.line.loss,
      fraction: r.line.fraction,
      phi: coreFluxPeak(state.V1, AC_HZ, state.N1),
    });
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
  const thermalToggle = createToggle({
    labelIT: 'Mostra temperatura del conduttore',
    onChange: (b) => {
      thermal = b;
      thermalLegend.hidden = !b;
      loop.stepOnce();
    },
  });
  const tankToggle = createToggle({
    labelIT: 'Mostra cassa dell’olio (spaccato)',
    checked: true,
    onChange: (b) => {
      tank = b;
      loop.stepOnce();
    },
  });
  sliderBox.append(el('div', { class: 'jt-toggles' }, [thermalToggle.element, tankToggle.element]));

  const loop = createLoop({
    step(dt) {
      t += dt;
      // line conductor: lumped thermal model per metre, thermal time accelerated
      const q = heatPerMetre(state.Rline, r.valid ? r.line.I : 0);
      const k = Math.exp((-LINE_HA * dt * THERMAL_SPEEDUP) / LINE_C);
      const Tinf = LINE.Tamb + q / LINE_HA;
      lineT = Tinf + (lineT - Tinf) * k;
    },
    render() {
      pushScene();
      scene?.render();
    },
  });
  if (ctx.reducedMotion) loop.pause();

  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      Object.assign(state, defaultInputs());
      (Object.keys(params) as ParamKey[]).forEach((k, i) => sliders[i]?.set(params[k].default));
      t = 0;
      lineT = LINE.Tamb;
      recompute();
      loop.stepOnce();
    },
  });

  recompute();

  const unregisterDebug = registerDebugHook(ID, (): DebugApi => ({
    mounted,
    mountsTotal,
    tier: scene?.stage.tier ?? null,
    scene: scene?.info() ?? null,
    sceneStats: { ...sceneStats },
    foundation: { ...snapshotRenderStats() },
    lossFactor: lastFactor,
    lineT,
    sag: sagAt(lineT),
    thermal,
    tank,
  }));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      mounted--;
      loop.dispose();
      for (const off of offs) off();
      toolbar.dispose();
      sliders.splice(0).forEach((s) => s.dispose());
      thermalToggle.dispose();
      tankToggle.dispose();
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
