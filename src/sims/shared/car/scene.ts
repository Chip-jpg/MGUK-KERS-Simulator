/**
 * Common 3D set of the car simulators: render-foundation stage + shared car +
 * scrolling braking-zone track + the labels both sims use (MGU-K power, battery
 * energy, disc temperatures, braking point / end of the zone). Each sim adds its
 * own extras (car-dynamics: force arrows) on `core.stage` / `core.labels`.
 */
import type { AppContext } from '../../../core/types';
import {
  createLabelLayer,
  createStage,
  type Label,
  type LabelLayer,
  type Stage,
  type StageInfo,
} from '../../../render';
import { createCar, type Car, type CarFrame, type CarOptions } from './car';
import { createTrack, type Track } from './track';

export interface CoreTexts {
  mguk: string;
  battery: string;
  discFront: string;
  discRear: string;
}

export interface CoreFrame extends CarFrame {
  /** Length of the braking zone [m]. */
  distance: number;
  /** Playback speed factor (×1, ×0,25) for the streak animation. */
  timeScale: number;
  texts: CoreTexts;
}

export interface CarSceneCore {
  readonly stage: Stage;
  readonly car: Car;
  readonly track: Track;
  readonly labels: LabelLayer;
  frame(f: CoreFrame): void;
  info(): StageInfo & { labels: ReturnType<LabelLayer['stats']>; meshes: number };
  dispose(): void;
}

/** Home view: front-left three-quarter, slightly above the car. */
export const CAR_VIEW = {
  position: [3.95, 1.8, 4.95] as [number, number, number],
  target: [-0.15, 0.42, 0.1] as [number, number, number],
};

export function createCarSceneCore(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
  ariaLabel: string,
  carOpts: CarOptions = {},
): CarSceneCore {
  const stage = createStage(container, ctx, {
    ariaLabel,
    camera: { ...CAR_VIEW, fov: 34, far: 160 },
    controls: { minDistance: 3, maxDistance: 24, maxPolarAngle: (84 * Math.PI) / 180 },
    floorY: -0.02,
    shadowRadius: 4.2,
  });
  let car: Car | null = null;
  let track: Track | null = null;
  let labels: LabelLayer | null = null;
  try {
    track = createTrack(stage);
    car = createCar(stage, carOpts);
    labels = createLabelLayer(stage, overlay);
  } catch (e) {
    labels?.dispose();
    car?.dispose();
    track?.dispose();
    stage.dispose();
    throw e;
  }
  const a = car.anchors;
  const L: Record<keyof CoreTexts | 'start' | 'end', Label> = {
    mguk: labels.add({
      text: 'MGU-K',
      anchor: a.mguk,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      offset: [0, -34],
    }),
    battery: labels.add({
      text: 'Batteria',
      anchor: a.battery,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      offset: [-40, 30],
    }),
    discFront: labels.add({
      text: 'Disco ant.',
      anchor: a.discFront,
      priority: 8,
      occlude: false,
      offset: [40, 46],
    }),
    discRear: labels.add({
      text: 'Disco post.',
      anchor: a.discRear,
      priority: 8,
      occlude: false,
      offset: [-84, 14],
    }),
    start: labels.add({
      text: 'Punto di frenata',
      anchor: track.anchors.start,
      quantity: 'accent',
      priority: 3,
      size: 'sm',
      occlude: false,
    }),
    end: labels.add({
      text: 'Fine frenata',
      anchor: track.anchors.end,
      priority: 3,
      size: 'sm',
      occlude: false,
    }),
  };
  let lastMs = 0;
  let disposed = false;
  const c = car;
  const t = track;
  const l = labels;
  return {
    stage,
    car: c,
    track: t,
    labels: l,
    frame(f) {
      const now = performance.now();
      const dt = lastMs === 0 ? 0 : Math.min(0.1, (now - lastMs) / 1000);
      lastMs = now;
      c.update(f);
      t.update(f.x, f.distance, f.v, dt * f.timeScale);
      L.mguk.setText(f.texts.mguk);
      L.battery.setText(f.texts.battery);
      L.discFront.setText(f.texts.discFront);
      L.discRear.setText(f.texts.discRear);
      L.start.setVisible(t.visible.start);
      L.end.setVisible(t.visible.end);
    },
    info: () => ({ ...stage.info(), labels: l.stats(), meshes: c.meshCount() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      l.dispose();
      c.dispose();
      t.dispose();
      stage.dispose();
    },
  };
}
