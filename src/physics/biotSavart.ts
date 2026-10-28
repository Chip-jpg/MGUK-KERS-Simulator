/**
 * Biot-Savart field of real (filamentary) coils — Phase 4 extension.
 *
 * The slides (s7, s14) use a uniform B and the long-solenoid result
 * B = μ₀ N I / l. This module computes the field of a finite coil numerically, by
 * splitting the wire into straight segments and summing the exact closed-form
 * field of each segment, so the app can show where the uniform-B idealisation
 * holds and where it fails (ends of a solenoid, outside a loop, fringe field).
 *
 * Model: thin wire (filament) carrying a steady current, vacuum (μ = μ₀, no
 * ferromagnetic material), magnetostatics. Coordinates in metres, B in tesla.
 * The coil axis is the z axis; a positive current circulates counter-clockwise
 * seen from +z, so B points along +z inside the coil.
 */
import { MU_0 } from './constants';
import { rk4Step } from './ode';
import { finite, noNegZero, positive } from './validate';

/** Point or vector in 3-D space, `[x, y, z]` (m for points, T for fields). */
export type Vec3 = readonly [number, number, number];

/** A wire path: consecutive points joined by straight segments (current flows from index 0 onwards). */
export type Polyline = readonly Vec3[];

/**
 * Default regularisation ("core") radius of the filament [m]: 0,5 mm, a typical
 * magnet-wire radius.
 *
 * @slide none (extension: Biot-Savart)
 */
export const WIRE_CORE_RADIUS = 5e-4;

const K = MU_0 / (4 * Math.PI);

function checkVec(fn: string, name: string, v: Vec3): void {
  if (v.length !== 3 || !v.every((c) => Number.isFinite(c))) {
    throw new RangeError(`${fn}: ${name} must be a finite [x, y, z] vector (got ${String(v)})`);
  }
}

/**
 * Field of one straight finite segment a → b carrying current I, accumulated into
 * `out` (no validation, no allocation: the hot loop of {@link fieldAt}).
 */
function addSegmentField(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
  kI: number,
  core2: number,
  out: number[],
): void {
  const lx = bx - ax;
  const ly = by - ay;
  const lz = bz - az;
  const r1x = px - ax;
  const r1y = py - ay;
  const r1z = pz - az;
  const r2x = px - bx;
  const r2y = py - by;
  const r2z = pz - bz;
  // c = L × r1 (|c| = |L| d, d = distance of p from the segment's line)
  const cx = ly * r1z - lz * r1y;
  const cy = lz * r1x - lx * r1z;
  const cz = lx * r1y - ly * r1x;
  const c2 = cx * cx + cy * cy + cz * cz;
  if (c2 === 0) return; // p on the segment's line: no contribution
  const l2 = lx * lx + ly * ly + lz * lz;
  const n1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
  const n2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
  // (L·r1)/|r1| − (L·r2)/|r2| = |L| (cos θ₁ − cos θ₂)
  const t1 = (lx * r1x + ly * r1y + lz * r1z) / n1;
  const t2 = (lx * r2x + ly * r2y + lz * r2z) / n2;
  const f = (kI * (t1 - t2)) / (c2 + l2 * core2);
  out[0] = (out[0] as number) + f * cx;
  out[1] = (out[1] as number) + f * cy;
  out[2] = (out[2] as number) + f * cz;
}

/**
 * Exact magnetic field of a straight finite segment a → b carrying a steady
 * current I (closed form of the Biot-Savart integral), at point p.
 *
 * B = (μ₀ I / 4π d) · (cos θ₁ − cos θ₂) · ê,   ê = (L × r₁)/|L × r₁|
 *
 * with L = b − a, r₁ = p − a, r₂ = p − b, d the distance of p from the line of
 * the segment, θ₁, θ₂ the angles between L and r₁, r₂. Implemented as
 * B = μ₀I/4π · (L × r₁) · (L·r₁/|r₁| − L·r₂/|r₂|) / (|L × r₁|² + |L|² r_c²).
 *
 * **Regularisation:** the 1/d singularity on the wire is smoothed by the core
 * radius r_c (d² → d² + r_c²). For d ≫ r_c the result is exact (relative error
 * r_c²/d²); on the wire's line (d = 0) the segment contributes 0 and the result
 * is always finite. Points on the line beyond the segment correctly give 0.
 *
 * @param a - segment start [m]
 * @param b - segment end [m] (current flows a → b)
 * @param p - field point [m]
 * @param I - current [A] (signed)
 * @param core - regularisation radius r_c [m], ≥ 0 (default {@link WIRE_CORE_RADIUS})
 * @returns B [T] as `[Bx, By, Bz]`
 * @throws RangeError on non-finite input or core < 0
 * @slide none (extension: Biot-Savart)
 */
