/**
 * 3D scene of the `kers-braking` simulator, on the render foundation (D14) and the
 * shared car (`src/sims/shared/car`): the cut-away single-seater brakes along a
 * scrolling braking zone (boards 150 / 100 / 50 m to the end of the zone).
 *
 * Physics behind each visual (all from the model, nothing hand-tuned):
 * - car speed, distance, wheel rotation φ = x/r: constant deceleration (D8);
 * - energy ribbons, radius ∝ power (0,12 m at 350 kW): rear wheels → MGU-K = mechanical
 *   power absorbed min(P_b, Pₘₐₓ/η); MGU-K → battery = η·that (electrical, ≤ Pₘₐₓ);
 *   MGU-K → radiator (dimmer) = losses (1 − η)·that;
 * - battery gauge: electrical energy stored / ΔE_k;
 * - disc glow: black-body colour of the disc temperature from the lumped thermal
 *   model (`physics/brake-thermal`), fed with the disc-brake power P_b − P_MGU-K split
 *   60 % front / 40 % rear (fixed, illustrative).
 */
import type { AppContext } from '../../core/types';
import { createCarSceneCore, type CarSceneCore, type CoreFrame } from '../shared/car/scene';

export { carStats } from '../shared/car';

export type KersFrame = CoreFrame;

export interface KersScene {
  readonly core: CarSceneCore;
  render(f: KersFrame): void;
  info(): ReturnType<CarSceneCore['info']>;
  dispose(): void;
}

export function createKersScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): KersScene {
  const core = createCarSceneCore(
    container,
    overlay,
    ctx,
    'Scena 3D: monoposto stilizzata in sezione che frena lungo una pista con cartelli di distanza; nastri viola mostrano la potenza dalle ruote posteriori all’MGU-K e dall’MGU-K alla batteria, i dischi dei freni si illuminano con il colore del corpo nero della loro temperatura calcolata.',
  );
  let disposed = false;
  return {
    core,
    render(f) {
      if (disposed) return;
      core.frame(f);
      core.stage.render();
    },
    info: () => core.info(),
    dispose() {
      if (disposed) return;
      disposed = true;
      core.dispose();
    },
  };
}
