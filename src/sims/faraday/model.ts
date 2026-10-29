/**
 * Pure, DOM-free model of the `faraday` simulator (testable in Node).
 *
 * Every physical formula comes from `src/physics` (§4.2); this file only adds the
 * kinematics of the two scenarios and the bookkeeping of the sampled history.
 *
 * Assumptions (also shown in the UI as "Modello semplificato"):
 *  - uniform field B, perpendicular to the rotation axis (rotating loop) or to the
 *    plane of the rails (moving bar);
 *  - rigid single-phase loop of N identical turns, flat area S, no resistance and
 *    no self-inductance (the induced current and its Lenz torque are not modelled:
 *    ω and v are imposed, i.e. an "ideal motor" keeps them constant);
 *  - the moving bar slides at constant speed and bounces elastically at the rail
 *    ends (instantaneous reversal of v).
 *
 * Orientation convention (docs/PHYSICS.md §2): Φ is measured along the loop normal
 * n̂; a positive emf circulates counter-clockwise seen from the tip of n̂.
 *
 * Time: the simulation advances in fixed steps of `dt` (= PHYSICS_DT = 1/240 s);
 * the time is `t = n·dt` with an integer step counter, so the state is
 * deterministic. The loop angle α (angle between n̂ and B) integrates dα/dt = ω:
 * with constant ω, α = ωt exactly (α(0) = 0, maximum flux at t = 0); when ω is
 * changed the angle stays continuous (α is re-anchored at the current step).
 */
import { emfFaraday, emfMotional, fluxUniform, PHYSICS_DT, rotatingLoop } from '../../physics';
import type { ParamsSchema } from '../../core/types';

/** All tunable parameters of the simulator (SI units). */
export interface FaradayParams {
  /** Magnetic field [T]. */
  B: number;
  /** Loop area [m²]. */
  S: number;
  /** Number of turns [-]. */
  N: number;
  /** Angular speed [rad/s]. */
  omega: number;
  /** Bar length (distance between the rails) [m]. */
  l: number;
  /** Bar speed [m/s]. */
  v: number;
}

/** Parameter schema (§4.3): ranges for classroom-sized values. */
export const params = {
  B: { min: 0.01, max: 1.5, step: 0.01, default: 0.5, unit: 'T', labelIT: 'Campo magnetico B' },
  S: {
    min: 0.001,
    max: 0.1,
    step: 0.001,
    default: 0.02,
    unit: 'm²',
    labelIT: 'Area della spira S',
  },
  N: { min: 1, max: 500, step: 1, default: 50, unit: 'spire', labelIT: 'Numero di spire N' },
  omega: {
    min: 0.5,
    max: 100,
    step: 0.1,
    default: 6.3,
    unit: 'rad/s',
    labelIT: 'Velocità angolare ω',
  },
  l: {
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.5,
    unit: 'm',
    labelIT: 'Lunghezza della sbarretta l',
  },
  v: {
    min: 0.1,
    max: 5,
    step: 0.1,
    default: 1,
    unit: 'm/s',
    labelIT: 'Velocità della sbarretta v',
  },
} satisfies ParamsSchema<FaradayParams>;

/** Default parameter values. */
export function defaultParams(): FaradayParams {
  return {
    B: params.B.default,
    S: params.S.default,
    N: params.N.default,
    omega: params.omega.default,
    l: params.l.default,
    v: params.v.default,
  };
}

/** The two scenarios: rotating N-turn loop (alternator) or bar sliding on rails. */
export type FaradayMode = 'rotating' | 'motional';

/** Rail geometry of the motional scenario: bar position x ∈ [X_MIN, X_MAX] [m]. */
export const X_MIN = 0.1;
export const X_MAX = 1.1;

/** Samples kept in the history (≥ the longest plot window / dt, see {@link plotWindow}). */
export const HISTORY_CAPACITY = 10_000;

/** Fixed-capacity time series (t, Φ, emf) with O(1) append. */
class History {
  readonly t = new Float64Array(HISTORY_CAPACITY);
  readonly phi = new Float64Array(HISTORY_CAPACITY);
  readonly emf = new Float64Array(HISTORY_CAPACITY);
  private head = 0;
  size = 0;

