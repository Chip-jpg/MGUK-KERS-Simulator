/**
 * Pure model of the `lenz` simulator (no DOM, no Three.js, no clock): a bar
 * magnet moving along the axis of a flat N-turn coil.
 *
 * GEOMETRY AND ORIENTATION CONVENTION
 * - The coil lies in the plane x = 0, centred on the x axis; radius `a`.
 * - The magnet stays on the +x side; `z` > 0 is the distance of its centre from
 *   the coil centre. "Avvicina" ⇒ dz/dt < 0, "allontana" ⇒ dz/dt > 0.
 * - Coil normal n̂ = +x, i.e. it points TOWARD the magnet (the magnet's side).
 *   Φ is measured along n̂. Same convention as `lenzSign` (src/physics/flux.ts,
 *   docs/PHYSICS.md §2): a positive current circulates counter-clockwise seen
 *   from the tip of n̂ — here that means **seen from the magnet** — and makes a
 *   field along +n̂ (toward the magnet).
 * - The magnet's dipole moment points from its S pole to its N pole. With the N
 *   pole facing the coil the moment points toward the coil: m_x = −m. With the S
 *   pole facing the coil, m_x = +m.
 *
 * ASSUMPTIONS (stated in the UI model note)
 * - The magnet is a point dipole at its centre, on the coil axis.
 * - Flux: for a point dipole on the axis of a circular loop the flux through the
 *   loop is exactly Φ = μ₀ m_x a² / (2 (z² + a²)^{3/2}) (reciprocity with the
 *   on-axis field of the loop). We write it as Φ = B̄ · S with S = π a² and
 *   B̄ = μ₀ m_x / (2π (z² + a²)^{3/2}) = the MEAN field over the coil section,
 *   i.e. the slide-7 formula Φ = B S cos α with α = 0 and B taken uniform (= B̄)
 *   over the section. All N turns are in the same plane (thin coil).
 * - emf: Faraday-Neumann over one physics step, f.e.m. = −N ΔΦ/Δt (slide 8);
 *   current i = f.e.m./R (slide 9); self-induction neglected (L·di/dt ≪ f.e.m.).
 * - Force on the magnet: dipole in the field of the current loop,
 *   F_x = m_x ∂B_loop/∂z = N · i · ∂Φ/∂z (exact for point dipole + thin loop).
 *   The magnet's motion is imposed (kinematic): the force is shown, it does not
 *   change the motion. Its magnitude is tiny (µN): the arrow length in the scene
 *   is qualitative (log scale).
 */
import {
  MU_0,
  createRk4Work,
  emfFaraday,
  fluxUniform,
  inducedCurrent,
  lenzSign,
  rk4Step,
} from '../../physics';

/** Which pole of the magnet faces the coil. */
export type Pole = 'N' | 'S';
/** Direction of the auto motion: toward the coil or away from it. */
export type Direction = 'avvicina' | 'allontana';
/** Current direction seen from the magnet (= from the tip of n̂). */
export type CurrentDir = 'antiorario' | 'orario' | 'nessuna';
/** Character of the force on the magnet. */
export type ForceKind = 'repulsiva' | 'attrattiva' | 'nessuna';

/** Closest / farthest centre distance of the magnet [m]. */
export const Z_NEAR = 0.07;
export const Z_FAR = 0.25;
/** Magnet length [m] (visual + keeps the facing pole outside the coil at Z_NEAR). */
export const MAGNET_LENGTH = 0.08;
/** Auto mode: rest time at the end of a run and before the next one [s]. */
export const DWELL_END = 0.6;
export const DWELL_START = 0.4;

/** Signed axial dipole moment m_x [A·m²] from the facing pole (m ≥ 0). */
export function axialMoment(pole: Pole, m: number): number {
  return pole === 'N' ? -m : m;
}

/**
 * Mean axial field of the magnet over the coil section [T]:
 * B̄ = μ₀ m_x / (2π (z² + a²)^{3/2}). Sign along n̂ = +x.
 */
export function meanField(mx: number, z: number, a: number): number {
  return (MU_0 * mx) / (2 * Math.PI * Math.pow(z * z + a * a, 1.5));
}

/** Coil section S = π a² [m²]. */
export function coilArea(a: number): number {
  return Math.PI * a * a;
}

