/**
 * 3D scene of the `car-dynamics` simulator, on the render foundation (D14, `look: 'teardown'`
 * dark studio via the shared car core) and the shared teardown car (`src/sims/shared/car`).
 *
 * Reference: FIA 2026 Formula 1 technical regulations (max wheelbase 3400 mm, max width
 * 1900 mm, 18-inch wheels — as summarised by motorsportmagazine.com, «How the F1 chassis
 * is changing under 2026 regulations»); the car itself is built in `shared/car/dims.ts`.
 * Arrow and cue sizes here are illustrative display sizes.
 *
 * Physics behind each visual (all from `simulateBrakingZone` and the disc model):
 * - motion, wheel rotation φ = x/r, braking point / end of the zone, boards;
 * - force arrows (force green) from the computed vectors: drag D at the rear, downforce
 *   per axle (split like the weight) pressing on the car, tyre longitudinal force per
 *   axle at the contact patch — LOG scale L = 0,9 m · log₁₀(1 + F/1 kN) with decade
 *   rings at 1 kN and 10 kN on each shaft (see `forces.ts`); compact value labels at the
 *   free end of each arrow, off the car;
 * - body pitch/heave from the axle loads F_z,f / F_z,r (illustrative springs,
 *   exaggeration ×2,5, `rideFromLoads` / `visualRide`);
 * - contact-patch glow ∝ (κ/κ*)² per axle, the accent target ring on the limiting
 *   axle (κ = κ*, `parts.ts`) and the «asse al limite» label;
 * - energy ribbons (radius ∝ power): rear wheels → MGU-K, MGU-K → battery, losses;
 * - disc glow: black-body colour of the per-axle disc temperature (lumped model fed
 *   with the axle's friction-brake power).
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import type { Label } from '../../render';
import { createCarSceneCore, type CarSceneCore, type CoreFrame } from '../shared/car/scene';
import { arrowLength, createArrowKit, createForceArrow, type ForceArrow } from './forces';
import { createLimitCue } from './parts';

export { carStats } from '../shared/car';

export interface CarDynFrame extends CoreFrame {
  /** Forces [N]. */
  drag: number;
  downforceFront: number;
  downforceRear: number;
  fxFront: number;
  fxRear: number;
  /** Limiting axle. */
  limit: 'front' | 'rear' | 'both';
  /** Pre-formatted arrow labels. */
  forceTexts: {
    drag: string;
    downFront: string;
    downRear: string;
    fxFront: string;
    fxRear: string;
  };
}

export interface CarScene {
  readonly core: CarSceneCore;
  render(f: CarDynFrame): void;
  info(): ReturnType<CarSceneCore['info']>;
  dispose(): void;
}

interface Arrow {
  arrow: ForceArrow;
  /** Label anchor (free end of the arrow, off the car). */
  end: THREE.Vector3;
  label: Label;
}

/** Contact anchors sit just outside the tyre; the patch centre is this far inboard [m]. */
const PATCH_IN = { front: 0.25, rear: 0.3 };
/** Drag arrow height above the drag anchor [m] (display only: clears the rear wing). */
const DRAG_LIFT = 0.45;
/** Drag arrow lateral offset toward the camera side [m] (display only: clear of the wing). */
const DRAG_SIDE = 0.8;

