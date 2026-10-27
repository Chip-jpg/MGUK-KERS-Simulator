/**
 * Electric machine: force on a current-carrying conductor (inverse principle of
 * induction, motor mode of the MGU-K).
 */
import { finite, noNegZero, nonNegative } from './validate';

/**
 * Force on a straight current-carrying conductor in a uniform field (inverse
 * principle of induction: electric motor). Magnitude-with-sign form of
 * F⃗ = I · L⃗ × B⃗.
 *
 * F = B · I · L · sin θ   (θ defaults to π/2, conductor ⟂ B)
 *
 * The sign follows the signs of B, I and sin θ; the direction in space is given
 * by the right-hand rule on L⃗ × B⃗.
 *
 * @param B - magnetic field [T]
 * @param I - current [A]
 * @param L - conductor length [m], ≥ 0
 * @param theta - angle between conductor and B [rad] (default π/2)
 * @returns force [N]
 * @throws RangeError if L < 0 or non-finite input
 * @slide none (extension: Lorentz force on a wire, "inverse principle of
 * induction" from the assignment sheet; not in the induction deck)
 */
export function lorentzForce(B: number, I: number, L: number, theta?: number): number {
  const fn = 'lorentzForce';
  finite(fn, 'B', B);
  finite(fn, 'I', I);
  nonNegative(fn, 'L', L);
  const th = finite(fn, 'theta', theta ?? Math.PI / 2);
  return noNegZero(B * I * L * Math.sin(th));
}