/** Flux through ONE turn [Wb]: Φ = B̄ · S · cos 0 (slide 7, via `fluxUniform`). */
export function fluxPerTurn(mx: number, z: number, a: number): number {
  return fluxUniform(meanField(mx, z, a), coilArea(a), 0);
}

/** ∂Φ/∂z for one turn [Wb/m] (analytic derivative of {@link fluxPerTurn}). */
export function dFluxDz(mx: number, z: number, a: number): number {
  return (-3 * MU_0 * mx * a * a * z) / (2 * Math.pow(z * z + a * a, 2.5));
}

/**
 * Axial force on the magnet [N] (+x = away from the coil):
 * F_x = N · i · ∂Φ/∂z (point dipole in the field of a thin N-turn loop).
 */
export function forceOnMagnet(N: number, i: number, mx: number, z: number, a: number): number {
  return N * i * dFluxDz(mx, z, a);
}

/**
 * Field of the induced current at the coil centre, along n̂ [T]:
 * B_ind = μ₀ N i / (2a) (thin circular coil). Positive i (counter-clockwise
 * seen from the magnet) ⇒ field along +n̂, toward the magnet.
 */
export function inducedFieldAtCentre(N: number, i: number, a: number): number {
  return (MU_0 * N * i) / (2 * a);
}

/** Display label of a `lenzSign` result (seen from the magnet = tip of n̂). */
export function currentDirLabel(sign: -1 | 0 | 1): CurrentDir {
  return sign > 0 ? 'antiorario' : sign < 0 ? 'orario' : 'nessuna';
}

/**
 * Pole of the coil face that looks at the magnet: induced field along +n̂
 * (toward the magnet) ⇒ field lines leave that face ⇒ it is a N pole.
 */
export function facingCoilPole(sign: -1 | 0 | 1): Pole | null {
  return sign > 0 ? 'N' : sign < 0 ? 'S' : null;
}

/** Repulsive if the force pushes the magnet away from the coil (F_x > 0). */
export function forceKind(F: number): ForceKind {
  return F > 0 ? 'repulsiva' : F < 0 ? 'attrattiva' : 'nessuna';
}

/** Electrical parameters of the coil/magnet pair (SI). */
export interface CoilParams {
  pole: Pole;
  /** Magnet dipole moment magnitude [A·m²]. */
  m: number;
  /** Coil radius [m]. */
  a: number;
  /** Number of turns. */
  N: number;
  /** Circuit resistance [Ω]. */
  R: number;
}

/** Everything the UI shows for one physics step from z0 to z1 in dt. */
export interface Induction {
  z: number;
  /** Magnet velocity along x [m/s] (negative = approaching). */
  v: number;
  /** Mean field of the magnet at the coil, along n̂ [T]. */
  B: number;
  /** Flux through one turn at z1 [Wb]. */
  phi: number;
  /** ΔΦ over the step (one turn) [Wb]. */
  dPhi: number;
  /** dΦ/dt ≈ ΔΦ/Δt [Wb/s]. */
  dPhiDt: number;
  /** Induced emf of the coil [V] (positive = counter-clockwise seen from the magnet). */
  emf: number;
  /** Induced current [A] (same sign convention). */
  i: number;
  /** `lenzSign(dΦ/dt)`. */
  sign: -1 | 0 | 1;
  dir: CurrentDir;
  facePole: Pole | null;
  /** Induced field at the coil centre, along n̂ [T]. */
  Bind: number;
  /** Force on the magnet [N] (+ = away from the coil). */
  F: number;
  force: ForceKind;
}

/**
 * Induction over one step: Φ(z0) → Φ(z1) in dt.
 * f.e.m. = emfFaraday(ΔΦ, Δt, N), i = inducedCurrent(f.e.m., R),
 * verso = lenzSign(ΔΦ/Δt), force evaluated at the step midpoint.
 */
