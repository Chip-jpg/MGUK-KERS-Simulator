/**
 * 3D scene of the `car-dynamics` simulator, on the render foundation (D14) and the
 * shared car (`src/sims/shared/car`).
 *
 * Physics behind each visual (all from `simulateBrakingZone` and the disc model):
 * - motion, wheel rotation φ = x/r, braking point / end of the zone, boards;
 * - force arrows (force green) from the computed vectors: drag D, downforce per axle
 *   (split like the weight), tyre longitudinal force per axle — LOG scale
 *   L = 0,9 m · log₁₀(1 + F/1 kN) (see `forces.ts`), value labels on each arrow;
 * - body pitch/heave from the axle loads F_z,f / F_z,r (illustrative springs,
 *   exaggeration ×2,5, `rideFromLoads` / `visualRide`);
 * - contact-patch glow ∝ (κ/κ*)² per axle and the "asse al limite" label (κ = κ*);
 * - energy ribbons (radius ∝ power): rear wheels → MGU-K, MGU-K → battery, losses;
 * - disc glow: black-body colour of the per-axle disc temperature (lumped model fed
 *   with the axle's friction-brake power).
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import type { Label } from '../../render';
import { createCarSceneCore, type CarSceneCore, type CoreFrame } from '../shared/car/scene';
import { arrowLength } from './forces';

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
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  tip: THREE.Vector3;
  label: Label;
}

const HEAD = 0.16;

export function createCarScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): CarScene {
  const core = createCarSceneCore(
    container,
    overlay,
    ctx,
    'Scena 3D: monoposto stilizzata in sezione che frena al limite; frecce verdi mostrano resistenza aerodinamica, deportanza su ciascun asse e forze frenanti degli pneumatici, l’impronta a terra si illumina con lo scorrimento, nastri viola mostrano la potenza verso l’MGU-K e la batteria, i dischi si illuminano con la loro temperatura calcolata.',
    { patches: true },
  );
  const { stage, car, labels } = core;
  const kit = stage.materials;
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 12).translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(0.075, HEAD, 16).translate(0, HEAD / 2, 0);
  const group = new THREE.Group();
  group.name = 'forces';
  stage.scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const makeArrow = (dir: THREE.Vector3, text: string, offset: [number, number]): Arrow => {
    const g = new THREE.Group();
    g.quaternion.setFromUnitVectors(up, dir);
    const shaft = new THREE.Mesh(shaftGeo);
    kit.assign(shaft, 'glowF', 'arrow');
    const head = new THREE.Mesh(headGeo);
    kit.assign(head, 'glowF', 'arrow');
    g.add(shaft, head);
    group.add(g);
    const tip = new THREE.Vector3();
    const label = labels.add({
      text,
      anchor: tip,
      quantity: 'f',
      size: 'sm',
      priority: 5,
      occlude: false,
      offset,
    });
    return { group: g, shaft, head, tip, label };
  };
  const back = new THREE.Vector3(-1, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const arrows = {
    drag: makeArrow(back, 'D', [-6, -16]),
    downFront: makeArrow(down, 'L ant.', [0, -18]),
    downRear: makeArrow(down, 'L post.', [0, -18]),
    fxFront: makeArrow(back, 'Fx ant.', [-10, 22]),
    fxRear: makeArrow(back, 'Fx post.', [-10, 24]),
  };
  const setLen = (a: Arrow, len: number): void => {
    a.group.visible = len > 0.02;
    a.label.setVisible(len > 0.02);
    const head = Math.min(HEAD, len * 0.5);
    a.shaft.scale.set(1, Math.max(1e-3, len - head), 1);
    a.head.scale.setScalar(Math.max(0.25, head / HEAD));
    a.head.position.y = len - head;
  };
  /** Arrow from `origin` along its direction. */
  const place = (a: Arrow, origin: THREE.Vector3, len: number, dir: THREE.Vector3): void => {
    setLen(a, len);
    a.group.position.copy(origin);
    a.tip.copy(origin).addScaledVector(dir, len);
  };
  /** Arrow whose tip touches `tip` (downforce pushes on the car). */
  const placeOnto = (a: Arrow, tip: THREE.Vector3, len: number): void => {
    setLen(a, len);
    a.group.position.copy(tip).addScaledVector(down, -len);
    a.tip.copy(a.group.position);
  };
  const fxOrigin = { front: new THREE.Vector3(), rear: new THREE.Vector3() };
  const limitAnchor = new THREE.Vector3();
  const limitLabel = labels.add({
    text: 'Asse al limite (κ = κ*)',
    anchor: limitAnchor,
    quantity: 'accent',
    priority: 7,
    occlude: false,
    offset: [0, 34],
  });
  stage.castShadows(group);

  let disposed = false;
  return {
    core,
    render(f) {
      if (disposed) return;
      core.frame(f);
      const A = car.anchors;
      place(arrows.drag, A.dragPoint, arrowLength(f.drag), back);
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
      stage.scene.remove(group);
      shaftGeo.dispose();
      headGeo.dispose();
      core.dispose();
    },
  };
}
