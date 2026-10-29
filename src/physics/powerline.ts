/**
 * Overhead power line and transformer core (extension: visualisation of the
 * `joule-transformer` simulator, v0.6). Pure functions, SI units.
 *
 * - Catenary of a conductor hanging between two supports at the same height:
 *   y(x) = a·(cosh(x/a) − 1) above the lowest point, with a = H/w (horizontal
 *   tension / weight per unit length). Sag (freccia) f = a·(cosh(S/2a) − 1),
 *   conductor length ℓ = 2a·sinh(S/2a).
 * - Thermal elongation of the conductor ℓ(T) = ℓ₀·(1 + α·(T − T₀)) and the new
 *   catenary parameter that gives that length on the same span (inextensible
 *   conductor apart from the thermal strain: elastic stretch neglected, so the
 *   sag increase is an upper estimate).
 * - Peak flux in the core of an ideal transformer with sinusoidal voltage of RMS
 *   value V: V = 4,44·f·N·Φ̂ ⇒ Φ̂ = √2·V / (2π·f·N).
 */
import { finite, positive } from './validate';

/**
 * Sag of a catenary on a level span.
 *
 * f = a·(cosh(S / 2a) − 1)
 *
 * @param S - span between the supports [m], > 0
 * @param a - catenary parameter H/w [m], > 0
 * @returns sag below the supports at mid-span [m]
 * @throws RangeError for S ≤ 0 or a ≤ 0
 * @slide none (extension: visualisation)
 */
export function catenarySag(S: number, a: number): number {
  positive('catenarySag', 'S', S);
  positive('catenarySag', 'a', a);
  return a * (Math.cosh(S / (2 * a)) - 1);
}

/**
 * Height of the conductor BELOW the supports at abscissa x from the left
 * support (0 ≤ x ≤ S): d(x) = f − a·(cosh((x − S/2)/a) − 1), so d(0) = d(S) = 0
 * and d(S/2) = f.
 *
 * @param x - abscissa from the left support [m]
 * @param S - span [m], > 0
 * @param a - catenary parameter [m], > 0
 * @returns drop below the support line [m] (≥ 0 inside the span)
 * @throws RangeError for S ≤ 0, a ≤ 0 or non-finite x
 * @slide none (extension: visualisation)
 */
export function catenaryDrop(x: number, S: number, a: number): number {
  finite('catenaryDrop', 'x', x);
  const f = catenarySag(S, a);
  return f - a * (Math.cosh((x - S / 2) / a) - 1);
}

/**
 * Conductor length of a catenary on a level span: ℓ = 2a·sinh(S / 2a).
 *
 * @param S - span [m], > 0
 * @param a - catenary parameter [m], > 0
 * @returns length [m] (≥ S)
 * @throws RangeError for S ≤ 0 or a ≤ 0
 * @slide none (extension: visualisation)
 */
export function catenaryLength(S: number, a: number): number {
  positive('catenaryLength', 'S', S);
  positive('catenaryLength', 'a', a);
  return 2 * a * Math.sinh(S / (2 * a));
}

/**
 * Catenary parameter a such that a conductor of length ℓ hangs on a span S
 * (inverse of {@link catenaryLength}; bisection on ln a, monotonic: longer
 * conductor ⇒ smaller a ⇒ larger sag).
 *
 * @param S - span [m], > 0
 * @param length - conductor length [m], > S
 * @returns a [m]
 * @throws RangeError for S ≤ 0 or length ≤ S
 * @slide none (extension: visualisation)
 */
export function catenaryParameterForLength(S: number, length: number): number {
  positive('catenaryParameterForLength', 'S', S);
  finite('catenaryParameterForLength', 'length', length);
  if (!(length > S)) {
    throw new RangeError(`catenaryParameterForLength: length must be > S (got ${length} ≤ ${S})`);
  }
  // ℓ(a) decreases from ∞ (a → 0) to S (a → ∞)
  let lo = Math.log(S * 1e-3);
  let hi = Math.log(S * 1e9);
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi);
    if (catenaryLength(S, Math.exp(mid)) > length) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return Math.exp(0.5 * (lo + hi));
}

/**
 * Sag of a span after a uniform temperature change of the conductor: the
 * length grows by ℓ₀·α·ΔT (elastic stretch neglected) and the catenary
 * re-forms on the same span.
 *
 * @param S - span [m], > 0
 * @param a0 - catenary parameter at the reference temperature [m], > 0
 * @param alpha - linear thermal expansion coefficient [1/K], ≥ 0
 * @param dT - temperature rise above the reference [K] (may be < 0, as long as the
 *   conductor stays longer than the span)
 * @returns `{ a, sag, length }` at the new temperature [m]
 * @throws RangeError for invalid S, a0, alpha or a length ≤ S
 * @slide none (extension: visualisation)
 */
export function thermalSag(
  S: number,
  a0: number,
  alpha: number,
  dT: number,
): { a: number; sag: number; length: number } {
  finite('thermalSag', 'alpha', alpha);
  if (alpha < 0) throw new RangeError(`thermalSag: alpha must be ≥ 0 (got ${alpha})`);
  finite('thermalSag', 'dT', dT);
  const length = catenaryLength(S, a0) * (1 + alpha * dT);
  const a = catenaryParameterForLength(S, length);
  return { a, sag: catenarySag(S, a), length };
}

/**
 * Peak magnetic flux in the core of an ideal transformer winding fed with a
 * sinusoidal voltage of RMS value V at frequency f (Faraday: V = 4,44·f·N·Φ̂).
 *
 * Φ̂ = √2 · V / (2π · f · N)
 *
 * @param V - RMS voltage across the winding [V], ≥ 0
 * @param f - frequency [Hz], > 0
 * @param N - turns of the winding [-], > 0
 * @returns peak flux Φ̂ [Wb]
 * @throws RangeError for V < 0, f ≤ 0, N ≤ 0 or non-finite input
 * @slide none (extension: visualisation)
 */
export function coreFluxPeak(V: number, f: number, N: number): number {
  finite('coreFluxPeak', 'V', V);
  if (V < 0) throw new RangeError(`coreFluxPeak: V must be ≥ 0 (got ${V})`);
  positive('coreFluxPeak', 'f', f);
  positive('coreFluxPeak', 'N', N);
  return (Math.SQRT2 * V) / (2 * Math.PI * f * N);
}
