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
import { defaultParams } from '../kers-braking/model';
import { brakingStateAt, type BrakingState } from './model';
import { createTeardownPanel } from './panel';
import { createTeardownStage, type TeardownStage } from './stage';
import './style.css';

export const MODEL_NOTE_IT =
  'dimensioni reali ma illustrative (da massa minima 7 kg e giri massimi 50 000 giri/min del regolamento FIA; misure interne ipotizzate), accoppiamento fisso rotore–ruota (da v ↔ giri/min del modello: ipotesi, non dati del regolamento), tensione indotta e corrente di una macchina equivalente a magneti permanenti (EMF = Kₑ·ω), batteria virtuale senza perdite aggiuntive. Un solo ingresso, la fase della frenata, comanda rotore, ingranaggi, ruota, flusso di energia (nastro viola ∝ P/Pₘₐₓ, acceso solo con P > 0) e livello di carica. La rotazione è mostrata 100 volte più lenta del reale per evitare l’aliasing a 50 000 giri/min.';

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
  const params = defaultParams();
  let phase = 0;
  let hold = 0;
  let playing = !ctx.reducedMotion;
  let pendingDt = 0;
  let state: BrakingState = brakingStateAt(0, params);

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
    onView: (v) => scene?.setView(v),
  });
  function pause(): void {
    playing = false;
    panel.setPlaying(false);
  }

  const resetView = scene ? createResetViewButton(scene.stage) : null;
  if (resetView) layout.toolbar.append(resetView.element);

  function draw(dt: number): void {
    state = brakingStateAt(phase, params);
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