export function induction(p: CoilParams, z0: number, z1: number, dt: number): Induction {
  const mx = axialMoment(p.pole, p.m);
  const phi0 = fluxPerTurn(mx, z0, p.a);
  const phi = fluxPerTurn(mx, z1, p.a);
  const dPhi = z0 === z1 ? 0 : phi - phi0;
  const emf = emfFaraday(dPhi, dt, p.N);
  const i = inducedCurrent(emf, p.R);
  const dPhiDt = dPhi / dt;
  const sign = lenzSign(dPhiDt);
  const F = i === 0 ? 0 : forceOnMagnet(p.N, i, mx, (z0 + z1) / 2, p.a);
  return {
    z: z1,
    v: (z1 - z0) / dt,
    B: meanField(mx, z1, p.a),
    phi,
    dPhi,
    dPhiDt,
    emf,
    i,
    sign,
    dir: currentDirLabel(sign),
    facePole: facingCoilPole(sign),
    Bind: inducedFieldAtCentre(p.N, i, p.a),
    F,
    force: forceKind(F),
  };
}

// --- kinematics ----------------------------------------------------------------

export type AutoPhase = 'move' | 'dwellEnd' | 'dwellStart';

export interface AutoState {
  z: number;
  phase: AutoPhase;
  /** Time spent in the current phase [s]. */
  timer: number;
}

/** Start position of an auto run. */
export function autoStart(direction: Direction): number {
  return direction === 'avvicina' ? Z_FAR : Z_NEAR;
}

/** Initial auto state for a direction. */
export function initialAutoState(direction: Direction): AutoState {
  return { z: autoStart(direction), phase: 'dwellStart', timer: 0 };
}

/**
 * Advance the auto motion by dt: move at speed v toward the end of the run,
 * rest DWELL_END, jump back to the start (`jumped` = true: the caller must not
 * compute an emf for that teleport), rest DWELL_START, repeat.
 */
export function autoStep(
  s: AutoState,
  direction: Direction,
  v: number,
  dt: number,
): { state: AutoState; jumped: boolean } {
  const end = direction === 'avvicina' ? Z_NEAR : Z_FAR;
  const timer = s.timer + dt;
  if (s.phase === 'dwellStart') {
    if (timer >= DWELL_START) return { state: { z: s.z, phase: 'move', timer: 0 }, jumped: false };
    return { state: { ...s, timer }, jumped: false };
  }
  if (s.phase === 'dwellEnd') {
    if (timer >= DWELL_END) {
      return {
        state: { z: autoStart(direction), phase: 'dwellStart', timer: 0 },
        jumped: true,
      };
    }
    return { state: { ...s, timer }, jumped: false };
  }
  const z = followStep(s.z, end, v, dt);
  if (z === end) return { state: { z, phase: 'dwellEnd', timer: 0 }, jumped: false };
  return { state: { z, phase: 'move', timer }, jumped: false };
}

/** Move z toward target at most v·dt (manual / drag mode). */
export function followStep(z: number, target: number, v: number, dt: number): number {
  const maxStep = Math.abs(v) * dt;
  const d = target - z;
  if (Math.abs(d) <= maxStep) return target;
  return z + Math.sign(d) * maxStep;
}

/** Clamp a position into the allowed range [Z_NEAR, Z_FAR]. */
export function clampZ(z: number): number {
  return Math.min(Z_FAR, Math.max(Z_NEAR, z));
}

// --- galvanometer (scene instrument) ----------------------------------------------

/**
 * Centre-zero moving-coil galvanometer that reads the induced current.
 *
 * The needle is a damped torsional oscillator (moving-coil meter): with
 * deflection φ [rad], the restoring torque of the hairspring balances the
 * electromagnetic torque k·i at the static deflection φ∞ = φ_fs · i / i_fs, and
 * the motion obeys the 2nd-order law
 *
 *   φ'' + 2 ζ ω₀ φ' + ω₀² φ = ω₀² φ∞(t)
 *
 * (ω₀ = 2π f₀ natural angular frequency, ζ damping ratio, from the hairspring
 * stiffness, the coil's moment of inertia and the eddy-current/air damping).
 * It is integrated with RK4 in the fixed physics step. The full scale i_fs is
 * set by an auto-ranging switch (1-2-5 series) so that the swing stays readable
 * over the five decades of current the sliders allow; the needle stops at the
 * end pins (±{@link GALVO.pinDeg}). The meter is a display device: its own
 * resistance and its effect on the circuit are not modelled (R in the panel is
 * the whole circuit resistance).
 */
