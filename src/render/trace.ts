/**
 * Field-line tracer (no Three.js, no DOM: runs in the main thread, in a Web
 * Worker and in Node tests).
 *
 * A field line solves dr/ds = B(r)/|B(r)| (unit tangent, s = arc length). It is
 * integrated with classic RK4 and an adaptive step limited by the CURVATURE of
 * the line: if the field direction turns by more than `maxAngle` across a step
 * the step is halved and retried; on gentle stretches it grows up to `hMax`.
 * Tracing stops when the line leaves the bounds, closes on itself, enters a
 * "source" region (magnet/pole body, wire), the field becomes negligible, or the
 * point/length budget is exhausted.
 *
 * Field models are described by serialisable {@link FieldSpec}s so that the same
 * job can be shipped to a worker.
 */
import {
  createGapField,
  dipoleField,
  loopField,
  SOLENOID_MAX_LOOPS,
  solenoidField,
  type FieldFn,
  type GapGeometry,
  type ReadonlyVec3,
  type Vec3,
} from '../physics';

/** Serialisable description of a field model (world/scene units are metres here). */
export type FieldSpec =
  | { kind: 'gap'; geometry: GapGeometry; B0: number; offset?: Vec3 }
  | { kind: 'dipole'; m: Vec3; at: Vec3 }
  | { kind: 'loop'; R: number; I: number; at: Vec3; axis: 'x' | 'y' | 'z' }
  | {
      kind: 'solenoid';
      R: number;
      L: number;
      N: number;
      I: number;
      at: Vec3;
      axis: 'x' | 'y' | 'z';
      loops?: number;
    }
  | { kind: 'uniform'; B: Vec3 }
  | { kind: 'sum'; parts: FieldSpec[] };

/** Axis-aligned box. */
export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface TraceOptions {
  /** Tracing domain; leaving it ends the line. */
  bounds: Box;
  /** Regions where lines end (magnet bodies, pole pieces, wires). */
  stopBoxes?: Box[];
  stopSpheres?: Array<{ c: Vec3; r: number }>;
  /** Initial / min / max step (default: 2 % / 0.2 % / 6 % of the bounds diagonal). */
  h0?: number;
  hMin?: number;
  hMax?: number;
  /** Max direction change per step [rad] (default 0.06 ≈ 3,4°). */
  maxAngle?: number;
  /** Max vertices per line (default 600). */
  maxPoints?: number;
  /** Max arc length (default 6 × bounds diagonal). */
  maxLength?: number;
  /** |B| below this (fraction of |B| at the seed) ends the line (default 1e-4). */
  minFieldRatio?: number;
  /** Trace along +B (1, default), −B (−1) or both ways from the seed (0). */
  direction?: 1 | -1 | 0;
}

export type StopReason = 'bounds' | 'closed' | 'source' | 'weak' | 'points' | 'length';

export interface TracedLine {
  /** xyz triples. */
  points: Float32Array;
  /** |B| at every vertex [T]. */
  mags: Float32Array;
  /** Cumulative arc length at every vertex. */
  arc: Float32Array;
  count: number;
  closed: boolean;
  reason: StopReason;
}

const AXIS_PERM: Record<'x' | 'y' | 'z', [number, number, number]> = {
  // local (x, y, z with axis = z) ← world components
  x: [1, 2, 0],
  y: [2, 0, 1],
  z: [0, 1, 2],
};

/** Build an evaluable field function from a spec. */
export function fieldFromSpec(spec: FieldSpec): FieldFn {
  switch (spec.kind) {
    case 'uniform':
      return (_p, out) => {
        out[0] = spec.B[0];
        out[1] = spec.B[1];
        out[2] = spec.B[2];
        return out;
      };
    case 'gap': {
      const f = createGapField(spec.geometry, spec.B0);
      const o = spec.offset ?? [0, 0, 0];
      const q: Vec3 = [0, 0, 0];
      return (p, out) => {
        q[0] = p[0] - o[0];
        q[1] = p[1] - o[1];
        q[2] = p[2] - o[2];
        return f(q, out);
      };
    }
    case 'dipole': {
      const q: Vec3 = [0, 0, 0];
      return (p, out) => {
        q[0] = p[0] - spec.at[0];
        q[1] = p[1] - spec.at[1];
        q[2] = p[2] - spec.at[2];
        if (q[0] === 0 && q[1] === 0 && q[2] === 0) {
          out[0] = out[1] = out[2] = Number.NaN;
          return out;
        }
        return dipoleField(spec.m, q, out);
      };
    }
    case 'loop':
    case 'solenoid': {
      const perm = AXIS_PERM[spec.axis];
      const q: Vec3 = [0, 0, 0];
      const b: Vec3 = [0, 0, 0];
      return (p, out) => {
        const d = [p[0] - spec.at[0], p[1] - spec.at[1], p[2] - spec.at[2]];
        q[0] = d[perm[0]] as number;
        q[1] = d[perm[1]] as number;
        q[2] = d[perm[2]] as number;
        try {
          if (spec.kind === 'loop') loopField(spec.R, spec.I, q, b);
          else solenoidField(spec.R, spec.L, spec.N, spec.I, q, b, spec.loops);
        } catch {
          out[0] = out[1] = out[2] = Number.NaN;
          return out;
        }
        out[perm[0]] = b[0];
        out[perm[1]] = b[1];
        out[perm[2]] = b[2];
        return out;
      };
    }
    case 'sum': {
      const fs = spec.parts.map(fieldFromSpec);
      const t: Vec3 = [0, 0, 0];
      return (p, out) => {
        out[0] = out[1] = out[2] = 0;
        for (const f of fs) {
          f(p, t);
          out[0] += t[0];
          out[1] += t[1];
          out[2] += t[2];
        }
        return out;
      };
    }
  }
}

