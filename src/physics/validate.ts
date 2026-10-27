/**
 * Internal argument checks shared by the physics modules (not re-exported from
 * the public API). Every check throws {@link RangeError} naming the function and
 * the parameter.
 */

/** Throws unless `x` is a finite number. */
export function finite(fn: string, name: string, x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError(`${fn}: ${name} must be a finite number (got ${x})`);
  }
  return x;
}

/** Throws unless `x` is finite and ≥ 0. */
export function nonNegative(fn: string, name: string, x: number): number {
  finite(fn, name, x);
  if (x < 0) throw new RangeError(`${fn}: ${name} must be ≥ 0 (got ${x})`);
  return x;
}

/** Throws unless `x` is finite and > 0. */
export function positive(fn: string, name: string, x: number): number {
  finite(fn, name, x);
  if (x <= 0) throw new RangeError(`${fn}: ${name} must be > 0 (got ${x})`);
  return x;
}

/** Maps −0 to +0 so results compare cleanly with `Object.is` / `toBe(0)`. */
export function noNegZero(x: number): number {
  return x === 0 ? 0 : x;
}
