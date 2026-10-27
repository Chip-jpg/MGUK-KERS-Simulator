/**
 * Fixed-step numerical integration (§4.1: RK4, dt = 1/240 s).
 */

/** Right-hand side of an ODE system dy/dt = f(t, y). */
export type OdeRhs = (t: number, y: readonly number[]) => number[];

/**
 * One classical fourth-order Runge-Kutta step for a vector state.
 *
 * k₁ = f(t, y);  k₂ = f(t + dt/2, y + dt/2·k₁);  k₃ = f(t + dt/2, y + dt/2·k₂);
 * k₄ = f(t + dt, y + dt·k₃);  y(t+dt) = y + dt/6 · (k₁ + 2k₂ + 2k₃ + k₄)
 *
 * Pure: never mutates `y` (always returns a new array). Local error O(dt⁵),
 * global error O(dt⁴). dt = 0 returns a copy of `y`; dt < 0 integrates backwards.
 * Use with dt = PHYSICS_DT (§4.1).
 *
 * @param f - derivative function; must return an array of the same length as `y`
 * @param t - current time [s]
 * @param y - current state vector
 * @param dt - step [s]
 * @returns new state vector at t + dt
 * @throws RangeError if dt or t is not finite, or if f returns a vector of the
 *   wrong length
 * @slide none (extension: numerical method used by the simulators)
 */
export function rk4Step(f: OdeRhs, t: number, y: readonly number[], dt: number): number[] {
  if (!Number.isFinite(t) || !Number.isFinite(dt)) {
    throw new RangeError(`rk4Step: t and dt must be finite (got t=${t}, dt=${dt})`);
  }
  const n = y.length;
  if (dt === 0) return y.slice();
  const eval_ = (tt: number, yy: readonly number[]): number[] => {
    const d = f(tt, yy);
    if (d.length !== n) {
      throw new RangeError(`rk4Step: f returned ${d.length} components, expected ${n}`);
    }
    return d;
  };
  const axpy = (k: readonly number[], h: number): number[] =>
    y.map((yi, i) => yi + h * (k[i] as number));

  const h2 = dt / 2;
  const k1 = eval_(t, y);
  const k2 = eval_(t + h2, axpy(k1, h2));
  const k3 = eval_(t + h2, axpy(k2, h2));
  const k4 = eval_(t + dt, axpy(k3, dt));
  return y.map(
    (yi, i) =>
      yi +
      (dt / 6) *
        ((k1[i] as number) + 2 * (k2[i] as number) + 2 * (k3[i] as number) + (k4[i] as number)),
  );
}
