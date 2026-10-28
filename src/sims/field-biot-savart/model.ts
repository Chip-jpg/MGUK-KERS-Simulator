/**
 * Pure model of `field-biot-savart` (DOM-free; runs in the Web Worker and in
 * Node tests). Composes `src/physics/biotSavart` functions only.
 *
 * Assumptions:
 * - filamentary wire, steady current, vacuum (no ferromagnetic material);
 * - coil axis = z, centre = origin; positive I circulates counter-clockwise seen
 *   from +z, so B points along +z inside the coil;
 * - `loop` and `helmholtz`: N coincident turns are computed as ONE turn carrying
 *   N·I (exactly equivalent for coincident turns, N times cheaper);
 * - `solenoid`: the real helix with N turns (pitch l/N), leads not modelled;
 * - field lines are traced in the meridian plane x = 0 (seeds on the mid-plane
 *   z = 0, inside the coil), with RK4 on the unit field direction.
 */
import {
  MU_0,
  coilPolyline,
  createFieldEvaluator,
  fieldInfiniteSolenoid,
  fieldOnAxisFiniteSolenoid,
  fieldOnAxisLoop,
  solenoidInductance,
  traceFieldLine,
  type Bounds,
  type FieldEvaluator,
  type TraceStop,
  type Vec3,
} from '../../physics';
import type { BiotParams, Geometry } from './params';

/** Straight segments per turn used by the simulator. */
export const SEGMENTS_PER_TURN = { loop: 96, helmholtz: 96, solenoid: 36 } as const;
/** Samples of the on-axis profile B_z(z). */
export const AXIS_SAMPLES = 121;
/** Field-line steps per half box (sets the RK4 arc-length step). */
const STEPS_PER_HALF_BOX = 120;
const MAX_STEPS = 3000;
/** Lines stop closer than this fraction of R to the wire. */
const WIRE_CLEARANCE = 0.06;

/** Everything the worker needs (structured-clone friendly). */
export interface FieldRequest extends BiotParams {
  geometry: Geometry;
}

export interface CoilSetup {
  geometry: Geometry;
  /** Wire path used for the field [m]. */
  polyline: Vec3[];
  /** Current carried by `polyline` [A] (N·I for loop / Helmholtz). */
  current: number;
  /** Paths to draw (no leads) [m]. */
  displayPaths: Vec3[][];
  /** Tracing box [m]. */
  bounds: Bounds;
  /** RK4 arc-length step [m]. */
  step: number;
  /** Half extents of the box [m]. */
  zHalf: number;
  rhoHalf: number;
}

/** Build the coil and the tracing box for a request. */
export function coilSetup(r: FieldRequest): CoilSetup {
  const { R, N, I } = r;
  const spt = SEGMENTS_PER_TURN[r.geometry];
  let polyline: Vec3[];
  let current = I;
  let displayPaths: Vec3[][];
  let zHalf: number;
  switch (r.geometry) {
    case 'loop':
      polyline = coilPolyline({ kind: 'loop', R, N: 1, segmentsPerTurn: spt });
      current = N * I;
      displayPaths = [polyline];
      zHalf = 2.4 * R;
      break;
    case 'helmholtz': {
      polyline = coilPolyline({ kind: 'helmholtz', R, N: 1, segmentsPerTurn: spt });
      current = N * I;
      const ringLen = spt + 1;
      displayPaths = [polyline.slice(0, ringLen), polyline.slice(ringLen, 2 * ringLen)];
      zHalf = 2.6 * R;
      break;
    }
    case 'solenoid':
      polyline = coilPolyline({ kind: 'solenoid', R, N, length: r.l, segmentsPerTurn: spt });
      displayPaths = [polyline];
      zHalf = r.l / 2 + 1.6 * R;
      break;
  }
  const rhoHalf = Math.max(2 * R, 0.5 * zHalf);
  const bounds: Bounds = { min: [-rhoHalf, -rhoHalf, -zHalf], max: [rhoHalf, rhoHalf, zHalf] };
  const step = Math.max(zHalf, rhoHalf) / STEPS_PER_HALF_BOX;
  return { geometry: r.geometry, polyline, current, displayPaths, bounds, step, zHalf, rhoHalf };
}

/**
 * Cheap analytic "too close to the wire" test (the coil is a circle, two circles
 * or, for the solenoid, the winding cylinder ρ = R, |z| ≤ l/2).
 */
