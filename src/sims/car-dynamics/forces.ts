/**
 * Force arrows of the `car-dynamics` scene.
 *
 * Display scale (pure, testable): forces span two decades (≈ 0,5 kN of drag at low speed
 * … ≈ 40 kN of tyre force), so arrow lengths are LOGARITHMIC: L = ARROW_K · log₁₀(1 + F / F_REF).
 * Stated in the scene legend: 1 kN → 0,27 m, 10 kN → 0,94 m, 40 kN → 1,45 m.
 *
 * Arrow geometry (teardown style): a turned shaft with a cone head, a collar at the point
 * of application and decade rings on the shaft at 1 kN and 10 kN, so the log scale reads
 * on the arrow itself. Lengths are display lengths [m in scene units], not physical.
 * At the `base` quality tier only shaft + head are drawn (2 draw calls per arrow).
 */
import * as THREE from 'three';
import type { MaterialKit } from '../../render';

/** Reference force of the log scale [N]. */
export const ARROW_F_REF = 1000;
/** Length per decade [m]. */
export const ARROW_K = 0.9;
/** Longest arrow drawn [m]. */
export const ARROW_MAX = 2.2;

/** Arrow length for a force magnitude [m] (0 for no force, capped at {@link ARROW_MAX}). */
export function arrowLength(force: number): number {
  if (!(force > 0)) return 0;
  return Math.min(ARROW_MAX, ARROW_K * Math.log10(1 + force / ARROW_F_REF));
}

/** Legend ticks (force [N] → length [m]). */
export const ARROW_LEGEND = [1e3, 10e3, 40e3].map((f) => ({ f, len: arrowLength(f) }));

/** Decade rings drawn on every shaft (1 kN, 10 kN) [m from the tail]. */
export const ARROW_TICKS = [1e3, 10e3].map(arrowLength);

/** Illustrative display sizes [m] (not physical). */
const SHAFT_R = 0.026;
const HEAD_R = 0.072;
const HEAD_L = 0.17;
const COLLAR_R = 0.05;
const TICK_R = 0.085;

/** Geometry shared by every arrow of the scene (dispose once). */
export interface ArrowKit {
  shaft: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  collar: THREE.BufferGeometry;
  tick: THREE.BufferGeometry;
  dispose(): void;
}

export function createArrowKit(lowPoly: boolean): ArrowKit {
  const seg = lowPoly ? 8 : 18;
  const shaft = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1, seg, 1, true).translate(0, 0.5, 0);
  // cone with a slight back chamfer: reads as a machined head, not a flat disc
  const head = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(HEAD_R * 0.92, 0),
      new THREE.Vector2(HEAD_R, HEAD_L * 0.08),
      new THREE.Vector2(0.004, HEAD_L),
      new THREE.Vector2(0, HEAD_L),
    ],
    seg + 6,
  );
  const collar = new THREE.SphereGeometry(COLLAR_R, seg, Math.max(6, seg >> 1));
  const tick = new THREE.TorusGeometry(TICK_R, 0.017, 6, seg + 8).rotateX(Math.PI / 2);
  return {
    shaft,
    head,
    collar,
    tick,
    dispose() {
      for (const g of [shaft, head, collar, tick]) g.dispose();
    },
  };
}

/** One force arrow: local +y is the force direction, the group origin is the tail. */
export interface ForceArrow {
  readonly group: THREE.Group;
  /** Draw collar + decade rings (off at the base tier). */
  setDetail(on: boolean): void;
  /** Total length [m]; hidden under 2 cm. Returns whether it is visible. */
  setLength(len: number): boolean;
}

export function createForceArrow(kit: ArrowKit, mats: MaterialKit, dir: THREE.Vector3): ForceArrow {
  const group = new THREE.Group();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const shaft = new THREE.Mesh(kit.shaft);
  const head = new THREE.Mesh(kit.head);
  const collar = new THREE.Mesh(kit.collar);
  mats.assign(shaft, 'glowF', 'arrow');
  mats.assign(head, 'glowF', 'arrow');
  mats.assign(collar, 'darkSteel', 'arrowCollar');
  const ticks = ARROW_TICKS.map((y) => {
    const t = new THREE.Mesh(kit.tick);
    mats.assign(t, 'steel', 'arrowTick');
    t.position.y = y;
    return t;
  });
  group.add(shaft, head, collar, ...ticks);
  let detail = true;
  let length = 0;
  const syncTicks = (): void => {
    collar.visible = detail;
    // a ring only where the shaft is (never on the head)
    for (let i = 0; i < ticks.length; i++) {
      (ticks[i] as THREE.Mesh).visible = detail && (ARROW_TICKS[i] as number) < length - HEAD_L;
    }
  };
  return {
    group,
    setDetail(on) {
      detail = on;
      syncTicks();
    },
    setLength(len) {
      length = len;
      const vis = len > 0.02;
      group.visible = vis;
      const h = Math.min(HEAD_L, len * 0.5);
      shaft.scale.set(1, Math.max(1e-3, len - h), 1);
      head.scale.setScalar(Math.max(0.25, h / HEAD_L));
      head.position.y = len - h;
      syncTicks();
      return vis;
    },
  };
}
