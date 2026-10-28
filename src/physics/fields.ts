/**
 * Static magnetic-field models used to TRACE field lines in the 3D scenes
 * (extension: field visualisation). Pure functions, SI units (T, m, A, A·m²).
 *
 * None of these functions feeds the induction models of the simulators (those
 * keep their uniform-B assumptions, §4.2); they only make the drawn field lines
 * the result of a computation instead of a hand-drawn picture.
 *
 * Vectors are plain `[x, y, z]` tuples. Every field function accepts an optional
 * `out` array that is written in place and returned (no allocation in hot loops,
 * e.g. the RK4 field-line tracer).
 */
import { MU_0 } from './constants';
import { finite, positive } from './validate';

/** 3-vector `[x, y, z]` (SI units of the quantity it holds). */
export type Vec3 = [number, number, number];

/** Read-only 3-vector input. */
export type ReadonlyVec3 = readonly [number, number, number];

/** A field model: writes B(p) [T] into `out` and returns it. */
export type FieldFn = (p: ReadonlyVec3, out: Vec3) => Vec3;

const FOUR_PI = 4 * Math.PI;

function vecArg(fn: string, name: string, v: ReadonlyVec3): void {
  if (v.length !== 3) throw new RangeError(`${fn}: ${name} must have 3 components`);
  finite(fn, `${name}[0]`, v[0]);
  finite(fn, `${name}[1]`, v[1]);
  finite(fn, `${name}[2]`, v[2]);
}

// --- complete elliptic integrals ---------------------------------------------------

/** AGM iterations: quadratic convergence, 1e-16 after ≤ 6 steps for m ≤ 1 − 1e-15. */
const AGM_MAX_ITER = 40;

/**
 * Complete elliptic integral of the first kind, parameter convention m = k²:
 *
 * K(m) = ∫₀^{π/2} dθ / √(1 − m sin²θ) = π / (2 · AGM(1, √(1 − m)))
 *
 * (arithmetic–geometric mean, quadratic convergence).
 *
 * @param m - parameter m = k² [-], 0 ≤ m ≤ 1 (K(1) = +∞)
 * @returns K(m) [-]
 * @throws RangeError if m < 0, m > 1 or non-finite
 * @slide none (extension: field visualisation)
 */
export function ellipK(m: number): number {
  return ellipKE('ellipK', m)[0];
}

/**
 * Complete elliptic integral of the second kind, parameter convention m = k²:
 *
 * E(m) = ∫₀^{π/2} √(1 − m sin²θ) dθ = K(m) · (1 − Σₙ 2ⁿ⁻¹ cₙ²)
 *
 * with the AGM sequence a₀ = 1, b₀ = √(1 − m), c₀ = √m,
 * aₙ₊₁ = (aₙ + bₙ)/2, bₙ₊₁ = √(aₙ bₙ), cₙ₊₁ = (aₙ − bₙ)/2.
 *
 * @param m - parameter m = k² [-], 0 ≤ m ≤ 1 (E(1) = 1)
 * @returns E(m) [-]
 * @throws RangeError if m < 0, m > 1 or non-finite
 * @slide none (extension: field visualisation)
 */
export function ellipE(m: number): number {
  return ellipKE('ellipE', m)[1];
}

