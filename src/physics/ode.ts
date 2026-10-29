/**
 * Fixed-step numerical integration (§4.1: RK4, dt = 1/240 s).
 */

/** Right-hand side of an ODE system dy/dt = f(t, y). */
export type OdeRhs = (t: number, y: readonly number[]) => number[];

/**
 * Optional work buffers for {@link rk4Step} (QA-038): with them a step allocates
 * nothing itself (only `f` may). `out` receives the new state and is returned;
 * it may be the same array as `y` (in-place step).
 */
export interface Rk4Work {
  /** Intermediate state y + h·k (length n). */
  tmp: number[];
  /** Result y(t + dt) (length n); returned by `rk4Step`. */
  out: number[];
}

/** Work buffers for states of length `n`. */
export function createRk4Work(n: number): Rk4Work {
  return { tmp: new Array<number>(n).fill(0), out: new Array<number>(n).fill(0) };
}

/**
 * One classical fourth-order Runge-Kutta step for a vector state.
 *
 * k₁ = f(t, y);  k₂ = f(t + dt/2, y + dt/2·k₁);  k₃ = f(t + dt/2, y + dt/2·k₂);
 * k₄ = f(t + dt, y + dt·k₃);  y(t+dt) = y + dt/6 · (k₁ + 2k₂ + 2k₃ + k₄)
 *
 * Pure: never mutates `y` (always returns a new array) unless `work` is given,
 * in which case the result is written into `work.out` (which may alias `y`) and
 * that array is returned — same numbers, no allocation in the step itself.
 * Local error O(dt⁵), global error O(dt⁴). dt = 0 returns a copy of `y`;
 * dt < 0 integrates backwards. Use with dt = PHYSICS_DT (§4.1).
 *
 * @param f - derivative function; must return an array of the same length as `y`
 * @param t - current time [s]
 * @param y - current state vector
 * @param dt - step [s]
 * @param work - optional preallocated buffers ({@link createRk4Work})
 * @returns new state vector at t + dt (`work.out` when `work` is given)
 * @throws RangeError if dt or t is not finite, or if f returns a vector of the
 *   wrong length
 * @slide none (extension: numerical method used by the simulators)
 */
export function rk4Step(
  f: OdeRhs,
  t: number,
  y: readonly number[],
  dt: number,
  work?: Rk4Work,
): number[] {
  if (!Number.isFinite(t) || !Number.isFinite(dt)) {
    throw new RangeError(`rk4Step: t and dt must be finite (got t=${t}, dt=${dt})`);
  }
  const n = y.length;
  if (work) return rk4StepInto(f, t, y, dt, work);
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

/** {@link rk4Step} into preallocated buffers (same arithmetic, same checks). */
function rk4StepInto(
  f: OdeRhs,
  t: number,
  y: readonly number[],
  dt: number,
  work: Rk4Work,
): number[] {
  const n = y.length;
  const { tmp, out } = work;
  if (tmp.length !== n) tmp.length = n;
  if (out.length !== n) out.length = n;
  if (dt === 0) {
    for (let i = 0; i < n; i++) out[i] = y[i] as number;
    return out;
  }
  const eval_ = (tt: number, yy: readonly number[]): number[] => {
    const d = f(tt, yy);
    if (d.length !== n) {
      throw new RangeError(`rk4Step: f returned ${d.length} components, expected ${n}`);
    }
    return d;
  };
  const h2 = dt / 2;
  const k1 = eval_(t, y);
  for (let i = 0; i < n; i++) tmp[i] = (y[i] as number) + h2 * (k1[i] as number);
  const k2 = eval_(t + h2, tmp);
  for (let i = 0; i < n; i++) tmp[i] = (y[i] as number) + h2 * (k2[i] as number);
  const k3 = eval_(t + h2, tmp);
  for (let i = 0; i < n; i++) tmp[i] = (y[i] as number) + dt * (k3[i] as number);
  const k4 = eval_(t + dt, tmp);
  for (let i = 0; i < n; i++) {
    out[i] =
      (y[i] as number) +
      (dt / 6) *
        ((k1[i] as number) + 2 * (k2[i] as number) + 2 * (k3[i] as number) + (k4[i] as number));
  }
  return out;
}