export function biotSavartSegment(
  a: Vec3,
  b: Vec3,
  p: Vec3,
  I: number,
  core: number = WIRE_CORE_RADIUS,
): [number, number, number] {
  const fn = 'biotSavartSegment';
  checkVec(fn, 'a', a);
  checkVec(fn, 'b', b);
  checkVec(fn, 'p', p);
  finite(fn, 'I', I);
  finite(fn, 'core', core);
  if (core < 0) throw new RangeError(`${fn}: core must be ≥ 0 (got ${core})`);
  const out = [0, 0, 0];
  addSegmentField(a[0], a[1], a[2], b[0], b[1], b[2], p[0], p[1], p[2], K * I, core * core, out);
  return [noNegZero(out[0] as number), noNegZero(out[1] as number), noNegZero(out[2] as number)];
}

/** Geometry request for {@link coilPolyline}. */
export interface CoilSpec {
  /** `loop` = N coincident circular turns; `solenoid` = helix; `helmholtz` = two coaxial loops. */
  kind: 'loop' | 'solenoid' | 'helmholtz';
  /** Coil radius [m], > 0. */
  R: number;
  /** Turns (per loop for Helmholtz), positive integer. */
  N: number;
  /** Solenoid length [m], > 0 (required for `solenoid`). */
  length?: number;
  /** Distance between the two Helmholtz loops [m], > 0 (default R: the Helmholtz condition). */
  separation?: number;
  /** Straight segments per turn, integer ≥ 3. */
  segmentsPerTurn: number;
}

function ring(R: number, z: number, turns: number, spt: number, out: Vec3[]): void {
  for (let k = 0; k <= turns * spt; k++) {
    const a = (2 * Math.PI * k) / spt;
    out.push([R * Math.cos(a), R * Math.sin(a), z]);
  }
}

/**
 * Builds the wire path of a coil as a polyline (vertices on the ideal curve, so
 * each turn is a regular inscribed polygon). Axis = z, centre = origin, current
 * counter-clockwise seen from +z for I > 0.
 *
 * - `loop`: one circle of radius R in the plane z = 0, traced N times
 *   (N·segmentsPerTurn + 1 points, first = last).
 * - `solenoid`: helix of N turns from z = −l/2 to z = +l/2,
 *   (R cos φ, R sin φ, −l/2 + l·φ/(2πN)); open path (the leads are not modelled,
 *   so the helix also carries the small axial current component of a real coil).
 * - `helmholtz`: two coaxial loops of N turns at z = ∓s/2 (s = separation,
 *   default R). They are joined by a straight lead traversed once up and once
 *   back down, whose two contributions cancel exactly (like a twisted pair), so
 *   the polyline is one continuous closed path.
 *
 * @param spec - geometry, see {@link CoilSpec} (lengths in m)
 * @returns polyline vertices [m]
 * @throws RangeError if R, length or separation ≤ 0, N or segmentsPerTurn are
 *   not integers in range, or `length` is missing for a solenoid
 * @slide none (extension: Biot-Savart)
 */
export function coilPolyline(spec: CoilSpec): Vec3[] {
  const fn = 'coilPolyline';
  const R = positive(fn, 'R', spec.R);
  const N = spec.N;
  const spt = spec.segmentsPerTurn;
  if (!Number.isInteger(N) || N < 1) {
    throw new RangeError(`${fn}: N must be an integer ≥ 1 (got ${N})`);
  }
  if (!Number.isInteger(spt) || spt < 3) {
    throw new RangeError(`${fn}: segmentsPerTurn must be an integer ≥ 3 (got ${spt})`);
  }
  const pts: Vec3[] = [];
  switch (spec.kind) {
    case 'loop':
      ring(R, 0, N, spt, pts);
      return pts;
    case 'solenoid': {
      const l = positive(fn, 'length', spec.length ?? Number.NaN);
      const n = N * spt;
      for (let k = 0; k <= n; k++) {
        const a = (2 * Math.PI * k) / spt;
        pts.push([R * Math.cos(a), R * Math.sin(a), -l / 2 + (l * k) / n]);
      }
      return pts;
    }
    case 'helmholtz': {
      const s = positive(fn, 'separation', spec.separation ?? R);
      ring(R, -s / 2, N, spt, pts);
      ring(R, s / 2, N, spt, pts); // (R, 0, −s/2) → (R, 0, +s/2): straight lead up
      pts.push([R, 0, -s / 2]); // lead back down (cancels the lead up)
      return pts;
    }
    default:
      throw new RangeError(`${fn}: unknown kind '${String((spec as { kind: unknown }).kind)}'`);
  }
}