export function createCarScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): CarScene {
  const core = createCarSceneCore(
    container,
    overlay,
    ctx,
    'Scena 3D: monoposto stilizzata in sezione che frena al limite; frecce verdi in scala logaritmica mostrano resistenza aerodinamica, deportanza su ciascun asse e forze frenanti degli pneumatici, l’impronta a terra si illumina con lo scorrimento e un anello evidenzia l’asse al limite, nastri viola mostrano la potenza verso l’MGU-K e la batteria, i dischi si illuminano con la loro temperatura calcolata.',
    { patches: true },
  );
  const { stage, car, labels } = core;
  const low = stage.tier === 'base';
  const kit = createArrowKit(low);
  const group = new THREE.Group();
  group.name = 'forces';
  stage.scene.add(group);
  const back = new THREE.Vector3(-1, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const makeArrow = (dir: THREE.Vector3, text: string, offset: [number, number]): Arrow => {
    const arrow = createForceArrow(kit, stage.materials, dir);
    group.add(arrow.group);
    const end = new THREE.Vector3();
    const label = labels.add({
      text,
      anchor: end,
      quantity: 'f',
      size: 'sm',
      priority: 5,
      occlude: false,
      offset,
      // compact one-line sensor box, e.g. «Fx post. 12,3 kN»
      sensorWidth: '17ch',
      sensorHeight: '1.5rem',
    });
    return { arrow, end, label };
  };
  const arrows = {
    // beside the tip, behind the rear wing
    drag: makeArrow(back, 'D', [-68, -4]),
    // above the tails (the arrows press down on the car from above)
    downFront: makeArrow(down, 'L ant.', [0, -16]),
    downRear: makeArrow(down, 'L post.', [52, -10]),
    // beside the tips, on the asphalt
    fxFront: makeArrow(back, 'Fx ant.', [-74, 2]),
    fxRear: makeArrow(back, 'Fx post.', [-70, -12]),
  };
  const setDetail = (): void => {
    for (const a of Object.values(arrows)) a.arrow.setDetail(stage.tier !== 'base');
  };
  setDetail();
  const offTier = stage.onTierChange(setDetail);
  /** Arrow from `origin` along its direction; the label sits at the tip. */
  const place = (a: Arrow, origin: THREE.Vector3, len: number, dir: THREE.Vector3): void => {
    a.label.setVisible(a.arrow.setLength(len));
    a.arrow.group.position.copy(origin);
    a.end.copy(origin).addScaledVector(dir, len);
  };
  /** Arrow whose tip touches `tip` (downforce pushes on the car); the label sits at the tail. */
  const placeOnto = (a: Arrow, tip: THREE.Vector3, len: number): void => {
    a.label.setVisible(a.arrow.setLength(len));
    a.arrow.group.position.copy(tip).addScaledVector(down, -len);
    a.end.copy(a.arrow.group.position);
  };
  const fxOrigin = { front: new THREE.Vector3(), rear: new THREE.Vector3() };
  const dragOrigin = new THREE.Vector3();
  const cues = { front: createLimitCue(low), rear: createLimitCue(low) };
  stage.scene.add(cues.front.group, cues.rear.group);
  const cueAt = new THREE.Vector3();
  const limitAnchor = new THREE.Vector3();
  const limitLabel = labels.add({
    text: 'Asse al limite (κ = κ*)',
    anchor: limitAnchor,
    quantity: 'accent',
    size: 'sm',
    priority: 7,
    occlude: false,
    offset: [10, 40],
  });
  stage.castShadows(group);
  core.prewarm(); // arrows + cues: compile their programs before the first sample

  let disposed = false;
  return {
    core,
    render(f) {
      if (disposed) return;
      core.frame(f);
      const A = car.anchors;
      // drawn just above the rear wing (illustrative +0,45 m), where the wing does not hide it
      dragOrigin.copy(A.dragPoint);
      dragOrigin.y += DRAG_LIFT;
      dragOrigin.z += DRAG_SIDE;
      place(arrows.drag, dragOrigin, arrowLength(f.drag), back);
      placeOnto(arrows.downFront, A.frontTop, arrowLength(f.downforceFront));
      placeOnto(arrows.downRear, A.rearTop, arrowLength(f.downforceRear));
      fxOrigin.front.copy(A.contactFront).setY(0.05);
      fxOrigin.rear.copy(A.contactRear).setY(0.05);
      place(arrows.fxFront, fxOrigin.front, arrowLength(f.fxFront), back);
      place(arrows.fxRear, fxOrigin.rear, arrowLength(f.fxRear), back);
      const t = f.forceTexts;
      arrows.drag.label.setText(t.drag);
      arrows.downFront.label.setText(t.downFront);
      arrows.downRear.label.setText(t.downRear);
      arrows.fxFront.label.setText(t.fxFront);
      arrows.fxRear.label.setText(t.fxRear);
      const braking = f.fxFront + f.fxRear > 0;
      // the ring breathes with the distance travelled (≈ 1,5 Hz at 80 m/s, still when stopped)
      const pulse = 0.5 + 0.5 * Math.sin(f.x * 0.12);
      for (const axle of ['front', 'rear'] as const) {
        const on = braking && (f.limit === axle || f.limit === 'both');
        cues[axle].group.visible = on;
        if (!on) continue;
        const c = axle === 'front' ? A.contactFront : A.contactRear;
        cues[axle].place(cueAt.copy(c).setZ(c.z - PATCH_IN[axle]), pulse);
      }
      limitLabel.setVisible(braking);
      if (f.limit === 'front') limitAnchor.copy(A.contactFront);
      else if (f.limit === 'rear') limitAnchor.copy(A.contactRear);
      else limitAnchor.copy(A.contactFront).add(A.contactRear).multiplyScalar(0.5);
      limitLabel.setText(
        f.limit === 'both'
          ? 'Entrambi gli assi al limite (κ = κ*)'
          : `Asse ${f.limit === 'front' ? 'anteriore' : 'posteriore'} al limite (κ = κ*)`,
      );
      stage.render();
    },
    info: () => core.info(),
    dispose() {
      if (disposed) return;
      disposed = true;
      offTier();
      stage.scene.remove(group, cues.front.group, cues.rear.group);
      kit.dispose();
      cues.front.dispose();
      cues.rear.dispose();
      core.dispose();
    },
  };
}
