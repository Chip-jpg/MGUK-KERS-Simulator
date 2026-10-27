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
  type Slider,
} from '../../ui';
import {
  Z_FAR,
  Z_NEAR,
  autoStep,
  clampZ,
  followStep,
  induction,
  initialAutoState,
  type AutoState,
  type Direction,
  type Induction,
  type Pole,
} from './model';
import { defaultParams, params, type LenzParams } from './params';
import { createLenzScene, liveResources, type LenzScene } from './scene';
import { describeStatus } from './status';
import './lenz.css';

export { params } from './params';
export type { LenzParams } from './params';

type Mode = 'auto' | 'manuale';

export const MODEL_NOTE_IT =
  'magnete come dipolo puntiforme sull’asse della bobina; flusso Φ = B̄·S con B̄ campo medio sulla sezione (equivale a B uniforme sulla sezione); bobina sottile; autoinduzione trascurata; moto del magnete imposto. La forza è calcolata come interazione dipolo–spira, ma la lunghezza delle frecce è qualitativa (scala logaritmica).';

/** Debug counters for the e2e leak check (only exposed with `?kersDebug` or in dev). */
const debug = { mounts: 0, disposes: 0, frames: 0 };

interface DebugWindow {
  __kersDebug?: Record<string, () => unknown>;
}

