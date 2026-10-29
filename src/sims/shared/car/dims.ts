/**
 * Dimensions of the shared, ORIGINAL open-wheel single-seater (scene units = metres).
 * Proportions follow the order of magnitude of a current single-seater (wheelbase
 * equal to the car-dynamics model's L = 3,6 m, 720 mm tyres on 18" rims), but the
 * shape is abstract and not a copy of any real car. The car faces +x, the ground is
 * y = 0 and the origin is midway between the axles.
 */
export const CAR_DIMS = {
  /** Wheelbase [m] (= FIXED.L of car-dynamics). */
  wheelbase: 3.6,
  /** x of the front / rear axle [m]. */
  frontAxleX: 1.8,
  rearAxleX: -1.8,
  /** Lateral position of the tyre centres [m] (front / rear). */
  trackFront: 0.8,
  trackRear: 0.78,
  /** Tyre radius [m] (720 mm diameter). */
  tyreRadius: 0.36,
  /** Tyre width [m] (front / rear). */
  tyreWidthFront: 0.305,
  tyreWidthRear: 0.405,
  /** Rim radius [m] (18"). */
  rimRadius: 0.229,
  /** Brake discs: outer / inner radius and thickness [m] (front Ø 330, rear Ø 280). */
  discFront: { outer: 0.165, inner: 0.1, thickness: 0.032 },
  discRear: { outer: 0.14, inner: 0.088, thickness: 0.032 },
  /** Height of the floor's lower face at rest [m]. */
  rideHeight: 0.05,
  /** Overall length (front-wing tip to rear-wing trailing edge) [m]. */
  length: 5.55,
} as const;

/**
 * Visual pitch/heave from the axle loads (car-dynamics): illustrative axle spring
 * rates and the exaggeration applied in the scene (stated in the model note).
 */
export const SUSPENSION_ILLUSTRATIVE = {
  /** Vertical stiffness of the front / rear axle (both wheels) [N/m]. */
  kFront: 350e3,
  kRear: 300e3,
  /** Visual exaggeration factor of pitch and heave [–]. */
  exaggeration: 2.5,
  /** Largest visual drop of the front floor edge [m] (keeps the floor above the ground). */
  maxDrop: 0.045,
} as const;

/**
 * Ride from the axle loads: compression of each axle δ = ΔF_z / k (ΔF_z = load
 * minus the static load), pitch θ = (δ_f − δ_r)/L (nose down > 0), heave
 * (δ_f + δ_r)/2 (down > 0). Physical values, before the visual exaggeration.
 *
 * @param fzFront - front-axle load [N]
 * @param fzRear - rear-axle load [N]
 * @param staticFront - static front-axle load m·g·w_f [N]
 * @param staticRear - static rear-axle load [N]
 */
export function rideFromLoads(
  fzFront: number,
  fzRear: number,
  staticFront: number,
  staticRear: number,
): { pitch: number; heave: number; dFront: number; dRear: number } {
  const dFront = (fzFront - staticFront) / SUSPENSION_ILLUSTRATIVE.kFront;
  const dRear = (fzRear - staticRear) / SUSPENSION_ILLUSTRATIVE.kRear;
  return {
    pitch: Math.atan((dFront - dRear) / CAR_DIMS.wheelbase),
    heave: (dFront + dRear) / 2,
    dFront,
    dRear,
  };
}

/**
 * Visual pitch/heave (exaggerated, then limited so that the front of the floor never
 * touches the ground): returns [pitch rad, heave m].
 */
export function visualRide(pitch: number, heave: number): [number, number] {
  const k = SUSPENSION_ILLUSTRATIVE.exaggeration;
  let p = pitch * k;
  let h = heave * k;
  // drop of the floor's front edge (x ≈ 1,3 m) = h + p·1,3
  const drop = h + p * 1.3;
  const max = SUSPENSION_ILLUSTRATIVE.maxDrop;
  if (drop > max) {
    const s = max / drop;
    p *= s;
    h *= s;
  }
  return [p, h];
}