function inBox(b: Box, p: ReadonlyVec3): boolean {
  return (
    p[0] >= b.min[0] &&
    p[0] <= b.max[0] &&
    p[1] >= b.min[1] &&
    p[1] <= b.max[1] &&
    p[2] >= b.min[2] &&
    p[2] <= b.max[2]
  );
}

interface Resolved {
  bounds: Box;
  stopBoxes: Box[];
  stopSpheres: Array<{ c: Vec3; r: number }>;
  h0: number;
  hMin: number;
  hMax: number;
  cosMax: number;
  maxPoints: number;
  maxLength: number;
  minFieldRatio: number;
}

function resolve(o: TraceOptions): Resolved {
  const d = Math.hypot(
    o.bounds.max[0] - o.bounds.min[0],
    o.bounds.max[1] - o.bounds.min[1],
    o.bounds.max[2] - o.bounds.min[2],
  );
  return {
    bounds: o.bounds,
    stopBoxes: o.stopBoxes ?? [],
    stopSpheres: o.stopSpheres ?? [],
    h0: o.h0 ?? d * 0.02,
    hMin: o.hMin ?? d * 0.002,
    hMax: o.hMax ?? d * 0.06,
    cosMax: Math.cos(o.maxAngle ?? 0.06),
    maxPoints: o.maxPoints ?? 600,
    maxLength: o.maxLength ?? d * 6,
    minFieldRatio: o.minFieldRatio ?? 1e-4,
  };
}

/** Unit field direction at p (×sign); returns |B| (NaN/0 if undefined). */
function dir(f: FieldFn, p: ReadonlyVec3, sign: number, b: Vec3, out: Vec3): number {
  f(p, b);
  const m = Math.hypot(b[0], b[1], b[2]);
  if (!(m > 0) || !Number.isFinite(m)) return m;
  out[0] = (sign * b[0]) / m;
  out[1] = (sign * b[1]) / m;
  out[2] = (sign * b[2]) / m;
  return m;
}

