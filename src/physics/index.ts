/**
 * KERS Lab — physics core (public API).
 *
 * CONTRACT (frozen in task A0, see docs/ARCHITECTURE.md §4.2): names, parameter
 * names, optional parameters and return shapes of the §4.2 functions must not
 * change without an orchestrator-approved change request.
 *
 * Rules (§4.1): SI units everywhere (T, m, m², rad/s, V, A, Ω, H, J, W, kg, m/s);
 * degrees only at the UI boundary; pure functions, no global state, no clocks;
 * every export documents formula, units and `@slide N`.
 *
 * Formula ↔ slide ↔ validity map, sign conventions and the KERS model:
 * docs/PHYSICS.md. Invalid inputs throw `RangeError` (documented per function).
 */

export { NotImplementedError } from './errors';

// constants & unit conversions
export { PHYSICS_DT, MU_0, MU_0_SI2019, kmhToMs, msToKmh, degToRad, radToDeg } from './constants';

// flux & induction, Lenz
export {
  fluxUniform,
  emfFaraday,
  emfMotional,
  rotatingLoop,
  inducedCurrent,
  lenzSign,
} from './flux';

// inductance / RL / energy
export { solenoidInductance, emfSelf, rlTimeConstant, rlCurrent, magneticEnergy } from './rl';

// transformer & losses
export { transformerSecondary, transformerCurrent, jouleLoss, lineLoss } from './transformer';

// machine & vehicle
export { lorentzForce } from './machine';
export {
  KERS_TRACE_SAMPLES,
  kineticEnergyDelta,
  kersBrakingEvent,
  kersDissipationSplit,
} from './vehicle';

// numerical integration
export { rk4Step } from './ode';
export type { OdeRhs } from './ode';

import type { kersBrakingEvent } from './vehicle';
/** Input of {@link kersBrakingEvent}. */
export type KersBrakingParams = Parameters<typeof kersBrakingEvent>[0];
/** Output of {@link kersBrakingEvent}. */
export type KersBrakingResult = ReturnType<typeof kersBrakingEvent>;

// Car dynamics in a braking zone (Phase 4 extension)
export {
  G_STANDARD,
  AIR_DENSITY_STD,
  PACEJKA_ILLUSTRATIVE,
  DEFAULT_WEIGHT_FRONT,
  pacejkaFx,
  pacejkaPeakSlip,
  pacejkaSlipForRatio,
  aeroDrag,
  aeroDownforce,
  idealBrakeBalance,
  carBrakingForces,
  carBrakingStep,
  simulateBrakingZone,
} from './vehicle-dynamics';
export type {
  PacejkaCoeffs,
  PacejkaShape,
  CarModel,
  CarBrakingParams,
  BrakeLimit,
  MgukLimit,
  CarBrakingForces,
  CarBrakingState,
  CarBrakingSample,
  BrakingZoneResult,
} from './vehicle-dynamics';