/**
 * A fast field evaluator for one polyline (vertices copied to a Float64Array).
 * `field(x, y, z, out)` writes B [T] into `out` and returns it.
 */
export interface FieldEvaluator {
  field(x: number, y: number, z: number, out: number[]): number[];
  /** Number of straight segments. */
  readonly segments: number;
}

/**
 * Prepares a reusable Biot-Savart evaluator (no per-call allocation) for a
 * polyline carrying current I; same physics as {@link fieldAt}.
 *
 * @param polyline - wire path [m], ≥ 2 points
 * @param I - current [A]
 * @param core - regularisation radius [m] (default {@link WIRE_CORE_RADIUS})
 * @returns evaluator; `field(x, y, z, out)` → B [T]
 * @throws RangeError if the polyline has < 2 points, or on non-finite input
 * @slide none (extension: Biot-Savart)
 */
export function createFieldEvaluator(
  polyline: Polyline,
  I: number,
  core: number = WIRE_CORE_RADIUS,
): FieldEvaluator {
  const fn = 'createFieldEvaluator';
  if (polyline.length < 2) {
    throw new RangeError(`${fn}: polyline needs at least 2 points (got ${polyline.length})`);
  }
  finite(fn, 'I', I);
  finite(fn, 'core', core);
  if (core < 0) throw new RangeError(`${fn}: core must be ≥ 0 (got ${core})`);
  const v = new Float64Array(polyline.length * 3);
  polyline.forEach((q, i) => {
    checkVec(fn, `polyline[${i}]`, q);
    v[3 * i] = q[0];
    v[3 * i + 1] = q[1];
    v[3 * i + 2] = q[2];
  });
  const kI = K * I;
  const core2 = core * core;
  const n = polyline.length - 1;
  return {
    segments: n,
    field(x, y, z, out) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      if (kI === 0) return out;
      for (let i = 0; i < n; i++) {
        const j = 3 * i;
        addSegmentField(
          v[j] as number,
          v[j + 1] as number,
          v[j + 2] as number,
          v[j + 3] as number,
          v[j + 4] as number,
          v[j + 5] as number,
          x,
          y,
          z,
          kI,
          core2,
          out,
        );
      }
      return out;
    },
  };
}

/**
 * Magnetic field of a polyline wire at point p: sum of the exact fields of its
 * straight segments ({@link biotSavartSegment}).
 *
 * B(p) = Σᵢ B_segment(Pᵢ → Pᵢ₊₁, p, I)
 *
 * @param polyline - wire path [m], ≥ 2 points (e.g. from {@link coilPolyline})
 * @param I - current [A]; I = 0 ⇒ B = 0
 * @param p - field point [m]
 * @param core - regularisation radius [m] (default {@link WIRE_CORE_RADIUS})
 * @returns B [T] as `[Bx, By, Bz]` (finite everywhere, also on the wire)
 * @throws RangeError if the polyline has < 2 points, or on non-finite input
 * @slide none (extension: Biot-Savart)
 */
export function fieldAt(
  polyline: Polyline,
  I: number,
  p: Vec3,
  core: number = WIRE_CORE_RADIUS,
): [number, number, number] {
  checkVec('fieldAt', 'p', p);
  const out = createFieldEvaluator(polyline, I, core).field(p[0], p[1], p[2], [0, 0, 0]);
  return [noNegZero(out[0] as number), noNegZero(out[1] as number), noNegZero(out[2] as number)];
}

/**
 * Analytic on-axis field of one circular loop (validation reference).
 *
 * B_z(z) = μ₀ I R² / (2 (R² + z²)^{3/2})   (centre: B = μ₀ I / 2R)
 *
 * @param R - loop radius [m], > 0
 * @param I - current [A] (signed; multiply by N for N coincident turns)
 * @param z - axial distance from the loop plane [m]
 * @returns B_z [T]
 * @throws RangeError if R ≤ 0 or non-finite input
 * @slide none (extension: Biot-Savart)
 */
export function fieldOnAxisLoop(R: number, I: number, z: number): number {
  const fn = 'fieldOnAxisLoop';
  positive(fn, 'R', R);
  finite(fn, 'I', I);
  finite(fn, 'z', z);
  return noNegZero((MU_0 * I * R * R) / (2 * Math.pow(R * R + z * z, 1.5)));
}

