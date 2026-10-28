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
  createToggle,
  el,
  formatIT,
  onThemeChange,
  type FormulaItem,
  type FormulaPanel,
  type Slider,
} from '../../ui';
import {
  analyticAxis,
  coilSetup,
  idealInductance,
  idealSolenoidAxis,
  referenceCentre,
  relDiff,
  type FieldRequest,
} from './model';
import { singularTurnsScale } from '../shared/turns';
import {
  DEFAULT_GEOMETRY,
  GEOMETRY_OPTIONS,
  defaultParams,
  params,
  type BiotParams,
  type Geometry,
  type ParamKey,
} from './params';
import { createFieldRunner, type FieldMessage } from './runner';
import { createBiotScene, sceneCounters, type BiotScene } from './scene';
import './style.css';

export { params } from './params';

const ID = 'field-biot-savart';

export const MODEL_NOTE_IT =
  'conduttore filiforme, corrente stazionaria, nessun materiale ferromagnetico; linee di campo calcolate numericamente (RK4).';

/** Debounce of the field recomputation after a parameter change [ms]. */
const RECOMPUTE_DELAY_MS = 120;

export interface MountOptions {
  /** Create the Three.js scene (false in jsdom tests: no WebGL). Default true. */
  scene?: boolean;
  /** Use a Web Worker when available (false forces the in-thread fallback). Default true. */
  worker?: boolean;
}

/** Live workers across mounts (leak check). */
export const workerCounter = { alive: 0 };
let mounted = 0;
/** One live mount per host (QA-030): a second mount() disposes the first (no second Worker). */
const mountedHosts = new WeakMap<HTMLElement, Disposable>();

interface FieldService extends Disposable {
  readonly kind: 'worker' | 'main-thread';
  request(job: number, req: FieldRequest): void;
}

