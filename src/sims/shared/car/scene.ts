/**
 * Common 3D set of the car simulators: render-foundation stage + shared car +
 * scrolling braking-zone track + the labels both sims use (MGU-K power, battery
 * energy, disc temperatures, braking point / end of the zone). Each sim adds its
 * own extras (car-dynamics: force arrows) on `core.stage` / `core.labels`.
 */
import * as THREE from 'three';
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
  /** Compile every program and upload every texture now (call again after adding objects). */
  prewarm(): void;
  info(): StageInfo & {
    labels: ReturnType<LabelLayer['stats']>;
    meshes: number;
    /** Frames drawn since mount (tests wait for a few before sampling counters). */
    frames: number;
  };
  dispose(): void;
}

const FOV = 30;
type Vec3 = [number, number, number];
/**
 * Home framing: the whole car (5,55 m × ~1 m, front wing tip to rear wing) fills ~66 % of
 * the canvas, seen 3/4 from the cut-open side (+z) and slightly above, so the opened engine
 * bay, the MGU-K and the energy store face the camera.
 */
const HOME = {
  target: [0.15, 0.25, 0.2] as Vec3,
  halfW: 2.55,
  halfH: 1.1,
  fill: 0.6,
  elevation: 25,
  azimuth: 44,
};
/** Camera position/target fitting the car into a canvas of the given aspect ratio. */
export function carView(aspect: number): { position: Vec3; target: Vec3 } {
  const tanV = Math.tan((FOV * Math.PI) / 360);
  const tanH = tanV * (Number.isFinite(aspect) && aspect > 0.2 ? aspect : 2.1);
  const d = Math.max(HOME.halfW / (HOME.fill * tanH), HOME.halfH / (HOME.fill * tanV));
  const el = (HOME.elevation * Math.PI) / 180;
  const az = (HOME.azimuth * Math.PI) / 180;
  const [tx, ty, tz] = HOME.target;
  return {
    position: [
      tx + d * Math.cos(el) * Math.sin(az),
      ty + d * Math.sin(el),
      tz + d * Math.cos(el) * Math.cos(az),
    ],
    target: HOME.target,
  };
}
/** Home view at the default 2,1:1 canvas (re-fitted to the real aspect on mount). */
export const CAR_VIEW = carView(2.1);

export function createCarSceneCore(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
  ariaLabel: string,
  carOpts: CarOptions = {},
): CarSceneCore {
  const stage = createStage(container, ctx, {
    ariaLabel,
    camera: { ...CAR_VIEW, fov: FOV, far: 160 },
    controls: { minDistance: 2.2, maxDistance: 24, maxPolarAngle: (84 * Math.PI) / 180 },
    floorY: -0.02,
    // the studio floor runs out under the scene fog (no disc edge beside the track)
    floor: { radius: 64 },
    shadowRadius: 4.2,
    look: 'teardown',
  });
  const home = carView(stage.camera.aspect);
  stage.setView(home.position, home.target, false);
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
      sensorHeight: '1.7rem',
      sensorWidth: '27ch',
      anchor: a.mguk,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      // up-left on the backdrop behind the rear wing, clear of the opened bay
      offset: [-200, -70],
    }),
    battery: labels.add({
      text: 'Batteria',
      sensorHeight: '1.7rem',
      anchor: a.battery,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      // below the floor, on the asphalt
      offset: [20, 120],
    }),
    discFront: labels.add({
      text: 'Disco ant.',
      sensorHeight: '1.7rem',
      anchor: a.discFront,
      priority: 8,
      occlude: false,
      offset: [120, 20],
    }),
    discRear: labels.add({
      text: 'Disco post.',
      sensorHeight: '1.7rem',
      anchor: a.discRear,
      priority: 8,
      occlude: false,
      offset: [-110, 60],
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
  let frames = 0;
  /**
   * Deterministic GPU state on mount: objects that are hidden at first (boards, lines,
   * spin blur, patches…) would otherwise compile their programs and upload their textures
   * only when they first come into view, so renderer counters would depend on the playback
   * time. Make everything visible, compile, upload every texture of the set, and let the
   * first `frame()` restore the real visibility (it sets all of it every frame).
   */
  const prewarm = (): void => {
    const hidden: THREE.Object3D[] = [];
    stage.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    stage.renderer.compile(stage.scene, stage.camera);
    const seen = new Set<THREE.Texture>();
    stage.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        for (const v of Object.values(mat)) {
          if (v instanceof THREE.Texture && !seen.has(v)) {
            seen.add(v);
            stage.renderer.initTexture(v);
          }
        }
      }
    });
    for (const tx of [...c.textures, ...t.textures]) {
      if (!seen.has(tx)) stage.renderer.initTexture(tx);
    }
    // Upload every geometry too (compile() does not): one draw with frustum culling off,
    // so the GPU geometry count does not depend on which track parts came into view.
    const culled: THREE.Object3D[] = [];
    stage.scene.traverse((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    stage.renderer.render(stage.scene, stage.camera);
    for (const o of culled) o.frustumCulled = true;
    for (const o of hidden) o.visible = false;
  };
  prewarm();
  return {
    stage,
    prewarm,
    car: c,
    track: t,
    labels: l,
    frame(f) {
      frames++;
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
    info: () => ({ ...stage.info(), labels: l.stats(), meshes: c.meshCount(), frames }),
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
