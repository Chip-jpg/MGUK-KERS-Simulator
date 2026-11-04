/**
 * Simulator `mguk-teardown` — "MGU-K in frenata: spaccato 3D".
 *
 * One input (the braking phase 0..1) drives every visual through `brakingStateAt` (model.ts):
 * the scene and the panel only display its readouts, they never recompute physics.
 */
import { registerDebugHook } from '../../core/debug';
import type { AppContext, Disposable, SimModule } from '../../core/types';
import { createResetViewButton } from '../../render';
import { createLoop, createSimLayout, el } from '../../ui';
import { PRESETS } from '../kers-braking/model';
import { brakingStateAt, type BrakingState, type MgukEra } from './model';
import { createTeardownPanel } from './panel';
import { createTeardownStage, type PartId, type TeardownStage } from './stage';
import { createTour } from './tour';
import './style.css';

export const MODEL_NOTE_IT =
  'dimensioni reali ma illustrative (da massa minima 7 kg e giri massimi 50 000 giri/min: FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3; misure interne ipotizzate), nella realtà l’MGU-K ha un rapporto fisso con l’albero motore (TR25 Art. 5.3.3; FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.18.2): i suoi giri seguono quelli del motore e la marcia inserita; qui una semplificazione didattica a marcia unica associa velocità del veicolo e giri del rotore (rapporti non pubblici), tensione indotta e corrente di una macchina equivalente a magneti permanenti (EMF = Kₑ·ω), batteria virtuale senza perdite aggiuntive. Un solo ingresso, la fase della frenata, comanda rotore, ingranaggi, ruota, flusso di energia (nastro viola ∝ P/Pₘₐₓ, acceso solo con P > 0) e livello di carica. La rotazione è mostrata 100 volte più lenta del reale per evitare l’aliasing a 50 000 giri/min.';

/** Pause at the end of the event before the playback restarts [s]. */
const END_HOLD = 1.5;

interface TeardownDebug {
  liveMounts: number;
  scene: () => ReturnType<TeardownStage['info']> | null;
  angle: () => number;
  phase: () => number;
  seek: (phase: number) => void;
}
let liveMounts = 0;

function mount(host: HTMLElement, ctx: AppContext): Disposable {
  const layout = createSimLayout(host, { modelNoteIT: MODEL_NOTE_IT });
  let era: MgukEra = '2025';
  let params = { ...PRESETS.find((p) => p.id === era)!.values };
  // The 350 kW event needs more battery headroom: start 2026 at 25% SoC.
  const initialSoc = () => (era === '2026' ? 0.25 : undefined);
  let phase = 0;
  let hold = 0;
  let playing = !ctx.reducedMotion;
  let pendingDt = 0;
  let state: BrakingState = brakingStateAt(0, params, initialSoc(), era);

  let scene: TeardownStage | null = null;
  try {
    scene = createTeardownStage(layout.scene, layout.sceneOverlay, ctx, {
      pMax: params.Pmax * 1e3,
    });
  } catch {
    layout.scene.append(
      el('p', { class: 'sim-placeholder', text: 'Grafica 3D non disponibile (WebGL).' }),
    );
  }

  const panel = createTeardownPanel(layout.controls, {
    formatIT: ctx.formatIT,
    playing,
    initialEra: era,
    onEra: (nextEra) => {
      era = nextEra;
      params = { ...PRESETS.find((p) => p.id === era)!.values };
      scene?.setPMax(params.Pmax * 1e3);
      draw(0);
    },
    onPhase: (p) => {
      phase = p;
      hold = 0;
      pause();
      draw(0);
    },
    onPlayToggle: (p) => {
      playing = p;
      if (p && phase >= 1) phase = 0;
    },
    onHousing: (m) => {
      scene?.setHousing(m);
      draw(0);
    },
    onView: (v) => {
      tour.stop();
      scene?.setView(v);
      panel.setFocus(null);
    },
    onFocus: (id) => {
      tour.stop();
      focusPart(id);
    },
    onTour: (on) => {
      if (on) tour.start();
      else tour.stop();
    },
  });
  function focusPart(id: PartId | null): void {
    scene?.focusPart(id);
    panel.setFocus(id);
  }
  const tour = createTour({
    onStep: focusPart,
    onState: (on) => panel.setTour(on),
  });
  // Any direct manipulation of the scene (drag, wheel, touch, keys) hands control back.
  const stopTour = (): void => tour.stop();
  const sceneEl = layout.scene;
  const offInput = scene ? [scene.stage.controls] : [];
  for (const c of offInput) c.addEventListener('start', stopTour);
  for (const t of ['wheel', 'pointerdown', 'keydown'] as const) {
    sceneEl.addEventListener(t, stopTour, { passive: true });
  }
  function pause(): void {
    playing = false;
    panel.setPlaying(false);
  }

  const resetView = scene ? createResetViewButton(scene.stage) : null;
  if (resetView) layout.toolbar.append(resetView.element);

  function draw(dt: number): void {
    state = brakingStateAt(phase, params, initialSoc(), era);
    scene?.update(state, dt);
    scene?.render();
    panel.update(state, phase);
  }

  const loop = createLoop(
    {
      step(dt) {
        pendingDt += dt;
        if (!playing) return;
        if (phase >= 1) {
          hold += dt;
          if (hold >= END_HOLD) {
            hold = 0;
            phase = 0;
          }
        } else {
          phase = Math.min(1, phase + dt / params.tBrake);
        }
      },
      render() {
        const dt = playing ? pendingDt : 0;
        pendingDt = 0;
        draw(dt);
      },
    },
    { autoStart: !ctx.reducedMotion },
  );
  draw(0);

  liveMounts += 1;
  const unregisterDebug = registerDebugHook<TeardownDebug>('mguk-teardown', {
    get liveMounts() {
      return liveMounts;
    },
    scene: () => scene?.info() ?? null,
    angle: () => scene?.angle() ?? 0,
    phase: () => phase,
    seek: (p) => {
      phase = Math.min(1, Math.max(0, p));
      draw(0);
    },
  });

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      tour.dispose();
      for (const c of offInput) c.removeEventListener('start', stopTour);
      loop.dispose();
      panel.dispose();
      resetView?.dispose();
      scene?.dispose();
      scene = null;
      layout.dispose();
      host.replaceChildren();
      liveMounts -= 1;
      unregisterDebug();
    },
  };
}

const sim: SimModule = {
  id: 'mguk-teardown',
  titleIT: 'MGU-K in frenata: spaccato 3D',
  summaryIT:
    'Spaccato dell’MGU-K durante la frenata: rotore a magneti permanenti, statore con avvolgimenti, ingranaggi verso ruota, inverter e batteria; una sola fase della frenata comanda giri, coppia, tensione indotta, corrente, flusso di energia e carica.',
  theoryId: '10-kers-mguk',
  mount,
};

export default sim;