export const GALVO = {
  /** Natural frequency f₀ [Hz]. */
  f0: 1.5,
  /** Damping ratio ζ (slightly under-damped: a small overshoot, as in real meters). */
  zeta: 0.6,
  /** Deflection at full scale [deg]. */
  fullScaleDeg: 50,
  /** End pins [deg]. */
  pinDeg: 56,
  /** Smallest full scale of the auto-ranging switch [A]. */
  minRange: 10e-6,
  /** Peak-hold release time of the range switch [s]. */
  rangeTau: 3,
} as const;

export interface GalvoState {
  /** Needle deflection φ [rad] (+ = to the right = current counter-clockwise seen from the magnet). */
  phi: number;
  /** Angular velocity φ' [rad/s]. */
  omega: number;
}

/** Static deflection [rad] for a current i on the full scale iFs (clamped at the pins). */
export function galvoTarget(i: number, iFs: number): number {
  const deg = (GALVO.fullScaleDeg * i) / iFs;
  const lim = GALVO.pinDeg;
  return (Math.min(lim, Math.max(-lim, Number.isFinite(deg) ? deg : 0)) * Math.PI) / 180;
}

const GALVO_Y = [0, 0];
const GALVO_WORK = createRk4Work(2);

/** One RK4 step of the needle dynamics toward the static deflection `target` [rad]. */
export function galvoStep(s: GalvoState, target: number, dt: number): GalvoState {
  const w0 = 2 * Math.PI * GALVO.f0;
  const f = (_t: number, y: readonly number[]): number[] => [
    y[1] as number,
    w0 * w0 * (target - (y[0] as number)) - 2 * GALVO.zeta * w0 * (y[1] as number),
  ];
  GALVO_Y[0] = s.phi;
  GALVO_Y[1] = s.omega;
  const y = rk4Step(f, 0, GALVO_Y, dt, GALVO_WORK); // no per-step arrays (QA-038)
  const lim = (GALVO.pinDeg * Math.PI) / 180;
  const phi = y[0] as number;
  // End pins: the needle stops there (inelastic).
  if (phi > lim) return { phi: lim, omega: 0 };
  if (phi < -lim) return { phi: -lim, omega: 0 };
  return { phi, omega: y[1] as number };
}

// --- coil and magnet drawing (scene) -----------------------------------------------

/** Turns drawn for N real turns: min(N, cap). The label always shows the real N. */
export function visualTurns(N: number, cap: number): number {
  return Math.max(1, Math.min(cap, Math.round(N)));
}

/**
 * Layered winding of `turns` drawn turns with at most `perLayerMax` turns per
 * layer (real coils are wound in layers, back and forth): number of layers and
 * turns in the longest layer.
 */
export function windingLayout(
  turns: number,
  perLayerMax: number,
): { layers: number; perLayer: number } {
  const t = Math.max(1, Math.round(turns));
  const layers = Math.ceil(t / Math.max(1, perLayerMax));
  return { layers, perLayer: Math.ceil(t / layers) };
}

/** Number of point dipoles that represent the bar magnet when tracing field lines. */
export const MAGNET_DIPOLES = 8;

/**
 * Positions (along the magnet axis, from its centre) of the K point dipoles of
 * the finite dipole used for the drawn field lines: a uniformly magnetised bar
 * is a line of equal dipoles m/K at the centres of K equal slices. Its far field
 * is exactly the point dipole of the flux model.
 */
export function dipoleChain(length: number, k: number = MAGNET_DIPOLES): number[] {
  return Array.from({ length: k }, (_, j) => -length / 2 + ((j + 0.5) * length) / k);
}

/**
 * Visual gain of the induced field lines: their pulse speed/brightness factor is
 * min(1,2; G · |B_ind| / |B̄|) with both fields at the coil. The real induced
 * field is ~10⁻³ of the magnet's (µT vs mT), so without a gain it would be
 * invisible; the labels always show the real values.
 */
export const INDUCED_VISUAL_GAIN = 500;

/** Flow factor of the induced field lines (see {@link INDUCED_VISUAL_GAIN}). */
export function inducedFlow(Bind: number, Bmag: number): number {
  if (!(Math.abs(Bmag) > 0)) return 0;
  return Math.min(1.2, (INDUCED_VISUAL_GAIN * Math.abs(Bind)) / Math.abs(Bmag));
}
