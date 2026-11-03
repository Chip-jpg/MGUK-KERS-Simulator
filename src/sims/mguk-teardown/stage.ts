/**
 * Stage of the MGU-K teardown: render-foundation studio (light, one accent colour), camera
 * framing, labels, and `update(state)` that maps one `BrakingState` (model.ts) onto the parts.
 * Nothing here recomputes physics: every number shown comes from the state; the only
 * constants are geometric (gear tooth counts, wheel radius) and one visual time scale.
 */
import type { AppContext } from '../../core/types';
import {
  createEnergyRibbon,
  createLabelLayer,
  createStage,
  type EnergyRibbon,
  type Label,
  type LabelLayer,
  type Stage,
  type StageInfo,
} from '../../render';
import { ROTOR_SPEED_PER_VEHICLE_SPEED, type BrakingState } from './model';
import { CRANK_GEAR_TEETH, PINION_TEETH, WHEEL_R } from './dims';
import { createTeardown, type HousingMode, type Teardown } from './geometry';

/**
 * Visual time scale of the rotor angle: θ += ω·dt·VISUAL_TIME_SCALE. At 50 000 rpm
 * (834 rev/s) a 60 fps frame would alias the rotor (14 rev per frame), so the rotation is
 * shown 1/100 slower (≤ 8,3 rev/s). The rotor, pinion, crank gear and wheel all use the same
 * θ through their fixed ratios, so their relative motion is exact.
 */
export const VISUAL_TIME_SCALE = 0.01;

/** Wheel angle per rotor angle: 1 / (rotor rad per metre of travel · wheel radius). */
export const WHEEL_PER_ROTOR = 1 / (ROTOR_SPEED_PER_VEHICLE_SPEED * WHEEL_R);
/** Crankshaft turns per wheel turn through the (unseen) transmission: derived from the model. */
export const CRANK_PER_WHEEL = PINION_TEETH / CRANK_GEAR_TEETH / WHEEL_PER_ROTOR;

/** Ribbon radius [scene units] at P = Pmax. */
const RIBBON_R_AT_PMAX = 0.03;

const FOV = 36;
const DEFAULT_ASPECT = 2.1;
type Vec3 = [number, number, number];
interface FrameSpec {
  target: Vec3;
  /** Half extents [scene units] of what must fit, and the fraction of the canvas it should fill. */
  halfW: number;
  halfH: number;
  fill: number;
  /** Camera elevation / azimuth [deg] around the target. */
  elevation: number;
  azimuth: number;
}
/** "Insieme": the whole line wheel → MGU-K → inverter → battery (≈ 9.3 units wide), from slightly above. */
const HOME_FRAME: FrameSpec = {
  target: [0, -0.1, -0.4],
  halfW: 4.9,
  halfH: 1.6,
  fill: 0.82,
  elevation: 20,
  azimuth: 12,
};
/** "MGU-K": the open machine (Ø 0.52 units) with the crank gear beside it, face-on. */
const MGUK_FRAME: FrameSpec = {
  target: [-0.2, 0.04, 0.2],
  halfW: 0.62,
  halfH: 0.4,
  fill: 0.85,
  elevation: 16,
  azimuth: 9,
};

/** Camera position/target that fits `f` into a canvas of the given aspect ratio. */
export function frameView(f: FrameSpec, aspect: number): { position: Vec3; target: Vec3 } {
  const tanV = Math.tan((FOV * Math.PI) / 360);
  const tanH = tanV * (Number.isFinite(aspect) && aspect > 0.2 ? aspect : DEFAULT_ASPECT);
  const d = Math.max(f.halfW / (f.fill * tanH), f.halfH / (f.fill * tanV));
  const el = (f.elevation * Math.PI) / 180;
  const az = (f.azimuth * Math.PI) / 180;
  const [tx, ty, tz] = f.target;
  return {
    position: [
      tx + d * Math.cos(el) * Math.sin(az),
      ty + d * Math.sin(el),
      tz + d * Math.cos(el) * Math.cos(az),
    ],
    target: f.target,
  };
}
export const HOME_VIEW = frameView(HOME_FRAME, DEFAULT_ASPECT);
export const MGUK_VIEW = frameView(MGUK_FRAME, DEFAULT_ASPECT);

export interface TeardownStage {
  readonly stage: Stage;
  readonly parts: Teardown;
  /** Map a braking state onto the parts; `dt` [s] is real time since the last call (0 = scrubbing). */
  update(state: BrakingState, dt?: number): void;
  /** Draw one frame. */
  render(): void;
  setHousing(m: HousingMode): void;
  setView(v: 'home' | 'mguk'): void;
  /** Rotor angle θ [rad] (debug / tests). */
  angle(): number;
  info(): StageInfo & { labels: ReturnType<LabelLayer['stats']> };
  dispose(): void;
}

