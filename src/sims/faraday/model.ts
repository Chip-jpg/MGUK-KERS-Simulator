/**
 * Pure rotating-coil simulator: uniform B, per-turn flux B*S*cos(alpha),
 * total emf N*B*S*omega*sin(alpha), fixed 1/240 s sampling and event-located
 * measured peaks. Angular speed is imposed; no coil self-inductance or Lenz
 * torque. Parameter changes preserve angle but restart the plotted trace.
 */
import { PHYSICS_DT, rotatingLoop } from '../../physics';
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
}

/** Parameter schema (§4.3): ranges for classroom-sized values. */
export const params = {
  B: { min: 0, max: 1.5, step: 0.01, default: 0.5, unit: 'T', labelIT: 'Campo magnetico B' },
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
    min: 0,
    max: 100,
    step: 0.1,
    default: 6.3,
    unit: 'rad/s',
    labelIT: 'Velocità angolare ω',
  },
} satisfies ParamsSchema<FaradayParams>;

/** Default parameter values. */
export function defaultParams(): FaradayParams {
  return {
    B: params.B.default,
    S: params.S.default,
    N: params.N.default,
    omega: params.omega.default,
  };
}

/** The rotating N-turn loop is the sole experiment (v0.7.0). */
export type FaradayMode = 'rotating';

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
}

/** Iterations of the bisection that locates Φ = 0 inside one step (dt / 2^40 ≈ 4·10⁻¹⁵ s). */
const BISECTION_ITERATIONS = 40;

/**
 * Deterministic rotating-coil simulation.
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

  /** Back to t = 0, α = 0, empty history. */
  reset(): void {
    this.n = 0;
    this.n0 = 0;
    this.alpha0 = 0;
    this.history.clear();
    this.restartPeakWindow();
    this.recordSample();
  }

  setMode(mode: FaradayMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.reset();
  }

  /** Change parameters; preserve α and restart trace/peak measurements. */
  setParams(next: Partial<FaradayParams>): void {
    const merged = { ...this.p, ...next };
    if (merged.omega !== this.p.omega) {
      this.alpha0 = this.alphaAt(this.n);
      this.n0 = this.n;
    }
    this.p = merged;
    this.restartPeakWindow();
    this.history.clear();
    this.recordSample();
  }

  /** Advance exactly one fixed step dt. */
  step(): void {
    this.stepRotating();
  }

  /** Observable state now. */
  readout(): FaradayReadout {
    const p = this.p;
    const rot = this.rotAt(this.time);
    const twoPi = 2 * Math.PI;
    const alphaRaw = this.alphaAt(this.n);
    const alpha = ((alphaRaw % twoPi) + twoPi) % twoPi;
    return {
      mode: this.modeValue,
      t: this.time,
      phi: rot.phi,
      emf: rot.emf,
      alpha,
      V0: rot.V0,
      f: p.omega / twoPi,
      period: twoPi / p.omega,
    };
  }

  /** Length of the measurement period [s]: T = 2π/ω (infinite for a stationary coil). */
  measurePeriod(): number {
    return this.p.omega === 0 ? Infinity : (2 * Math.PI) / this.p.omega;
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

  /** Width of the scrolling plot window [s]: two periods. */
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

  private rotAt(t: number): { phi: number; emf: number; V0: number } {
    const p = this.p;
    const angle = this.alpha0 + p.omega * (t - this.n0 * this.dt);
    const unit = rotatingLoop(p.B, p.S, p.N, 1, angle);
    return { phi: unit.phi, emf: unit.emf * p.omega, V0: unit.V0 * p.omega };
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

  private pruneEvents(): void {
    const keepFrom = this.time - 2 * this.measurePeriod();
    if (this.events.length > 64) this.events = this.events.filter(([t]) => t >= keepFrom);
  }

  private recordSample(): void {
    const r = this.rotAt(this.time);
    this.history.push(this.time, r.phi, r.emf);
  }
}