/**
 * Field inside an ideal (infinitely long) solenoid — the slide idealisation.
 *
 * B = μ₀ N I / l   (uniform inside, zero outside; consistent with L = μ₀N²S/l)
 *
 * @param N - turns [-], ≥ 0
 * @param l - length [m], > 0
 * @param I - current [A]
 * @returns B [T]
 * @throws RangeError if l ≤ 0, N < 0 or non-finite input
 * @slide 14
 */
export function fieldInfiniteSolenoid(N: number, l: number, I: number): number {
  const fn = 'fieldInfiniteSolenoid';
  finite(fn, 'N', N);
  if (N < 0) throw new RangeError(`${fn}: N must be ≥ 0 (got ${N})`);
  positive(fn, 'l', l);
  finite(fn, 'I', I);
  return noNegZero((MU_0 * N * I) / l);
}

/**
 * Analytic on-axis field of a finite solenoid modelled as a uniform current
 * sheet (N turns spread evenly over length l, centred at z = 0).
 *
 * B_z(z) = (μ₀ N I / 2l) · [ (z + l/2)/√((z + l/2)² + R²) − (z − l/2)/√((z − l/2)² + R²) ]
 *
 * Tends to μ₀NI/l at the centre when l ≫ R and to half of it at the ends.
 *
 * @param N - turns [-], ≥ 0
 * @param l - length [m], > 0
 * @param R - radius [m], > 0
 * @param I - current [A]
 * @param z - axial position [m]
 * @returns B_z [T]
 * @throws RangeError if l ≤ 0, R ≤ 0, N < 0 or non-finite input
 * @slide 14
 */
export function fieldOnAxisFiniteSolenoid(
  N: number,
  l: number,
  R: number,
  I: number,
  z: number,
): number {
  const fn = 'fieldOnAxisFiniteSolenoid';
  const ideal = fieldInfiniteSolenoid(N, l, I);
  positive(fn, 'R', R);
  finite(fn, 'z', z);
  const u = z + l / 2;
  const w = z - l / 2;
  return noNegZero((ideal / 2) * (u / Math.hypot(u, R) - w / Math.hypot(w, R)));
}

/**
 * Shortest distance from p to a polyline (e.g. "is this point on the wire?").
 *
 * @param polyline - path [m], ≥ 1 point
 * @param p - point [m]
 * @returns distance [m]
 * @throws RangeError on an empty polyline or non-finite input
 * @slide none (extension: Biot-Savart)
 */
export function distanceToPolyline(polyline: Polyline, p: Vec3): number {
  const fn = 'distanceToPolyline';
  checkVec(fn, 'p', p);
  const first = polyline[0];
  if (!first) throw new RangeError(`${fn}: polyline is empty`);
  let best = Math.hypot(p[0] - first[0], p[1] - first[1], p[2] - first[2]);
  for (let i = 0; i + 1 < polyline.length; i++) {
    const a = polyline[i] as Vec3;
    const b = polyline[i + 1] as Vec3;
    const lx = b[0] - a[0];
    const ly = b[1] - a[1];
    const lz = b[2] - a[2];
    const l2 = lx * lx + ly * ly + lz * lz;
    const t =
      l2 === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((p[0] - a[0]) * lx + (p[1] - a[1]) * ly + (p[2] - a[2]) * lz) / l2),
          );
    const d = Math.hypot(p[0] - a[0] - t * lx, p[1] - a[1] - t * ly, p[2] - a[2] - t * lz);
    if (d < best) best = d;
  }
  return best;
}

/** Axis-aligned box [m] that bounds a field-line trace. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Options of {@link traceFieldLine}. */
export interface TraceOptions {
  /** Arc-length step h [m], > 0 (RK4 on the unit field direction). */
  step: number;
  /** Maximum number of steps, integer ≥ 1. */
  maxSteps: number;
  /** Stop when the line leaves this box. */
  bounds: Bounds;
  /** +1 follows B, −1 traces against B. Default +1. */
  direction?: 1 | -1;
  /** Stop when this returns true (e.g. closer than a few wire radii to the coil). */
  nearWire?: (p: Vec3) => boolean;
  /**
   * Closure tolerance [m]: the line is "closed" when it comes back within this
   * distance of the seed after travelling at least 4·tolerance + 4·step. Default 0,75·step.
   */
  closeTolerance?: number;
  /** |B| below this [T] counts as a null point (direction undefined). Default 1e-15 T. */
  minField?: number;
}

/** Why {@link traceFieldLine} stopped. */
export type TraceStop = 'closed' | 'bounds' | 'nearWire' | 'nullField' | 'maxSteps';

/** Result of {@link traceFieldLine}. */
export interface FieldLine {
  /** Points of the line [m], starting at the seed (closed lines end on the seed). */
  points: Vec3[];
  /** |B| at each point [T]. */
  magnitude: number[];
  /** Arc length travelled [m]. */
  length: number;
  stop: TraceStop;
}

