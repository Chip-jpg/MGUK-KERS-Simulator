/**
 * Brake-disc temperatures of the car scenes: one lumped thermal node per axle
 * (left and right discs are identical), integrated in the sims' FIXED physics step
 * with `discThermalStep` (src/physics/brake-thermal). Pure, no Three.js.
 */
import {
  BRAKE_DISC_ILLUSTRATIVE,
  celsiusToKelvin,
  discThermalStep,
  type DiscStepResult,
} from '../../../physics';

/** Selectable starting temperatures [°C]. */
export const DISC_START_OPTIONS_C = [25, 300, 500] as const;
export type DiscStartC = (typeof DISC_START_OPTIONS_C)[number];
/** Default: discs already at working temperature. */
export const DISC_START_DEFAULT_C: DiscStartC = 300;

export interface DiscPair {
  /** Front / rear disc temperature [K]. */
  readonly tFront: number;
  readonly tRear: number;
  /** Energy put into one front / rear disc since the reset [J]. */
  readonly eFront: number;
  readonly eRear: number;
  /** Heat lost by one front / rear disc since the reset [J]. */
  readonly lossFront: number;
  readonly lossRear: number;
  /**
   * Advance by dt with the friction-brake power of the WHOLE front and rear axle [W]
   * (each disc receives half) at speed v [m/s].
   */
  step(pAxleFront: number, pAxleRear: number, v: number, dt: number): void;
  reset(startC: number): void;
}

export function createDiscPair(startC: number = DISC_START_DEFAULT_C): DiscPair {
  const spec = BRAKE_DISC_ILLUSTRATIVE;
  const out: DiscStepResult = { T: 0, qLoss: 0 };
  let tF = 0;
  let tR = 0;
  let eF = 0;
  let eR = 0;
  let lF = 0;
  let lR = 0;
  const pair: DiscPair = {
    get tFront() {
      return tF;
    },
    get tRear() {
      return tR;
    },
    get eFront() {
      return eF;
    },
    get eRear() {
      return eR;
    },
    get lossFront() {
      return lF;
    },
    get lossRear() {
      return lR;
    },
    step(pf, pr, v, dt) {
      const p1 = Math.max(0, pf) / 2;
      const p2 = Math.max(0, pr) / 2;
      discThermalStep(tF, p1, v, spec.front, spec.Tamb, dt, out);
      tF = out.T;
      lF += out.qLoss;
      eF += p1 * dt;
      discThermalStep(tR, p2, v, spec.rear, spec.Tamb, dt, out);
      tR = out.T;
      lR += out.qLoss;
      eR += p2 * dt;
    },
    reset(c) {
      tF = tR = celsiusToKelvin(c);
      eF = eR = lF = lR = 0;
    },
  };
  pair.reset(startC);
  return pair;
}