function createFieldService(
  onMessage: (m: FieldMessage) => void,
  useWorker: boolean,
): FieldService {
  if (useWorker && typeof Worker !== 'undefined') {
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      workerCounter.alive++;
      w.addEventListener('message', (e: MessageEvent<FieldMessage>) => onMessage(e.data));
      w.addEventListener('error', (e) => console.error('field-biot-savart worker:', e.message));
      let alive = true;
      return {
        kind: 'worker',
        request: (job, request) => w.postMessage({ job, request }),
        dispose() {
          if (!alive) return;
          alive = false;
          w.terminate();
          workerCounter.alive--;
        },
      };
    } catch {
      // fall through to the in-thread runner
    }
  }
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const runner = createFieldRunner(
    (m) => onMessage(m),
    (cb) => {
      const id = setTimeout(() => {
        timers.delete(id);
        cb();
      }, 0);
      timers.add(id);
    },
  );
  return {
    kind: 'main-thread',
    request: (job, request) => runner.run(job, request),
    dispose() {
      runner.cancel();
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

const GEOMETRY_TEX: Record<Geometry, { tex: string; labelIT: string; refIT: string }> = {
  loop: {
    tex: String.raw`B_{\text{rif}} = \dfrac{\mu_0 N I}{2R}`,
    labelIT: 'Centro di N spire circolari coincidenti (formula analitica)',
    refIT: 'Formula analitica μ₀NI/(2R)',
  },
  helmholtz: {
    tex: String.raw`B_{\text{rif}} = \left(\tfrac{4}{5}\right)^{3/2} \dfrac{\mu_0 N I}{R}`,
    labelIT: 'Centro di due bobine coassiali a distanza R (formula analitica)',
    refIT: 'Formula analitica ≈ 0,716·μ₀NI/R',
  },
  solenoid: {
    tex: String.raw`B_{\text{rif}} = \mu_0\,\dfrac{N I}{l}`,
    labelIT: 'Solenoide ideale (infinitamente lungo): B uniforme dentro, nullo fuori',
    refIT: 'Solenoide ideale μ₀NI/l',
  },
};

function formulaItems(g: Geometry): FormulaItem[] {
  const ref = GEOMETRY_TEX[g];
  const items: FormulaItem[] = [
    {
      key: 'segment',
      tex: String.raw`\Delta\vec B = \dfrac{\mu_0 I}{4\pi}\,\dfrac{\Delta\vec l \times \hat r}{r^2}`,
      labelIT:
        'Legge di Biot-Savart: contributo di un tratto di filo Δl (sommato su tutti i tratti)',
    },
    {
      key: 'Bnum',
      tex: String.raw`B_{\text{num}} = \Big|\sum_i \Delta\vec B_i\Big|`,
      symbolTex: String.raw`B_{\text{num}}`,
      unit: 'mT',
      scale: 1e3,
      digits: 4,
      quantity: 'b',
      labelIT: 'Campo al centro calcolato con Biot-Savart (bobina reale)',
    },
    {
      key: 'Bref',
      tex: ref.tex,
      symbolTex: String.raw`B_{\text{rif}}`,
      unit: 'mT',
      scale: 1e3,
      digits: 4,
      quantity: 'b',
      labelIT: ref.labelIT,
      ...(g === 'solenoid' ? { slide: 14 } : {}),
    },
    {
      key: 'diff',
      tex: String.raw`\dfrac{B_{\text{num}} - B_{\text{rif}}}{B_{\text{rif}}}`,
      symbolTex: String.raw`\Delta`,
      unit: '%',
      scale: 100,
      digits: 2,
      labelIT: 'Scostamento della bobina reale dal modello di riferimento',
    },
    {
      key: 'phi',
      tex: String.raw`\Phi_B = B\,S\,\cos\alpha`,
      symbolTex: String.raw`\Phi_B`,
      unit: 'µWb',
      scale: 1e6,
      digits: 3,
      quantity: 'b',
      slide: 7,
      labelIT:
        'Flusso attraverso una spira al centro (S = πR², α = 0), se B fosse uniforme sulla sezione',
    },
  ];
  if (g === 'solenoid') {
    items.push({
      key: 'L',
      tex: String.raw`L = \mu_0\,\dfrac{N^2 S}{l}`,
      symbolTex: 'L',
      unit: 'µH',
      scale: 1e6,
      digits: 2,
      slide: 14,
      labelIT: 'Induttanza del solenoide ideale (S = πR²), per confronto',
    });
  }
  return items;
}

export function mountBiot(
  host: HTMLElement,
  ctx: AppContext,
  options: MountOptions = {},
): Disposable {
  mountedHosts.get(host)?.dispose(); // idempotent: a second mount replaces the first
  mounted++;
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  const p: BiotParams = defaultParams();
  let geometry: Geometry = DEFAULT_GEOMETRY;
  let showIdeal = false;
  let showArrows = false;
  let time = 0;
  let disposed = false;

  let scene: BiotScene | null = null;
  if (options.scene !== false) {
    try {
      scene = createBiotScene(layout.scene, ctx.theme, ctx.reducedMotion);
    } catch {
      scene = null;
      layout.scene.append(
        el('p', { class: 'sim-placeholder', text: 'WebGL non disponibile: scena 3D disattivata.' }),
      );
    }
  }

  // --- controls ---------------------------------------------------------------
  const geometryCtl = createSegmented<Geometry>({
    labelIT: 'Geometria della bobina',
    options: GEOMETRY_OPTIONS,
    value: geometry,
    onChange: (g) => {
      geometry = g;
      geometryChanged();
    },
  });
  const sliders = new Map<ParamKey, Slider>();
  const mk = (key: ParamKey, hintIT?: string): Slider => {
    const sl = createSlider({
      spec: params[key],
      id: `${ID}-${key}`,
      ...(hintIT ? { hintIT } : {}),
      onInput: (v) => {
        p[key] = v;
        paramsChanged();
      },
    });
    singularTurnsScale(sl.element); // "1 spira", not "1 spire" (QA-025)
    sliders.set(key, sl);
    return sl;
  };
  const idealToggle = createToggle({
    labelIT: 'Confronta con il solenoide ideale',
    onChange: (b) => {
      showIdeal = b;
      scene?.setShowIdeal(b && geometry === 'solenoid');
      updateReadouts();
      updatePlot();
      redraw();
    },
  });
  const arrowsToggle = createToggle({
    labelIT: 'Mostra frecce del campo (piano della figura)',
    onChange: (b) => {
      showArrows = b;
      scene?.setShowArrows(b);
      redraw();
    },
  });

  const out = (testid: string): HTMLElement =>
    el('strong', { class: 'bs-readout__value', attrs: { 'data-testid': testid } });
  const bCentreNode = out('b-centre');
  const bRefNode = out('b-ref');
  const diffNode = out('b-diff');
  const lNode = out('inductance');
  const refLabel = el('span', { class: 'bs-readout__label' });
  const lRow = el('div', { class: 'bs-readout__row' }, [
    el('span', { class: 'bs-readout__label', text: 'L = μ₀N²S/l (solenoide ideale)' }),
    lNode,
  ]);
  const readouts = el('div', { class: 'bs-readout', attrs: { 'aria-live': 'polite' } }, [
    el('div', { class: 'bs-readout__row' }, [
      el('span', { class: 'bs-readout__label', text: 'B al centro (Biot-Savart)' }),
      bCentreNode,
    ]),
    el('div', { class: 'bs-readout__row' }, [refLabel, bRefNode]),
    el('div', { class: 'bs-readout__row' }, [
      el('span', { class: 'bs-readout__label', text: 'Differenza percentuale' }),
      diffNode,
    ]),
    lRow,
  ]);
  const status = el('p', {
    class: 'bs-status',
    attrs: { 'data-testid': 'field-status', role: 'status' },
  });
  const legend = el('p', {
    class: 'bs-legend',
    text: 'Linee blu: linee di B calcolate sulla bobina reale; i tratti scorrono nel verso di B, più veloci dove |B| è maggiore. Cono rosso: verso della corrente.',
  });

  const box = el('div', { class: 'bs-controls' }, [
    geometryCtl.element,
    mk('I').element,
    mk('N').element,
    mk('R').element,
    mk('l', 'Solo per il solenoide').element,
    mk('lines').element,
    idealToggle.element,
    arrowsToggle.element,
    readouts,
    status,
    legend,
  ]);
  layout.controls.append(box);

  let formulas: FormulaPanel = createFormulaPanel(layout.formulas, formulaItems(geometry));

  // --- plot -------------------------------------------------------------------
  const plot = createPlot(layout.plots, {
    titleIT: 'Campo sull’asse Bz(z): bobina reale (Biot-Savart) e modelli analitici',
    xLabelIT: 'z',
    xUnit: 'cm',
    yLabelIT: 'Bz [mT]',
    capacity: 200,
    height: 240,
    series: [
      { labelIT: 'Bz numerico (Biot-Savart)', unit: 'mT', quantity: 'b', digits: 4 },
      {
        labelIT: 'Bz analitico (spire sottili / strato di corrente)',
        unit: 'mT',
        quantity: 'neutral',
        dash: [6, 4],
        width: 1.5,
        digits: 4,
      },
      {
        labelIT: 'Solenoide ideale μ₀NI/l',
        unit: 'mT',
        quantity: 'accent',
        width: 1.5,
        digits: 4,
      },
    ],
  });
  const plotNote = el('p', { class: 'bs-plot-note', attrs: { 'data-testid': 'plot-note' } });
  plot.element.append(plotNote);

  // --- state from the field service ----------------------------------------------
  const req = (): FieldRequest => ({ ...p, geometry });
  let current: FieldRequest = req();
  let job = 0;
  let lineCount = 0;
  let linesDone = 0;
  let lastJobMs = 0;
  let busy = false;
  let profile: { z: Float64Array; bz: Float64Array; centre: [number, number, number] } | null =
    null;
  let profileReq: FieldRequest | null = null;
  let jobReq: FieldRequest = current;
  let maxMainThreadMs = 0;
  let bRef = 0;

  const service = createFieldService(onField, options.worker !== false);

  function onField(m: FieldMessage): void {
    if (disposed || m.job !== job) return;
    const t0 = performance.now();
    if (m.type === 'profile') {
      profile = { z: m.z, bz: m.bz, centre: m.centre };
      profileReq = jobReq;
      bRef = Math.hypot(...m.centre);
      lineCount = m.lineCount;
      linesDone = 0;
      scene?.clearLines();
      scene?.setArrows(m.arrows, m.arrowCount, bRef);
      updateReadouts();
      updatePlot();
    } else if (m.type === 'line') {
      scene?.addLine(m.points, m.magnitude, m.phase, bRef);
      linesDone++;
    } else {
      lastJobMs = m.ms;
      busy = false;
    }
    updateStatus();
    redraw();
    maxMainThreadMs = Math.max(maxMainThreadMs, performance.now() - t0);
  }

  function updateStatus(): void {
    const where = service.kind === 'worker' ? 'Web Worker' : 'thread principale';
    status.textContent = busy
      ? `Calcolo delle linee di campo (${where}): ${linesDone}/${lineCount || '…'}`
      : `Linee di campo: ${linesDone}/${lineCount} calcolate (${where}, ${formatIT(lastJobMs / 1000, 2, 's')})`;
  }

  function updateReadouts(): void {
    const r = current;
    const ref = referenceCentre(r);
    const fresh = profile !== null && profileReq === r;
    const bNum = fresh && profile ? Math.hypot(...profile.centre) : Number.NaN;
    refLabel.textContent = GEOMETRY_TEX[r.geometry].refIT;
    bCentreNode.textContent = fresh ? formatIT(bNum * 1e3, 4, 'mT') : 'calcolo…';
    bRefNode.textContent = formatIT(ref * 1e3, 4, 'mT');
    const d = relDiff(bNum, ref);
    diffNode.textContent = fresh ? formatIT(d * 100, 2, '%') : '—';
    const L = idealInductance(r);
    lRow.hidden = r.geometry !== 'solenoid';
    lNode.textContent = formatIT(L * 1e6, 2, 'µH');
    formulas.update({
      Bnum: bNum,
      Bref: ref,
      diff: fresh ? d : Number.NaN,
      phi: (fresh ? bNum : Number.NaN) * Math.PI * r.R * r.R,
      L,
    });
  }

  function updatePlot(): void {
    const r = current;
    if (!profile || profileReq !== r) return;
    const xs: number[] = [];
    const num: number[] = [];
    const ana: number[] = [];
    const ideal: number[] = [];
    const withIdeal = showIdeal && r.geometry === 'solenoid';
    profile.z.forEach((z, k) => {
      xs.push(z * 100);
      num.push((profile?.bz[k] ?? Number.NaN) * 1e3);
      ana.push(analyticAxis(r, z) * 1e3);
      ideal.push(withIdeal ? idealSolenoidAxis(r, z) * 1e3 : Number.NaN);
    });
    plot.setData(xs, num, ana, ideal);
    const centre = analyticAxis(r, 0);
    const ends = r.geometry === 'solenoid' ? analyticAxis(r, r.l / 2) : Number.NaN;
    plotNote.textContent =
      r.geometry === 'solenoid'
        ? `Agli estremi (z = ±l/2) il campo scende a ${formatIT((ends / centre) * 100, 0, '%')} del valore al centro; fuori dal solenoide non è nullo come nel modello ideale.${withIdeal ? '' : ' Attiva «Confronta con il solenoide ideale» per vedere il gradino μ₀NI/l.'}`
        : r.geometry === 'loop'
          ? 'Una spira non produce un campo uniforme: Bz è massimo al centro e decresce come 1/z³ lontano dalla spira.'
          : 'Con distanza tra le bobine pari a R il campo al centro è molto uniforme (zona piatta della curva).';
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCompute(delay: number): void {
    if (timer !== null) clearTimeout(timer);
    // New job id now: messages of the job in flight are ignored from here on.
    job++;
    const myJob = job;
    const r = current;
    jobReq = r;
    busy = true;
    linesDone = 0;
    lineCount = 0;
    updateStatus();
    timer = setTimeout(() => {
      timer = null;
      service.request(myJob, r);
    }, delay);
  }

  function rebuildCoil(): void {
    scene?.setCoil(coilSetup(current), current.R, current.l, current.N);
    scene?.setShowIdeal(showIdeal && geometry === 'solenoid');
    scene?.clearLines();
  }

  function paramsChanged(): void {
    current = req();
    rebuildCoil();
    updateReadouts();
    scheduleCompute(RECOMPUTE_DELAY_MS);
    redraw();
  }

  function geometryChanged(): void {
    const sol = geometry === 'solenoid';
    sliders.get('l')?.setDisabled(!sol);
    const input = idealToggle.element.querySelector('input');
    if (input) input.disabled = !sol;
    formulas.dispose();
    formulas = createFormulaPanel(layout.formulas, formulaItems(geometry));
    paramsChanged();
  }

  // --- loop: only the dash flow is animated (the field is static) ------------------
  const loop = createLoop({
    step(dt) {
      time += dt;
    },
    render() {
      scene?.render(time * 1.2);
    },
  });
  if (ctx.reducedMotion) loop.pause();

  // While the loop runs it draws every frame; when paused, coalesce redraws into one
  // animation frame (never render inside a worker-message handler).
  let frame: number | null = null;
  function redraw(): void {
    if (!scene || frame !== null || !loop.isPaused()) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      scene?.render(time * 1.2);
    });
  }

  const toolbar = createSimToolbar(layout.toolbar, {
    loop,
    onReset: () => {
      Object.assign(p, defaultParams());
      for (const [k, sl] of sliders) sl.set(params[k].default);
      idealToggle.set(false);
      arrowsToggle.set(false);
      showIdeal = false;
      showArrows = false;
      scene?.setShowArrows(false);
      geometryCtl.set(DEFAULT_GEOMETRY);
      geometry = DEFAULT_GEOMETRY;
      geometryChanged();
    },
  });

  const offTheme = onThemeChange((th) => {
    scene?.setTheme(th);
    redraw();
  });

  geometryChanged();
  scheduleCompute(0);

  const unregisterDebug = registerDebugHook(ID, () => ({
    mounted,
    workers: workerCounter.alive,
    service: service.kind,
    renderers: sceneCounters.renderers,
    geometries: sceneCounters.geometries,
    materials: sceneCounters.materials,
    info: scene?.info() ?? null,
    geometry,
    busy,
    job,
    lineCount,
    linesDone,
    lastJobMs,
    maxMainThreadMs,
    bCentre: profile && profileReq === current ? Math.hypot(...profile.centre) : null,
    bRef: referenceCentre(current),
    showArrows,
  }));

  const handle: Disposable = {
    dispose() {
      if (disposed) return;
      disposed = true;
      mounted--;
      if (timer !== null) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      service.dispose();
      loop.dispose();
      offTheme();
      toolbar.dispose();
      geometryCtl.dispose();
      idealToggle.dispose();
      arrowsToggle.dispose();
      for (const sl of sliders.values()) sl.dispose();
      sliders.clear();
      formulas.dispose();
      plot.dispose();
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
      unregisterDebug();
      if (mountedHosts.get(host) === handle) mountedHosts.delete(host);
    },
  };
  mountedHosts.set(host, handle);
  return handle;
}

const sim: SimModule = {
  id: ID,
  titleIT: 'Campo magnetico di bobine reali (Biot-Savart)',
  summaryIT:
    'Approfondimento (Fase 4): linee di campo calcolate con la legge di Biot-Savart per una spira, un solenoide e le bobine di Helmholtz. Mostra quando il campo uniforme B = μ₀NI/l delle slide è una buona approssimazione e dove la bobina reale se ne discosta.',
  slideRefs: [7, 14],
  theoryId: '15-campo-biot-savart',
  mount: (host, ctx) => mountBiot(host, ctx),
};

export default sim;