export function nearWire(r: FieldRequest, p: Vec3): boolean {
  const rho = Math.hypot(p[0], p[1]);
  const clear = WIRE_CLEARANCE * r.R;
  const dRing = (z0: number): number => Math.hypot(rho - r.R, p[2] - z0);
  switch (r.geometry) {
    case 'loop':
      return dRing(0) < clear;
    case 'helmholtz':
      return dRing(-r.R / 2) < clear || dRing(r.R / 2) < clear;
    case 'solenoid': {
      const h = r.l / 2;
      return Math.abs(p[2]) <= h ? Math.abs(rho - r.R) < clear : dRing(Math.sign(p[2]) * h) < clear;
    }
  }
}

/** Analytic on-axis B_z [T] of the same geometry (thin loops / current sheet). */
export function analyticAxis(r: FieldRequest, z: number): number {
  switch (r.geometry) {
    case 'loop':
      return r.N * fieldOnAxisLoop(r.R, r.I, z);
    case 'helmholtz':
      return (
        r.N * (fieldOnAxisLoop(r.R, r.I, z - r.R / 2) + fieldOnAxisLoop(r.R, r.I, z + r.R / 2))
      );
    case 'solenoid':
      return fieldOnAxisFiniteSolenoid(r.N, r.l, r.R, r.I, z);
  }
}

/** Ideal solenoid (slide 14): μ₀NI/l inside (|z| ≤ l/2), 0 outside [T]. */
export function idealSolenoidAxis(r: FieldRequest, z: number): number {
  return Math.abs(z) <= r.l / 2 ? fieldInfiniteSolenoid(r.N, r.l, r.I) : 0;
}

/** Reference ("textbook") field at the centre for each geometry [T]. */
export function referenceCentre(r: FieldRequest): number {
  switch (r.geometry) {
    case 'loop':
      return (MU_0 * r.N * r.I) / (2 * r.R);
    case 'helmholtz':
      return (Math.pow(0.8, 1.5) * MU_0 * r.N * r.I) / r.R;
    case 'solenoid':
      return fieldInfiniteSolenoid(r.N, r.l, r.I);
  }
}

/** Ideal-solenoid inductance L = μ₀N²S/l with S = πR² [H] (slide 14). */
export function idealInductance(r: Pick<BiotParams, 'N' | 'R' | 'l'>): number {
  return solenoidInductance(r.N, Math.PI * r.R * r.R, r.l);
}

/** Relative difference (a − b)/b; 0 when b = 0. */
export function relDiff(a: number, b: number): number {
  return b === 0 ? 0 : (a - b) / b;
}

export interface AxisProfile {
  z: Float64Array;
  /** Numeric (Biot-Savart) B_z on the axis [T]. */
  bz: Float64Array;
  /** Numeric B at the centre [T]. */
  centre: [number, number, number];
}

export function evaluator(s: CoilSetup): FieldEvaluator {
  return createFieldEvaluator(s.polyline, s.current);
}

/** Numeric on-axis profile over the tracing box. */
export function axisProfile(s: CoilSetup, ev: FieldEvaluator, n = AXIS_SAMPLES): AxisProfile {
  const z = new Float64Array(n);
  const bz = new Float64Array(n);
  const out = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const zk = -s.zHalf + (2 * s.zHalf * k) / (n - 1);
    z[k] = zk;
    bz[k] = ev.field(0, 0, zk, out)[2] as number;
  }
  const c = ev.field(0, 0, 0, [0, 0, 0]);
  return { z, bz, centre: [c[0] as number, c[1] as number, c[2] as number] };
}

/** Seeds on the mid-plane z = 0, inside the coil, on both sides of the axis (plane x = 0). */
export function seeds(r: FieldRequest): Vec3[] {
  const K = Math.max(1, Math.round(r.lines / 2));
  // Solenoid: stay away from the winding, where the field leaks between turns.
  const span = r.geometry === 'solenoid' ? 0.8 : 0.9;
  const out: Vec3[] = [];
  for (let k = 0; k < K; k++) {
    const rho = (span * r.R * (k + 0.5)) / K;
    out.push([0, rho, 0], [0, -rho, 0]);
  }
  return out;
}