export interface TeardownStageOptions {
  /** Electrical power cap [W] that scales the energy ribbon (Pmax of the event). */
  pMax: number;
}

export function createTeardownStage(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
  opts: TeardownStageOptions,
): TeardownStage {
  let probe: Teardown | null = null;
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D: spaccato dell’MGU-K in frenata con statore, avvolgimenti in rame, rotore a magneti permanenti, ingranaggi verso albero motore e ruota, inverter e batteria con livello di carica; il nastro viola mostra il flusso di energia ruota, MGU-K, inverter, batteria.',
    camera: { ...HOME_VIEW, fov: FOV, far: 120 },
    controls: { minDistance: 0.9, maxDistance: 26, maxPolarAngle: (88 * Math.PI) / 180 },
    floorY: -WHEEL_R * 4 - 0.02,
    floor: { radius: 40 },
    shadowRadius: 8,
  });
  let ribbon: EnergyRibbon | null = null;
  let labels: LabelLayer | null = null;
  try {
    probe = createTeardown(stage);
    ribbon = createEnergyRibbon(stage, {
      path: probe.flowPath,
      widthPerWatt: RIBBON_R_AT_PMAX / Math.max(1, opts.pMax),
      minRadius: 0.008,
      maxRadius: RIBBON_R_AT_PMAX * 1.15,
      pRef: Math.max(1, opts.pMax),
      speed: 1.4,
      quantity: 'energy',
    });
    labels = createLabelLayer(stage, overlay);
  } catch (e) {
    labels?.dispose();
    ribbon?.dispose();
    probe?.dispose();
    stage.dispose();
    throw e;
  }
  const parts = probe;
  const home0 = frameView(HOME_FRAME, stage.camera.aspect);
  stage.setView(home0.position, home0.target, false);
  const flow = ribbon;
  const labelLayer = labels;
  const a = parts.anchors;
  const L: Record<'mguk' | 'gears' | 'wheel' | 'inverter' | 'battery', Label> = {
    mguk: labels.add({
      text: 'MGU-K',
      anchor: a.mguk,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      offset: [26, 30],
      sensorWidth: '16ch',
      sensorHeight: '1.7rem',
    }),
    gears: labels.add({
      text: `Ingranaggi ${PINION_TEETH}:${CRANK_GEAR_TEETH}`,
      anchor: a.gears,
      priority: 6,
      occlude: false,
      size: 'sm',
      offset: [-34, 30],
    }),
    wheel: labels.add({
      text: 'Ruota posteriore',
      anchor: a.wheel,
      priority: 6,
      occlude: false,
      size: 'sm',
      offset: [0, -22],
    }),
    inverter: labels.add({
      text: 'Inverter',
      anchor: a.inverter,
      priority: 6,
      occlude: false,
      size: 'sm',
      offset: [18, 24],
    }),
    battery: labels.add({
      text: 'Batteria',
      anchor: a.battery,
      quantity: 'energy',
      priority: 9,
      occlude: false,
      offset: [0, 28],
      sensorWidth: '14ch',
      sensorHeight: '1.7rem',
    }),
  };
  let theta = 0;
  let disposed = false;
  const fmt = ctx.formatIT;

  return {
    stage,
    parts,
    update(s, dt = 0) {
      if (disposed) return;
      theta = (theta + s.omega * Math.max(0, dt) * VISUAL_TIME_SCALE) % (2 * Math.PI);
      parts.setAngles(theta, WHEEL_PER_ROTOR);
      const flowing = s.pKers > 0;
      flow.setVisible(flowing);
      flow.setPower(flowing ? s.pKers : 0);
      parts.setSoc(s.soc);
      L.mguk.setText(`MGU-K · ${fmt(s.pKers / 1e3, 0, 'kW')}`);
      L.battery.setText(`SoC ${fmt(s.soc * 100, 1, '%')}`);
    },
    render() {
      if (!disposed) stage.render();
    },
    setHousing: (m) => parts.setHousingMode(m),
    setView(v) {
      const w = frameView(v === 'mguk' ? MGUK_FRAME : HOME_FRAME, stage.camera.aspect);
      stage.setView(w.position, w.target);
    },
    angle: () => theta,
    info: () => ({ ...stage.info(), labels: labelLayer.stats() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      labelLayer.dispose();
      flow.dispose();
      parts.dispose();
      stage.dispose();
    },
  };
}

export type { HousingMode } from './geometry';