function traceOneWay(
  f: FieldFn,
  seed: ReadonlyVec3,
  sign: number,
  o: Resolved,
): { pts: number[]; mags: number[]; closed: boolean; reason: StopReason } {
  const pts: number[] = [seed[0], seed[1], seed[2]];
  const b: Vec3 = [0, 0, 0];
  const k1: Vec3 = [0, 0, 0];
  const k2: Vec3 = [0, 0, 0];
  const k3: Vec3 = [0, 0, 0];
  const k4: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];
  const p: Vec3 = [seed[0], seed[1], seed[2]];
  const m0 = dir(f, p, sign, b, k1);
  const mags: number[] = [m0];
  if (!(m0 > 0) || !Number.isFinite(m0)) return { pts, mags, closed: false, reason: 'weak' };
  let h = o.h0;
  let length = 0;
  let reason: StopReason = 'points';
  let closed = false;
  while (pts.length / 3 < o.maxPoints) {
    const mk1 = dir(f, p, sign, b, k1);
    if (!(mk1 > m0 * o.minFieldRatio) || !Number.isFinite(mk1)) {
      reason = 'weak';
      break;
    }
    let accepted = false;
    let reversed = false;
    let next: Vec3 = [0, 0, 0];
    for (let tries = 0; tries < 12; tries++) {
      t[0] = p[0] + 0.5 * h * k1[0];
      t[1] = p[1] + 0.5 * h * k1[1];
      t[2] = p[2] + 0.5 * h * k1[2];
      const a2 = dir(f, t, sign, b, k2);
      t[0] = p[0] + 0.5 * h * k2[0];
      t[1] = p[1] + 0.5 * h * k2[1];
      t[2] = p[2] + 0.5 * h * k2[2];
      const a3 = dir(f, t, sign, b, k3);
      t[0] = p[0] + h * k3[0];
      t[1] = p[1] + h * k3[1];
      t[2] = p[2] + h * k3[2];
      const a4 = dir(f, t, sign, b, k4);
      const ok = a2 > 0 && a3 > 0 && a4 > 0 && Number.isFinite(a2 + a3 + a4);
      const cos = k1[0] * k4[0] + k1[1] * k4[1] + k1[2] * k4[2];
      if ((!ok || cos < o.cosMax) && h > o.hMin) {
        h = Math.max(o.hMin, h * 0.5);
        continue;
      }
      if (!ok) break;
      if (cos < 0) {
        // The field reverses within the smallest step: a sink / charged sheet.
        reversed = true;
        break;
      }
      next = [
        p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
        p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
        p[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      ];
      accepted = true;
      if (cos > 1 - (1 - o.cosMax) * 0.15) h = Math.min(o.hMax, h * 1.5);
      break;
    }
    if (!accepted) {
      reason = reversed ? 'source' : 'weak';
      break;
    }
    const step = Math.hypot(next[0] - p[0], next[1] - p[1], next[2] - p[2]);
    p[0] = next[0];
    p[1] = next[1];
    p[2] = next[2];
    length += step;
    if (!inBox(o.bounds, p)) {
      reason = 'bounds';
      pts.push(p[0], p[1], p[2]);
      mags.push(Math.hypot(...f(p, b)));
      break;
    }
    let src = false;
    for (const s of o.stopBoxes) if (inBox(s, p)) src = true;
    for (const s of o.stopSpheres)
      if (Math.hypot(p[0] - s.c[0], p[1] - s.c[1], p[2] - s.c[2]) < s.r) src = true;
    pts.push(p[0], p[1], p[2]);
    mags.push(Math.hypot(...f(p, b)));
    if (src) {
      reason = 'source';
      break;
    }
    if (
      length > 6 * o.hMax &&
      Math.hypot(p[0] - seed[0], p[1] - seed[1], p[2] - seed[2]) < Math.max(step, o.hMin) * 1.2
    ) {
      closed = true;
      reason = 'closed';
      pts.push(seed[0], seed[1], seed[2]);
      mags.push(m0);
      break;
    }
    if (length > o.maxLength) {
      reason = 'length';
      break;
    }
  }
  return { pts, mags, closed, reason };
}

/** Trace one field line from `seed`. */
export function traceFieldLine(f: FieldFn, seed: ReadonlyVec3, options: TraceOptions): TracedLine {
  const o = resolve(options);
  const direction = options.direction ?? 1;
  let pts: number[];
  let mags: number[];
  let closed: boolean;
  let reason: StopReason;
  if (direction === 0) {
    const fw = traceOneWay(f, seed, 1, o);
    if (fw.closed) ({ pts, mags, closed, reason } = fw);
    else {
      const bw = traceOneWay(f, seed, -1, {
        ...o,
        maxPoints: Math.max(2, o.maxPoints - fw.pts.length / 3),
      });
      pts = [];
      mags = [];
      for (let i = bw.pts.length / 3 - 1; i >= 1; i--) {
        pts.push(bw.pts[3 * i] as number, bw.pts[3 * i + 1] as number, bw.pts[3 * i + 2] as number);
        mags.push(bw.mags[i] as number);
      }
      pts.push(...fw.pts);
      mags.push(...fw.mags);
      closed = false;
      reason = fw.reason;
    }
  } else ({ pts, mags, closed, reason } = traceOneWay(f, seed, direction, o));
  const count = pts.length / 3;
  const arc = new Float32Array(count);
  for (let i = 1; i < count; i++) {
    arc[i] =
      (arc[i - 1] as number) +
      Math.hypot(
        (pts[3 * i] as number) - (pts[3 * i - 3] as number),
        (pts[3 * i + 1] as number) - (pts[3 * i - 2] as number),
        (pts[3 * i + 2] as number) - (pts[3 * i - 1] as number),
      );
  }
  return {
    points: Float32Array.from(pts),
    mags: Float32Array.from(mags),
    arc,
    count,
    closed,
    reason,
  };
}

/** A complete tracing job (serialisable → can run in a worker). */
export interface TraceJob {
  field: FieldSpec;
  seeds: Vec3[];
  options: TraceOptions;
}

/**
 * Relative cost of one evaluation of a field model (≈ number of elementary terms:
 * a dipole = 1, a loop ≈ 4 for the elliptic integrals, a solenoid = its loops).
 */