export interface TracedLine {
  /** xyz of each point [m]. */
  points: Float32Array;
  /** |B| at each point [T]. */
  magnitude: Float32Array;
  /** Stop reason of each end ('closed' for closed loops). */
  stop: [TraceStop, TraceStop];
  closed: boolean;
}

/**
 * Trace one line through `seed`: forward along B; if it does not close, also
 * backwards, joined so that the points always run in the direction of B.
 */
export function traceLine(
  r: FieldRequest,
  s: CoilSetup,
  ev: FieldEvaluator,
  seed: Vec3,
): TracedLine {
  const buf = [0, 0, 0];
  const fieldFn = (p: Vec3): Vec3 => {
    ev.field(p[0], p[1], p[2], buf);
    return [buf[0] as number, buf[1] as number, buf[2] as number];
  };
  const opts = {
    step: s.step,
    maxSteps: MAX_STEPS,
    bounds: s.bounds,
    nearWire: (p: Vec3) => nearWire(r, p),
  };
  const fwd = traceFieldLine(fieldFn, seed, opts);
  let pts = fwd.points;
  let mags = fwd.magnitude;
  let backStop: TraceStop = 'closed';
  if (fwd.stop !== 'closed') {
    const back = traceFieldLine(fieldFn, seed, { ...opts, direction: -1 });
    backStop = back.stop;
    pts = [...back.points.slice(1).reverse(), ...pts];
    mags = [...back.magnitude.slice(1).reverse(), ...mags];
  }
  const points = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => points.set(p, 3 * i));
  return {
    points,
    magnitude: Float32Array.from(mags),
    stop: [backStop, fwd.stop],
    closed: fwd.stop === 'closed',
  };
}

/**
 * Flow coordinate for the animated dashes: φ(s) = ∫ ds / v(s) with
 * v = clamp(|B|/B_ref, 0,15, 4). A dash pattern f(φ − t) then moves along the
 * line with local speed ∝ |B| (clamped), in the direction of B.
 */
export function flowPhase(
  points: Float32Array,
  magnitude: Float32Array,
  bRef: number,
): Float32Array {
  const n = magnitude.length;
  const phase = new Float32Array(n);
  const ref = bRef > 0 ? bRef : 1;
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const ds = Math.hypot(
      (points[3 * i] as number) - (points[3 * i - 3] as number),
      (points[3 * i + 1] as number) - (points[3 * i - 2] as number),
      (points[3 * i + 2] as number) - (points[3 * i - 1] as number),
    );
    const bMid = 0.5 * ((magnitude[i] as number) + (magnitude[i - 1] as number));
    const v = Math.min(4, Math.max(0.15, bMid / ref));
    acc += ds / v;
    phase[i] = acc;
  }
  return phase;
}

export interface ArrowGrid {
  /** Per arrow: x, y, z [m], unit direction ux, uy, uz, |B| [T] (7 floats). */
  data: Float32Array;
  count: number;
}

/** Arrow glyphs on a regular grid of the plane x = 0 (skips points near the wire). */
export function arrowGrid(
  r: FieldRequest,
  s: CoilSetup,
  ev: FieldEvaluator,
  nz = 17,
  ny = 9,
): ArrowGrid {
  const data = new Float32Array(nz * ny * 7);
  const out = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < ny; j++) {
      const z = -s.zHalf + (2 * s.zHalf * (i + 0.5)) / nz;
      const y = -s.rhoHalf + (2 * s.rhoHalf * (j + 0.5)) / ny;
      const p: Vec3 = [0, y, z];
      if (nearWire(r, p)) continue;
      ev.field(0, y, z, out);
      const m = Math.hypot(out[0] as number, out[1] as number, out[2] as number);
      if (!(m > 0)) continue;
      data.set(
        [0, y, z, (out[0] as number) / m, (out[1] as number) / m, (out[2] as number) / m, m],
        7 * count,
      );
      count++;
    }
  }
  return { data: data.slice(0, 7 * count), count };
}

/** Everything at once (sync fallback and tests). */
export function computeAll(r: FieldRequest): {
  setup: CoilSetup;
  profile: AxisProfile;
  lines: TracedLine[];
  arrows: ArrowGrid;
} {
  const setup = coilSetup(r);
  const ev = evaluator(setup);
  return {
    setup,
    profile: axisProfile(setup, ev),
    lines: seeds(r).map((sd) => traceLine(r, setup, ev, sd)),
    arrows: arrowGrid(r, setup, ev),
  };
}