/** Field function for {@link traceFieldLine}: B [T] at point p [m]. */
export type FieldFn = (p: Vec3) => Vec3;

const inBox = (p: Vec3, b: Bounds): boolean =>
  p[0] >= b.min[0] &&
  p[0] <= b.max[0] &&
  p[1] >= b.min[1] &&
  p[1] <= b.max[1] &&
  p[2] >= b.min[2] &&
  p[2] <= b.max[2];

/**
 * Traces a magnetic field line from `seed` by integrating dr/ds = ±B̂(r) (unit
 * field direction, s = arc length) with fixed-step RK4 ({@link rk4Step}).
 *
 * Stops when the line closes on the seed (`closed`, the seed is appended), leaves
 * `bounds`, gets near the wire (`nearWire`), meets a null of the field
 * (`nullField`) or after `maxSteps`. Field lines of B are closed or leave every
 * bounded box (∇·B = 0); with step h the closure error is O(h⁴) per unit length.
 *
 * @param fieldFn - B(p) [T]
 * @param seed - starting point [m]
 * @param opts - see {@link TraceOptions}
 * @returns points, |B| per point, arc length and stop reason
 * @throws RangeError if step ≤ 0, maxSteps is not an integer ≥ 1, or the seed is
 *   not finite
 * @slide none (extension: Biot-Savart, numerical method RK4)
 */
export function traceFieldLine(fieldFn: FieldFn, seed: Vec3, opts: TraceOptions): FieldLine {
  const fn = 'traceFieldLine';
  checkVec(fn, 'seed', seed);
  const h = positive(fn, 'step', opts.step);
  if (!Number.isInteger(opts.maxSteps) || opts.maxSteps < 1) {
    throw new RangeError(`${fn}: maxSteps must be an integer ≥ 1 (got ${opts.maxSteps})`);
  }
  const dir = opts.direction ?? 1;
  const tol = opts.closeTolerance ?? 0.75 * h;
  const minField = opts.minField ?? 1e-15;
  const minTravel = 4 * tol + 4 * h;

  // One-entry cache: |B| at a new point and k₁ of the next RK4 step share one evaluation.
  let cx = Number.NaN;
  let cy = Number.NaN;
  let cz = Number.NaN;
  let cB: Vec3 = [0, 0, 0];
  const field = (x: number, y: number, z: number): Vec3 => {
    if (x !== cx || y !== cy || z !== cz) {
      cB = fieldFn([x, y, z]);
      cx = x;
      cy = y;
      cz = z;
    }
    return cB;
  };
  let nullHit = false;
  const rhs = (_s: number, y: readonly number[]): number[] => {
    const B = field(y[0] as number, y[1] as number, y[2] as number);
    const m = Math.hypot(B[0], B[1], B[2]);
    if (!(m > minField) || !Number.isFinite(m)) {
      nullHit = true;
      return [0, 0, 0];
    }
    return [(dir * B[0]) / m, (dir * B[1]) / m, (dir * B[2]) / m];
  };
  const mag = (p: Vec3): number => {
    const B = field(p[0], p[1], p[2]);
    return Math.hypot(B[0], B[1], B[2]);
  };

  const points: Vec3[] = [seed];
  const magnitude: number[] = [mag(seed)];
  let length = 0;
  let stop: TraceStop = 'maxSteps';
  if (!((magnitude[0] as number) > minField)) {
    return { points, magnitude, length, stop: 'nullField' };
  }
  let y: Vec3 = seed;
  for (let k = 0; k < opts.maxSteps; k++) {
    const next = rk4Step(rhs, length, y, h);
    if (nullHit) {
      stop = 'nullField';
      break;
    }
    const p: Vec3 = [next[0] as number, next[1] as number, next[2] as number];
    length += h;
    if (length >= minTravel) {
      const dSeed = Math.hypot(p[0] - seed[0], p[1] - seed[1], p[2] - seed[2]);
      if (dSeed <= tol) {
        points.push(seed);
        magnitude.push(magnitude[0] as number);
        length += Math.hypot(seed[0] - y[0], seed[1] - y[1], seed[2] - y[2]) - h;
        stop = 'closed';
        break;
      }
    }
    points.push(p);
    magnitude.push(mag(p));
    y = p;
    if (!inBox(p, opts.bounds)) {
      stop = 'bounds';
      break;
    }
    if (opts.nearWire?.(p)) {
      stop = 'nearWire';
      break;
    }
  }
  return { points, magnitude, length, stop };
}