export function fieldCost(spec: FieldSpec): number {
  switch (spec.kind) {
    case 'uniform':
      return 0.2;
    case 'dipole':
      return 1;
    case 'gap':
      return 6;
    case 'loop':
      return 4;
    case 'solenoid':
      return 4 * (spec.loops ?? Math.min(Math.ceil(spec.N), SOLENOID_MAX_LOOPS));
    case 'sum':
      return spec.parts.reduce((s, p) => s + fieldCost(p), 0);
  }
}

/**
 * Upper-bound work of a trace job (QA-041): seeds × max vertices per line (× 2 when
 * traced both ways) × 4 RK4 evaluations × {@link fieldCost}. Lines usually stop much
 * earlier; the bound is only used to decide main thread vs worker BEFORE the first trace.
 */
export function estimateTraceCost(job: TraceJob): number {
  const pts = job.options.maxPoints ?? 600;
  const ways = job.options.direction === 0 ? 2 : 1;
  return job.seeds.length * pts * ways * 4 * fieldCost(job.field);
}

/** Jobs above this {@link estimateTraceCost} start in the worker, even the first one. */
export const HEAVY_TRACE_COST = 3e6;

export function runTraceJob(job: TraceJob): TracedLine[] {
  const f = fieldFromSpec(job.field);
  return job.seeds.map((s) => traceFieldLine(f, s, job.options)).filter((l) => l.count >= 2);
}

// --- seeding ------------------------------------------------------------------------

/**
 * Seeds on a rectangle centred at `c`, spanned by unit vectors `u`, `v` (half
 * sizes `hu`, `hv`), as a jittered-free stratified grid of ≈ n points with equal
 * AREA per seed — flux-proportional when the normal field is uniform.
 */
export function seedRect(
  c: ReadonlyVec3,
  u: ReadonlyVec3,
  v: ReadonlyVec3,
  hu: number,
  hv: number,
  n: number,
): Vec3[] {
  const ratio = hu / hv;
  const nu = Math.max(1, Math.round(Math.sqrt(n * ratio)));
  const nv = Math.max(1, Math.round(n / nu));
  const out: Vec3[] = [];
  for (let i = 0; i < nu; i++) {
    const a = -hu + ((i + 0.5) * 2 * hu) / nu;
    for (let j = 0; j < nv; j++) {
      const b = -hv + ((j + 0.5) * 2 * hv) / nv;
      out.push([
        c[0] + a * u[0] + b * v[0],
        c[1] + a * u[1] + b * v[1],
        c[2] + a * u[2] + b * v[2],
      ]);
    }
  }
  return out;
}

/** Seeds on a disc (sunflower / Vogel spiral: equal area per seed). */
export function seedDisc(
  c: ReadonlyVec3,
  u: ReadonlyVec3,
  v: ReadonlyVec3,
  radius: number,
  n: number,
): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Vec3[] = [];
  for (let k = 0; k < n; k++) {
    const r = radius * Math.sqrt((k + 0.5) / n);
    const th = k * golden;
    const a = r * Math.cos(th);
    const b = r * Math.sin(th);
    out.push([c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1], c[2] + a * u[2] + b * v[2]]);
  }
  return out;
}

/**
 * Flux-proportional seeding: from candidate points with weights w_k = |B(p_k)·n̂|
 * (flux through each candidate's equal-area cell), pick n seeds by stratified
 * sampling of the cumulative flux — so the number of lines through any patch is
 * ∝ its flux (line density ∝ |B|, Faraday's picture). A candidate is never picked
 * twice (QA-042): when one cell carries more than total/n of the flux it gives one
 * seed, not several coincident lines, so the result may hold fewer than n seeds.
 */
export function seedByFlux(
  f: FieldFn,
  candidates: readonly Vec3[],
  normal: ReadonlyVec3,
  n: number,
): Vec3[] {
  const b: Vec3 = [0, 0, 0];
  const w = candidates.map((p) =>
    Math.abs((f(p, b), b[0] * normal[0] + b[1] * normal[1] + b[2] * normal[2])),
  );
  const total = w.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  if (!(total > 0) || n <= 0) return [];
  const out: Vec3[] = [];
  let acc = 0;
  let k = 0;
  let last = -1;
  for (let i = 0; i < n; i++) {
    const target = ((i + 0.5) / n) * total;
    while (k < candidates.length - 1 && acc + (w[k] as number) < target) {
      acc += Number.isFinite(w[k] as number) ? (w[k] as number) : 0;
      k++;
    }
    if (k === last) continue; // same cell again: a duplicate line, skip it
    last = k;
    out.push([...(candidates[k] as Vec3)]);
  }
  return out;
}