function exposeDebug(getScene: () => LenzScene | null): void {
  const enabled = import.meta.env.DEV || /[?&]kersDebug\b/.test(window.location.search);
  if (!enabled) return;
  const w = window as unknown as DebugWindow;
  w.__kersDebug ??= {};
  w.__kersDebug['lenz'] = () => ({
    ...debug,
    live: liveResources(),
    renderer: getScene()?.info() ?? null,
    canvases: document.querySelectorAll('.sim-scene canvas').length,
  });
}

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  debug.mounts += 1;
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const offs: Array<() => void> = [];
  const disposables: Disposable[] = [];

  // --- state -------------------------------------------------------------------
  const p: LenzParams = defaultParams();
  let pole: Pole = 'N';
  let direction: Direction = 'avvicina';
  let mode: Mode = 'auto';
  let auto: AutoState = initialAutoState(direction);
  let z = auto.z;
  let target = z;
  let resetHistory = true;
  let t = 0;
  let stepCount = 0;
  let animDt = 0;
  let ind: Induction = induction({ ...p, pole }, z, z, 1 / 240);

  // --- scene -------------------------------------------------------------------
  let scene: LenzScene | null = null;
  try {
    scene = createLenzScene(ctx.theme);
  } catch {
    layout.scene.append(
      el('p', { class: 'sim-placeholder', text: 'WebGL non disponibile: scena 3D disattivata.' }),
    );
  }
  exposeDebug(() => scene);
  const canvas = scene?.canvas ?? null;
  if (scene && canvas) {
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute(
      'aria-label',
      'Posizione del magnete: trascinalo, oppure usa le frecce ← → (Maiusc = passo lungo)',
    );
    canvas.setAttribute('aria-valuemin', String(Z_NEAR * 100));
    canvas.setAttribute('aria-valuemax', String(Z_FAR * 100));
    canvas.classList.add('lenz-canvas');
    layout.scene.prepend(canvas);
    const ro = new ResizeObserver(() => {
      scene?.resize(layout.scene.clientWidth, layout.scene.clientHeight);
      if (loop.isPaused()) renderFrame();
    });
    ro.observe(layout.scene);
    offs.push(() => ro.disconnect());
    scene.resize(layout.scene.clientWidth || 800, layout.scene.clientHeight || 450);
    offs.push(
      onThemeChange((th) => {
        scene?.setTheme(th);
        if (loop.isPaused()) renderFrame();
      }),
    );
  }

  // Status badge (accessible, inside the scene region) + overlay labels.
  const statusText = el('p', { class: 'lenz-status__main' });
  const statusSub = el('p', { class: 'lenz-status__sub' });
  const status = el('div', { class: 'lenz-status', attrs: { 'data-testid': 'lenz-status' } }, [
    statusText,
    statusSub,
  ]);
  layout.scene.append(status);
  const labels = {
    bMag: el('span', { class: 'lenz-label text-q-b', text: 'B magnete' }),
    bInd: el('span', { class: 'lenz-label lenz-label--soft text-q-b', text: 'B indotto' }),
    current: el('span', { class: 'lenz-label text-q-i', text: 'i' }),
    force: el('span', { class: 'lenz-label text-q-f', text: 'F' }),
    face: el('span', { class: 'lenz-label lenz-label--pole', text: '' }),
  };
  layout.sceneOverlay.append(...Object.values(labels));

  // --- controls ----------------------------------------------------------------
  const restartAuto = (): void => {
    auto = initialAutoState(direction);
    z = auto.z;
    target = z;
    resetHistory = true;
  };
  const poleSeg = createSegmented<Pole>({
    labelIT: 'Polo del magnete rivolto verso la bobina',
    options: [
      { value: 'N', labelIT: 'Polo N' },
      { value: 'S', labelIT: 'Polo S' },
    ],
    value: pole,
    onChange: (v) => {
      pole = v;
      resetHistory = true;
      if (mode === 'auto') restartAuto();
      if (loop.isPaused()) refreshStatic();
    },
  });
  const dirSeg = createSegmented<Direction>({
    labelIT: 'Moto del magnete',
    options: [
      { value: 'avvicina', labelIT: 'Avvicina' },
      { value: 'allontana', labelIT: 'Allontana' },
    ],
    value: direction,
    onChange: (v) => {
      direction = v;
      if (mode !== 'auto') modeSeg.set('auto', true);
      else restartAuto();
      if (loop.isPaused()) refreshStatic();
    },
  });
  const modeSeg = createSegmented<Mode>({
    labelIT: 'Modalità',
    options: [
      { value: 'auto', labelIT: 'Automatico' },
      { value: 'manuale', labelIT: 'Manuale (trascina)' },
    ],
    value: mode,
    onChange: (v) => {
      mode = v;
      if (v === 'auto') restartAuto();
      else target = z;
    },
  });
  disposables.push(poleSeg, dirSeg, modeSeg);
  layout.controls.append(poleSeg.element, dirSeg.element, modeSeg.element);

  const sliders: Slider[] = [];
  for (const key of Object.keys(params) as Array<keyof LenzParams>) {
    const s = createSlider({
      spec: params[key],
      id: `lenz-${key}`,
      onInput: (v) => {
        p[key] = v;
        if (key === 'a' || key === 'm') resetHistory = true; // reconfiguration, not motion
        if (loop.isPaused()) refreshStatic();
      },
      ...(key === 'v'
        ? {
            hintIT:
              'In modalità manuale è la velocità massima con cui il magnete segue il cursore.',
          }
        : {}),
    });
    sliders.push(s);
    layout.controls.append(s.element);
  }
  disposables.push(...sliders);

  // --- formulas & plots --------------------------------------------------------
  const formulas = createFormulaPanel(layout.formulas, [
    {
      key: 'z',
      tex: 'z',
      labelIT: 'Distanza del centro del magnete dalla bobina',
      unit: 'cm',
      scale: 100,
      digits: 1,
    },
    {
      key: 'B',
      tex: '\\bar B = \\dfrac{\\mu_0\\, m}{2\\pi\\,(z^2+a^2)^{3/2}}',
      labelIT: 'Campo medio del magnete sulla bobina (componente lungo n̂, verso il magnete)',
      unit: 'mT',
      scale: 1e3,
      digits: 3,
      quantity: 'b',
      symbolTex: '\\bar B',
    },
    {
      key: 'phi',
      tex: '\\Phi_B = \\bar B\\, S \\cos\\alpha,\\quad S = \\pi a^2',
      labelIT: 'Flusso attraverso una spira (α = 0)',
      unit: 'µWb',
      scale: 1e6,
      digits: 3,
      quantity: 'b',
      slide: 7,
      symbolTex: '\\Phi_B',
    },
    {
      key: 'emf',
      tex: '\\text{f.e.m.} = -N\\,\\dfrac{\\Delta\\Phi_B}{\\Delta t}',
      labelIT: 'Legge di Faraday-Neumann (Δt = passo di 1/240 s)',
      unit: 'mV',
      scale: 1e3,
      digits: 3,
      quantity: 'emf',
      slide: 8,
      symbolTex: '\\text{f.e.m.}',
    },
    {
      key: 'i',
      tex: 'i = \\dfrac{\\text{f.e.m.}}{R}',
      labelIT: 'Corrente indotta (+ = antioraria vista dal magnete)',
      unit: 'mA',
      scale: 1e3,
      digits: 3,
      quantity: 'i',
      slide: 9,
      symbolTex: 'i',
    },
    {
      key: 'Bind',
      tex: 'B_{\\text{ind}} = \\dfrac{\\mu_0 N\\, i}{2a}',
      labelIT: 'Campo indotto al centro della bobina: si oppone alla variazione di Φ (Lenz)',
      unit: 'µT',
      scale: 1e6,
      digits: 3,
      quantity: 'b',
      slide: 11,
      symbolTex: 'B_{\\text{ind}}',
    },
    {
      key: 'F',
      tex: 'F = N\\, i\\, \\dfrac{\\partial \\Phi_B}{\\partial z}',
      labelIT: 'Forza sul magnete (+ = repulsiva, − = attrattiva)',
      unit: 'µN',
      scale: 1e6,
      digits: 3,
      quantity: 'f',
      symbolTex: 'F',
    },
  ]);
  disposables.push(formulas);

  const plotCommon = { xLabelIT: 't', xUnit: 's', xWindow: 6, capacity: 600, height: 160 };
  const plotPhi = createPlot(layout.plots, {
    ...plotCommon,
    titleIT: 'Flusso Φ(t) attraverso una spira',
    series: [{ labelIT: 'Φ', unit: 'µWb', quantity: 'b' }],
    yLabelIT: 'µWb',
  });
  const plotEmf = createPlot(layout.plots, {
    ...plotCommon,
    titleIT: 'Forza elettromotrice f.e.m.(t)',
    series: [{ labelIT: 'f.e.m.', unit: 'mV', quantity: 'emf' }],
    yLabelIT: 'mV',
  });
  const plotI = createPlot(layout.plots, {
    ...plotCommon,
    titleIT: 'Corrente indotta i(t)',
    series: [{ labelIT: 'i', unit: 'mA', quantity: 'i' }],
    yLabelIT: 'mA',
  });
  disposables.push(plotPhi, plotEmf, plotI);

  // --- simulation --------------------------------------------------------------
  const coilParams = () => ({ pole, m: p.m, a: p.a, N: p.N, R: p.R });

  function step(dt: number): void {
    let z0 = z;
    if (mode === 'auto') {
      const r = autoStep(auto, direction, p.v, dt);
      auto = r.state;
      z = auto.z;
      if (r.jumped) z0 = z;
    } else {
      z = followStep(z, target, p.v, dt);
    }
    if (resetHistory) {
      z0 = z;
      resetHistory = false;
    }
    ind = induction(coilParams(), z0, z, dt);
    t += dt;
    animDt += dt;
    stepCount += 1;
    if (stepCount % 4 === 0) {
      plotPhi.push(t, ind.phi * 1e6);
      plotEmf.push(t, ind.emf * 1e3);
      plotI.push(t, ind.i * 1e3);
    }
  }

  /** Recompute the displayed state without advancing time (paused edits). */
  function refreshStatic(): void {
    ind = induction(coilParams(), z, z, 1 / 240);
    renderFrame();
  }

  let lastKey = '';
  function renderFrame(): void {
    debug.frames += 1;
    formulas.update({
      z: ind.z,
      B: ind.B,
      phi: ind.phi,
      emf: ind.emf,
      i: ind.i,
      Bind: ind.Bind,
      F: ind.F,
    });
    const st = describeStatus(ind);
    const key = `${st.main}|${st.sub}`;
    if (key !== lastKey) {
      lastKey = key;
      statusText.textContent = st.main;
      statusSub.textContent = st.sub;
      status.dataset['currentDir'] = ind.dir;
      status.dataset['facePole'] = ind.facePole ?? '';
      status.dataset['force'] = ind.force;
      status.dataset['pole'] = pole;
      status.dataset['motion'] = ind.v < 0 ? 'avvicina' : ind.v > 0 ? 'allontana' : 'fermo';
    }
    if (canvas) {
      canvas.setAttribute('aria-valuenow', (ind.z * 100).toFixed(1));
      canvas.setAttribute('aria-valuetext', `${ctx.formatIT(ind.z * 100, 1, 'cm')} dalla bobina`);
    }
    if (!scene) return;
    scene.render({
      z: ind.z,
      pole,
      a: p.a,
      B: ind.B,
      Bind: ind.Bind,
      sign: ind.sign,
      absI: Math.abs(ind.i),
      F: ind.F,
      animDt,
    });
    animDt = 0;
    const anchors = scene.anchors();
    const show: Record<keyof typeof labels, boolean> = {
      bMag: ind.B !== 0,
      bInd: ind.sign !== 0,
      current: ind.sign !== 0,
      force: ind.F !== 0,
      face: ind.facePole !== null,
    };
    labels.face.textContent = ind.facePole ? `faccia ${ind.facePole}` : '';
    for (const k of Object.keys(labels) as Array<keyof typeof labels>) {
      const a = anchors[k];
      const node = labels[k];
      node.hidden = !(show[k] && a.visible);
      node.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
    }
  }

  const loop = createLoop({ step, render: renderFrame }, { autoStart: !ctx.reducedMotion });
  if (ctx.reducedMotion) loop.pause();
  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      for (const s of sliders) s.reset();
      poleSeg.set('N');
      pole = 'N';
      dirSeg.set('avvicina');
      direction = 'avvicina';
      modeSeg.set('auto');
      mode = 'auto';
      restartAuto();
      t = 0;
      stepCount = 0;
      plotPhi.clear();
      plotEmf.clear();
      plotI.clear();
      refreshStatic();
    },
  });
  disposables.push(toolbar);

  // --- pointer drag + keyboard ---------------------------------------------------
  if (scene && canvas) {
    const sc = scene;
    let dragging = false;
    let grab = 0;
    const toManual = (): void => {
      if (mode !== 'manuale') modeSeg.set('manuale', true);
    };
    offs.push(
      on(canvas, 'pointerdown', (e) => {
        if (!sc.hitMagnet(e.clientX, e.clientY)) return;
        const x = sc.axisX(e.clientX, e.clientY);
        if (x === null) return;
        toManual();
        dragging = true;
        grab = x - z;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('is-dragging');
        e.preventDefault();
      }),
      on(canvas, 'pointermove', (e) => {
        if (!dragging) {
          canvas.classList.toggle('is-over', sc.hitMagnet(e.clientX, e.clientY));
          return;
        }
        const x = sc.axisX(e.clientX, e.clientY);
        if (x !== null) target = clampZ(x - grab);
      }),
      on(canvas, 'pointerup', (e) => {
        dragging = false;
        canvas.classList.remove('is-dragging');
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      }),
      on(canvas, 'keydown', (e) => {
        const big = e.shiftKey ? 5 : 1;
        let next: number | null = null;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = target - 0.01 * big;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = target + 0.01 * big;
        else if (e.key === 'Home') next = Z_NEAR;
        else if (e.key === 'End') next = Z_FAR;
        if (next === null) return;
        e.preventDefault();
        toManual();
        target = clampZ(next);
      }),
    );
  }

  renderFrame();

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      debug.disposes += 1;
      loop.dispose();
      offs.splice(0).forEach((off) => off());
      disposables.splice(0).forEach((d) => d.dispose());
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
    },
  };
}

function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  cb: (e: HTMLElementEventMap[K]) => void,
): () => void {
  target.addEventListener(type, cb as EventListener);
  return () => target.removeEventListener(type, cb as EventListener);
}

const sim: SimModule = {
  id: 'lenz',
  titleIT: 'Legge di Lenz',
  summaryIT:
    'Un magnete si avvicina o si allontana da una bobina: la corrente indotta crea un campo che si oppone alla variazione del flusso e una forza che si oppone al moto.',
  slideRefs: [2, 3, 4, 5, 6, 7, 8, 9, 11],
  theoryId: '04-lenz',
  mount,
};

export default sim;