  push(t: number, phi: number, emf: number): void {
    const i = (this.head + this.size) % HISTORY_CAPACITY;
    this.t[i] = t;
    this.phi[i] = phi;
    this.emf[i] = emf;
    if (this.size < HISTORY_CAPACITY) this.size++;
    else this.head = (this.head + 1) % HISTORY_CAPACITY;
  }

  /** Physical index of the k-th most recent sample (k = 0 → newest). */
  idxFromEnd(k: number): number {
    return (this.head + this.size - 1 - k) % HISTORY_CAPACITY;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

/** Snapshot of the observable state (SI units, α in radians). */
export interface FaradayReadout {
  mode: FaradayMode;
  /** Simulated time [s]. */
  t: number;
  /** Flux through ONE turn [Wb] (rotating) or through the rail circuit [Wb]. */
  phi: number;
  /** Instantaneous emf of the whole coil / circuit [V] (signed, see convention). */
  emf: number;
  /** Rotating: angle α between n̂ and B, wrapped to [0, 2π) [rad]. */
  alpha: number;
  /** Rotating: V₀ = N·B·S·ω [V]. */
  V0: number;
  /** Rotating: frequency f = ω/2π [Hz]. */
  f: number;
  /** Rotating: period T = 2π/ω [s]. */
  period: number;
  /** Motional: bar position x [m]. */
  x: number;
  /** Motional: signed bar velocity dx/dt [m/s]. */
  vx: number;
  /** Motional: |f.e.m.| = B·l·v [V] (slide 8). */
  emfMotional: number;
  /** Motional: average emf −ΔΦ/Δt over the last step [V] (Faraday-Neumann, slide 8). */
  emfFromFlux: number;
}

/** Iterations of the bisection that locates Φ = 0 inside one step (dt / 2^40 ≈ 4·10⁻¹⁵ s). */
const BISECTION_ITERATIONS = 40;

/**
 * Deterministic simulation of the two Faraday scenarios.
 *
 * "Picco f.e.m." ({@link peakEmf}) is measured from the simulated samples, not
 * from the formula: it is the maximum |emf| over the last full period among
 *  (a) the samples at the end of every fixed step, and
 *  (b) the samples at the instants where the flux crosses zero inside a step,
 *      located numerically by bisection on Φ(t) (event detection, as ODE solvers
 *      do). The flux is zero exactly where it changes fastest, so these samples
 *      catch the crest of the emf that plain dt-sampling would cut: with dt only,
 *      the error is up to 1 − cos(ω·dt/2) ≈ (ω·dt)²/8 (≈ 2 % at ω = 100 rad/s).
 */
export class FaradaySim {
  readonly dt: number;
  private p: FaradayParams;
  private modeValue: FaradayMode;
  /** Integer step counter: t = n·dt. */
  private n = 0;
  // rotating: α(n) = alpha0 + ω·(n − n0)·dt
  private n0 = 0;
  private alpha0 = 0;
  // motional
  private xPos = X_MIN;
  private dir: 1 | -1 = 1;
  private lastEmfFromFlux = 0;
  // peak measurement window (reset whenever a parameter changes)
  private peakStartN = 0;
  /** Zero-crossing samples of |emf| as [t, |emf|] pairs (only the recent ones are kept). */
  private events: Array<[number, number]> = [];
  private readonly history = new History();

  constructor(p: FaradayParams = defaultParams(), mode: FaradayMode = 'rotating', dt = PHYSICS_DT) {
    this.dt = dt;
    this.p = { ...p };
    this.modeValue = mode;
    this.reset();
  }

  get mode(): FaradayMode {
    return this.modeValue;
  }

  get params(): Readonly<FaradayParams> {
    return this.p;
  }

  /** Current simulated time [s]. */
  get time(): number {
    return this.n * this.dt;
  }

  /** Back to t = 0, α = 0, bar at the start, empty history. */
  reset(): void {
    this.n = 0;
    this.n0 = 0;
    this.alpha0 = 0;
    this.xPos = X_MIN;
    this.dir = 1;
    this.lastEmfFromFlux = 0;
    this.history.clear();
    this.restartPeakWindow();
    this.recordSample();
  }

  setMode(mode: FaradayMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.reset();
  }

  /** Change parameters; keeps α and x continuous and restarts the peak measurement. */
  setParams(next: Partial<FaradayParams>): void {
    const merged = { ...this.p, ...next };
    if (merged.omega !== this.p.omega) {
      this.alpha0 = this.alphaAt(this.n);
      this.n0 = this.n;
    }
    this.p = merged;
    this.lastEmfFromFlux = this.motionalEmfInstant();
    this.restartPeakWindow();
  }

  /** Advance exactly one fixed step dt. */
  step(): void {
    if (this.modeValue === 'rotating') this.stepRotating();
    else this.stepMotional();
  }

  /** Observable state now. */
  readout(): FaradayReadout {
    const p = this.p;
    const rot = rotatingLoop(p.B, p.S, p.N, p.omega, this.effectiveTime(this.n * this.dt));
    const twoPi = 2 * Math.PI;
    const alphaRaw = this.alphaAt(this.n);
    const alpha = ((alphaRaw % twoPi) + twoPi) % twoPi;
    const motional = this.modeValue === 'motional';
    return {
      mode: this.modeValue,
      t: this.time,
      phi: motional ? this.motionalFlux(this.xPos) : rot.phi,
      emf: motional ? this.motionalEmfInstant() : rot.emf,
      alpha,
      V0: rot.V0,
      f: p.omega / twoPi,
      period: twoPi / p.omega,
      x: this.xPos,
      vx: this.dir * p.v,
      emfMotional: emfMotional(p.B, p.l, p.v),
      emfFromFlux: this.lastEmfFromFlux,
    };
  }

  /** Length of the measurement period [s]: T = 2π/ω, or one bar round trip 2·(X_MAX−X_MIN)/v. */
  measurePeriod(): number {
    return this.modeValue === 'rotating'
      ? (2 * Math.PI) / this.p.omega
      : (2 * (X_MAX - X_MIN)) / this.p.v;
  }

  /**
   * Measured peak |emf| over the last full period [V], or `null` while less than
   * one full period has been simulated since the last parameter change / reset.
   */
  peakEmf(): number | null {
    const T = this.measurePeriod();
    const now = this.time;
    const start = this.peakStartN * this.dt;
    if (now - start < T - 1e-12) return null;
    const from = now - T - 1e-12;
    let peak = 0;
    const h = this.history;
    for (let k = 0; k < h.size; k++) {
      const i = h.idxFromEnd(k);
      const ti = h.t[i] as number;
      if (ti < from || ti < start - 1e-12) break;
      peak = Math.max(peak, Math.abs(h.emf[i] as number));
    }
    for (const [te, e] of this.events)
      if (te >= from && te >= start - 1e-12) peak = Math.max(peak, e);
    return peak;
  }

  /**
   * Peak |emf| from the fixed-step samples only (no zero-crossing samples). Used by
   * the tests to document the sampling error the event samples remove.
   */
  peakEmfStepSamplesOnly(): number | null {
    if (this.peakEmf() === null) return null;
    const T = this.measurePeriod();
    const from = this.time - T - 1e-12;
    const start = this.peakStartN * this.dt - 1e-12;
    let peak = 0;
    const h = this.history;
    for (let k = 0; k < h.size; k++) {
      const i = h.idxFromEnd(k);
      const ti = h.t[i] as number;
      if (ti < from || ti < start) break;
      peak = Math.max(peak, Math.abs(h.emf[i] as number));
    }
    return peak;
  }

  /** Width of the scrolling plot window [s]: two periods / two round trips. */
  plotWindow(): number {
    return Math.min(2 * this.measurePeriod(), (HISTORY_CAPACITY - 1) * this.dt);
  }

  /**
   * Samples of the last `window` seconds, decimated to at most `maxPoints`
   * (chronological), for the Φ(t) and f.e.m.(t) plots.
   */
  trace(
    window: number = this.plotWindow(),
    maxPoints = 480,
    into?: { t: number[]; phi: number[]; emf: number[] },
  ): { t: number[]; phi: number[]; emf: number[] } {
    const h = this.history;
    const from = this.time - window - 1e-12;
    let count = 0;
    while (count < h.size && (h.t[h.idxFromEnd(count)] as number) >= from) count++;
    const stride = Math.max(1, Math.ceil(count / maxPoints));
    // `into`: reuse the caller's arrays (live plots, QA-038)
    const out = into ?? { t: [] as number[], phi: [] as number[], emf: [] as number[] };
    // Walk from the newest backwards so the newest sample is always included; write in
    // chronological order straight into the (possibly reused) arrays.
    const m = Math.ceil(count / stride);
    out.t.length = out.phi.length = out.emf.length = m;
    for (let j = 0; j < m; j++) {
      const i = h.idxFromEnd(j * stride);
      out.t[m - 1 - j] = h.t[i] as number;
      out.phi[m - 1 - j] = h.phi[i] as number;
      out.emf[m - 1 - j] = h.emf[i] as number;
    }
    return out;
  }

  // --- internals ---------------------------------------------------------------

  private restartPeakWindow(): void {
    this.peakStartN = this.n;
    this.events = [];
  }

  /** Loop angle α at step n [rad] (unwrapped). */
  private alphaAt(n: number): number {
    return this.alpha0 + this.p.omega * (n - this.n0) * this.dt;
  }

  /**
   * Time to pass to `rotatingLoop` so that ω·t equals the integrated angle
   * (identical to `t` while ω has never been changed).
   */
  private effectiveTime(t: number): number {
    return this.alpha0 / this.p.omega + (t - this.n0 * this.dt);
  }

  private rotAt(t: number): { phi: number; emf: number; V0: number } {
    const p = this.p;
    return rotatingLoop(p.B, p.S, p.N, p.omega, this.effectiveTime(t));
  }

  private stepRotating(): void {
    const t0 = this.n * this.dt;
    const phi0 = this.rotAt(t0).phi;
    this.n++;
    const t1 = this.n * this.dt;
    const phi1 = this.rotAt(t1).phi;
    // Event detection: Φ changes sign (or hits 0) inside the step.
    if ((phi0 > 0 && phi1 <= 0) || (phi0 < 0 && phi1 >= 0)) {
      let a = t0;
      let b = t1;
      let fa = phi0;
      for (let k = 0; k < BISECTION_ITERATIONS; k++) {
        const m = 0.5 * (a + b);
        const fm = this.rotAt(m).phi;
        if (fm === 0) {
          a = b = m;
          break;
        }
        if (fa > 0 === fm > 0) {
          a = m;
          fa = fm;
        } else {
          b = m;
        }
      }
      const tc = 0.5 * (a + b);
      this.events.push([tc, Math.abs(this.rotAt(tc).emf)]);
      this.pruneEvents();
    }
    this.recordSample();
  }

  private motionalFlux(x: number): number {
    return fluxUniform(this.p.B, this.p.l * x, 0);
  }

  /** Instantaneous emf of the rail circuit: −dΦ/dt = −B·l·(dx/dt). */
  private motionalEmfInstant(): number {
    const e = -emfMotional(this.p.B, this.p.l, this.dir * this.p.v);
    return e === 0 ? 0 : e;
  }

  private stepMotional(): void {
    const phi0 = this.motionalFlux(this.xPos);
    let x = this.xPos + this.dir * this.p.v * this.dt;
    // Elastic bounce at the rail ends (possibly several times for tiny rails).
    for (let guard = 0; guard < 8 && (x > X_MAX || x < X_MIN); guard++) {
      if (x > X_MAX) {
        x = 2 * X_MAX - x;
        this.dir = -1;
      } else if (x < X_MIN) {
        x = 2 * X_MIN - x;
        this.dir = 1;
      }
    }
    this.xPos = x;
    this.n++;
    this.lastEmfFromFlux = emfFaraday(this.motionalFlux(x) - phi0, this.dt);
    this.recordSample();
  }

  private pruneEvents(): void {
    const keepFrom = this.time - 2 * this.measurePeriod();
    if (this.events.length > 64) this.events = this.events.filter(([t]) => t >= keepFrom);
  }

  private recordSample(): void {
    const r =
      this.modeValue === 'rotating'
        ? this.rotAt(this.time)
        : { phi: this.motionalFlux(this.xPos), emf: this.motionalEmfInstant() };
    this.history.push(this.time, r.phi, r.emf);
  }
}