/** K(m) and E(m) from one AGM run (no argument validation; 0 ≤ m < 1). */
function ellipKEUnchecked(m: number): [number, number] {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let c = Math.sqrt(m);
  let sum = 0.5 * c * c;
  let pow = 0.5;
  for (let n = 0; n < AGM_MAX_ITER && Math.abs(c) > 1e-17 * a; n++) {
    const an = 0.5 * (a + b);
    c = 0.5 * (a - b);
    b = Math.sqrt(a * b);
    a = an;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

function ellipKE(fn: string, m: number): [number, number] {
  finite(fn, 'm', m);
  if (m < 0 || m > 1) throw new RangeError(`${fn}: m must be in [0, 1] (got ${m})`);
  if (m === 1) return [Number.POSITIVE_INFINITY, 1];
  return ellipKEUnchecked(m);
}

// --- point dipole -----------------------------------------------------------------

/**
 * Exact field of a point magnetic dipole m at the origin:
 *
 * B(r) = μ₀/(4π) · (3 (m·r̂) r̂ − m) / |r|³
 *
 * Far-field model of a short bar magnet (m = M·V, magnetisation × volume) or of a
 * small current loop (m = I·π R² n̂).
 *
 * @param m - dipole moment [A·m²]
 * @param r - field point relative to the dipole [m], r ≠ 0
 * @param out - optional output vector (written in place)
 * @returns B [T]
 * @throws RangeError at r = 0 (singular) or for non-finite input
 * @slide none (extension: field visualisation)
 */
export function dipoleField(m: ReadonlyVec3, r: ReadonlyVec3, out: Vec3 = [0, 0, 0]): Vec3 {
  vecArg('dipoleField', 'm', m);
  vecArg('dipoleField', 'r', r);
  const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  if (r2 === 0) throw new RangeError('dipoleField: r must be ≠ 0 (the field is singular)');
  const rl = Math.sqrt(r2);
  const k = MU_0 / (FOUR_PI * r2 * rl);
  const mr = (m[0] * r[0] + m[1] * r[1] + m[2] * r[2]) / r2;
  out[0] = k * (3 * mr * r[0] - m[0]);
  out[1] = k * (3 * mr * r[1] - m[1]);
  out[2] = k * (3 * mr * r[2] - m[2]);
  return out;
}

// --- circular loop ----------------------------------------------------------------

/**
 * Exact field of a circular current loop of radius R in the plane z = 0, centred
 * at the origin, current I counter-clockwise seen from +z (so B points along +z
 * at the centre). With ρ = √(x² + y²), α² = R² + ρ² + z² − 2Rρ,
 * β² = R² + ρ² + z² + 2Rρ, m = k² = 1 − α²/β², C = μ₀ I / π:
 *
 * B_z = C / (2 α² β) · [(R² − ρ² − z²) E(m) + α² K(m)]
 * B_ρ = C z / (2 α² β ρ) · [(R² + ρ² + z²) E(m) − α² K(m)]   (B_ρ = 0 on the axis)
 *
 * (Simpson et al., "Simple analytic expressions for the magnetic field of a
 * circular current loop", NASA 2001). On the axis it reduces to
 * B_z = μ₀ I R² / (2 (R² + z²)^{3/2}).
 *
 * @param R - loop radius [m], > 0
 * @param I - current [A] (sign = direction)
 * @param p - field point [m], not on the wire
 * @param out - optional output vector (written in place)
 * @returns B [T]
 * @throws RangeError on the wire (singular), for R ≤ 0 or non-finite input
 * @slide none (extension: field visualisation)
 */
export function loopField(R: number, I: number, p: ReadonlyVec3, out: Vec3 = [0, 0, 0]): Vec3 {
  positive('loopField', 'R', R);
  finite('loopField', 'I', I);
  vecArg('loopField', 'p', p);
  return loopFieldUnchecked(R, I, p[0], p[1], p[2], out);
}

function loopFieldUnchecked(
  R: number,
  I: number,
  x: number,
  y: number,
  z: number,
  out: Vec3,
): Vec3 {
  const rho2 = x * x + y * y;
  const rho = Math.sqrt(rho2);
  const r2 = rho2 + z * z;
  const alpha2 = R * R + r2 - 2 * R * rho;
  const beta2 = R * R + r2 + 2 * R * rho;
  if (alpha2 <= 0) throw new RangeError('loopField: the point lies on the wire (singular)');
  const beta = Math.sqrt(beta2);
  const m = 1 - alpha2 / beta2;
  const [K, E] = ellipKEUnchecked(m < 0 ? 0 : m);
  const C = (MU_0 * I) / Math.PI;
  const bz = (C / (2 * alpha2 * beta)) * ((R * R - r2) * E + alpha2 * K);
  out[2] = bz;
  if (rho < 1e-12 * R) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const brho = ((C * z) / (2 * alpha2 * beta * rho)) * ((R * R + r2) * E - alpha2 * K);
  out[0] = (brho * x) / rho;
  out[1] = (brho * y) / rho;
  return out;
}

// --- finite solenoid ----------------------------------------------------------------

/** Default cap on the number of discrete loops summed by {@link solenoidField}. */
export const SOLENOID_MAX_LOOPS = 200;

/**
 * Field of a finite solenoid as the sum of `loops` coaxial circular loops
 * ({@link loopField}). Axis z, centred at the origin, from z = −L/2 to +L/2;
 * N turns carrying I, positive I counter-clockwise seen from +z.
 * Loop k sits at z_k = −L/2 + (k + ½)·L/loops and carries I·N/loops, so the total
 * ampere-turns N·I are exact for any `loops`. Inside, far from the ends, this
 * tends to the ideal value B = μ₀ N I / L; on the axis it matches
 * B_z = μ₀ N I /(2L) · [(z + L/2)/√((z + L/2)² + R²) − (z − L/2)/√((z − L/2)² + R²)].
 *
 * @param R - radius [m], > 0
 * @param L - length [m], > 0
 * @param N - number of turns [-], > 0
 * @param I - current [A]
 * @param p - field point [m]
 * @param out - optional output vector
 * @param loops - discrete loops summed (default min(⌈N⌉, {@link SOLENOID_MAX_LOOPS}))
 * @returns B [T]
 * @throws RangeError for R, L, N ≤ 0, loops < 1, non-finite input or a point on a loop
 * @slide none (extension: field visualisation)
 */
export function solenoidField(
  R: number,
  L: number,
  N: number,
  I: number,
  p: ReadonlyVec3,
  out: Vec3 = [0, 0, 0],
  loops: number = Math.min(Math.ceil(N), SOLENOID_MAX_LOOPS),
): Vec3 {
  const fn = 'solenoidField';
  positive(fn, 'R', R);
  positive(fn, 'L', L);
  positive(fn, 'N', N);
  finite(fn, 'I', I);
  vecArg(fn, 'p', p);
  if (!Number.isInteger(loops) || loops < 1) {
    throw new RangeError(`${fn}: loops must be an integer ≥ 1 (got ${loops})`);
  }
  const Ik = (I * N) / loops;
  const tmp: Vec3 = [0, 0, 0];
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (let k = 0; k < loops; k++) {
    const zk = -L / 2 + ((k + 0.5) * L) / loops;
    loopFieldUnchecked(R, Ik, p[0], p[1], p[2] - zk, tmp);
    bx += tmp[0];
    by += tmp[1];
    bz += tmp[2];
  }
  out[0] = bx;
  out[1] = by;
  out[2] = bz;
  return out;
}

// --- gap between rectangular pole pieces ------------------------------------------

/** Geometry of two facing rectangular pole faces (field along +x, N face at x = −gap/2). */
export interface GapGeometry {
  /** Distance between the pole faces [m], > 0. */
  gap: number;
  /** Face extent along y [m], > 0. */
  width: number;
  /** Face extent along z [m], > 0. */
  depth: number;
}

/** ln(v + √(a² + v²)) with a² = u² + n², without cancellation for v < 0. */
function logVR(v: number, a2: number, R: number): number {
  if (v >= 0) return Math.log(v + R);
  return Math.log(Math.max(a2, 1e-300) / (R - v));
}

/**
 * Field (up to the factor σ/4π) of a uniformly charged rectangle in the plane
 * x = x0, y ∈ [−w/2, w/2], z ∈ [−d/2, d/2]: ∬ (r − r′)/|r − r′|³ dA′, from the
 * closed-form corner sums (u = y − y′, v = z − z′, n = x − x0, R = √(n²+u²+v²)):
 * F_n = Σ ± atan(u v /(n R)), F_u = Σ ∓ ln(v + R), F_v = Σ ∓ ln(u + R).
 */
function sheet(
  x0: number,
  w: number,
  d: number,
  x: number,
  y: number,
  z: number,
  acc: Vec3,
  s: number,
): void {
  let n = x - x0;
  if (n === 0) n = 1e-12;
  const us = [y + w / 2, y - w / 2]; // u at y′ = −w/2 (b) and y′ = +w/2 (a)
  const vs = [z + d / 2, z - d / 2];
  let fn = 0;
  let fu = 0;
  let fv = 0;
  for (let i = 0; i < 2; i++) {
    const u = us[i] as number;
    for (let j = 0; j < 2; j++) {
      const v = vs[j] as number;
      const sign = i === j ? 1 : -1; // G(ub,vb) − G(ua,vb) − G(ub,va) + G(ua,va)
      const R = Math.sqrt(n * n + u * u + v * v);
      fn += sign * Math.atan((u * v) / (n * R));
      fu -= sign * logVR(v, n * n + u * u, R);
      fv -= sign * logVR(u, n * n + v * v, R);
    }
  }
  acc[0] += s * fn;
  acc[1] += s * fu;
  acc[2] += s * fv;
}

function gapRaw(g: GapGeometry, x: number, y: number, z: number, out: Vec3): Vec3 {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  sheet(-g.gap / 2, g.width, g.depth, x, y, z, out, 1); // N face: +σ
  sheet(g.gap / 2, g.width, g.depth, x, y, z, out, -1); // S face: −σ
  return out;
}

/**
 * Field between two facing rectangular pole pieces, as a closure (geometry
 * validated once; no allocation per call). See {@link gapField} for the model.
 *
 * @param g - gap geometry [m]
 * @param B0 - field at the centre of the gap [T] (along +x)
 * @returns field function p ↦ B(p) [T]
 * @throws RangeError for non-positive dimensions or non-finite B0
 * @slide none (extension: field visualisation)
 */
export function createGapField(g: GapGeometry, B0: number): FieldFn {
  const fn = 'gapField';
  positive(fn, 'gap', g.gap);
  positive(fn, 'width', g.width);
  positive(fn, 'depth', g.depth);
  finite(fn, 'B0', B0);
  const geom = { ...g };
  const centre = gapRaw(geom, 0, 0, 0, [0, 0, 0])[0];
  const k = B0 / centre;
  return (p, out) => {
    gapRaw(geom, p[0], p[1], p[2], out);
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
    return out;
  };
}

/**
 * Field in the air gap between two facing rectangular pole faces (N face at
 * x = −gap/2, S face at x = +gap/2, both width × depth, centred on the x axis):
 * uniform B ≈ B0 x̂ in the middle, with fringing at the edges.
 *
 * Model ("magnetic surface charge" / two-sheet model): high-permeability pole
 * pieces are replaced by two uniformly charged rectangles of magnetic surface
 * charge ±σ on the faces. Each rectangle's field has the closed form
 *
 * F(p) = σ/(4π) · Σ_corners ± ( −ln(v + R), −ln(u + R), atan(u v / (n R)) )
 *
 * (u, v in-plane offsets from the corners, n normal distance, R = √(u²+v²+n²)),
 * and σ is fixed so that B(0) = B0 x̂. For gap ≪ face size this is the uniform
 * field of an ideal capacitor-like gap; near the edges the lines bulge outwards
 * (fringing), the classic picture of pole pieces. It ignores saturation, the
 * shape of the yoke and the field inside the iron (the model is only meant for
 * the air region in front of the faces).
 *
 * @param g - gap geometry [m]
 * @param B0 - field at the centre [T]
 * @param p - field point [m] (not on a face edge)
 * @param out - optional output vector
 * @returns B [T]
 * @throws RangeError for non-positive dimensions or non-finite input
 * @slide none (extension: field visualisation)
 */
export function gapField(g: GapGeometry, B0: number, p: ReadonlyVec3, out: Vec3 = [0, 0, 0]): Vec3 {
  vecArg('gapField', 'p', p);
  return createGapField(g, B0)(p, out);
}

/**
 * Magnitude |v| of a 3-vector.
 *
 * @param v - vector
 * @returns |v| (same unit as v)
 * @slide none (extension: field visualisation)
 */
export function norm3(v: ReadonlyVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/**
 * Numerical divergence ∇·B at p by central differences (step h). Used by the
 * tests as a physics check (∇·B = 0 for every model above, away from sources).
 *
 * @param f - field function
 * @param p - point [m]
 * @param h - finite-difference step [m], > 0
 * @returns ∇·B [T/m]
 * @slide none (extension: field visualisation)
 */
export function divergence(f: FieldFn, p: ReadonlyVec3, h: number): number {
  positive('divergence', 'h', h);
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [0, 0, 0];
  let div = 0;
  for (let i = 0; i < 3; i++) {
    const pp: Vec3 = [p[0], p[1], p[2]];
    const pm: Vec3 = [p[0], p[1], p[2]];
    pp[i] = (pp[i] as number) + h;
    pm[i] = (pm[i] as number) - h;
    f(pp, a);
    f(pm, b);
    div += ((a[i] as number) - (b[i] as number)) / (2 * h);
  }
  return div;
}
