/**
 * Pure, DOM-free model of the `alternator-motor` simulator: ONE rectangular
 * N-turn coil rotating in a uniform field B, used either as a generator
 * (braking: the Lenz torque opposes the motion) or as a motor (the battery
 * current produces a Lorentz force F = B·I·L and therefore a torque).
 *
 * Built only from `src/physics` (rotatingLoop, inducedCurrent, lorentzForce,
 * jouleLoss, rk4Step). SI units everywhere.
 *
 * Geometry and sign conventions
 * -----------------------------
 * - B is uniform along +x. The rotor axis is +y; the coil has two ACTIVE sides
 *   of length L parallel to the axis (perpendicular to B) at distance w/2 from
 *   it, so S = L·w. θ is the rotor angle (right-handed about +y); the coil
 *   normal is n̂(θ) = (cos θ, 0, −sin θ), so Φ = B·S·cos θ per turn (slide 7).
 * - With a variable speed ω = dθ/dt, Faraday-Neumann gives
 *   f.e.m. = −N·dΦ/dt = N·B·S·sin θ · ω. We evaluate `rotatingLoop(B, S, N, 1, θ)`
 *   (unit speed, "time" = θ) to get k(θ) = N·B·S·sin θ, then emf = k(θ)·ω.
 *   For constant ω this is exactly the slide-18/19 law V₀·sin(ωt).
 * - `sideCurrent` s is the current in the active side at +w/2 flowing along +y
 *   (the other side carries −s). Lorentz force on one side (N turns):
 *   F = N·lorentzForce(B, s, L) along ∓z; torque of the pair about +y:
 *   τ_em = 2 · (w/2) · sin θ · N · lorentzForce(B, s, L) = N·B·s·L·w·sin θ = k(θ)·s.
 * - Generator: the emf drives the current i = emf / (R_w + R_c) through the
 *   winding and the load; it flows against +y in the reference side (s = −i),
 *   so τ_em = −k·i and τ_em·ω = −emf·i: the Lenz torque brakes the rotor and
 *   the mechanical power removed equals the electrical power generated.
 * - Motor: "alimentazione sincronizzata" — the drive applies v_s(θ) = V_s·sin θ,
 *   always IN PHASE with the back-emf (ideal inverter/commutation), so the
 *   current i = (v_s − emf)/R_w = (V_s − N·B·S·ω)·sin θ / R_w has the sign of
 *   sin θ and the torque τ_em = k·i ∝ sin²θ is never negative (mean torque > 0
 *   below the no-load speed V_s / (N·B·S)). Here s = +i and τ_em·ω = emf·i.
 *   The identity |τ_em·ω| = |emf·i| holds by construction in both modes.
 *
 * Assumptions (shown to the user as the "Modello semplificato" note)
 * -----------------------------------------------------------------
 * Uniform B, one rectangular coil (single-phase, slides 18–19), coil
 * self-inductance neglected (current follows the emf instantly, slide 9),
 * no iron losses or saturation, ideal source. In generator mode the battery
 * (with its converter) is modelled as an equivalent RESISTIVE load R_c: the
 * power it receives is R_c·i². In motor mode the shaft drives a friction-like
 * load torque τ_c·tanh(ω/ω_s), smoothed near ω = 0 so a stopped rotor is not
 * pushed backwards.
 *
 * Energy bookkeeping
 * ------------------
 * The RK4 state vector carries, besides θ and ω, the running integrals of the
 * powers (slides 16–17: f.e.m.·i·Δt = R·i²·Δt + …):
 *   generator: E_in = ∫τ_ext·ω dt (external shaft work), E_out = ∫R_c·i² dt
 *              (to the battery), E_J = ∫R_w·i² dt, E_conv = ∫emf·i dt;
 *              balance: E_in + (E_kin,0 − E_kin) = E_out + E_J.
 *   motor:     E_in = ∫v_s·i dt (from the battery), E_out = ∫τ_load·ω dt
 *              (to the load), E_J = ∫R_w·i² dt, E_conv = ∫emf·i dt;
 *              balance: E_in = E_out + (E_kin − E_kin,0) + E_J.
 */
import { inducedCurrent, jouleLoss, lorentzForce, rk4Step, rotatingLoop } from '../../physics';
import type { OdeRhs } from '../../physics';
import type { ParamsSchema } from '../../core/types';

export type MachineMode = 'generator' | 'motor';

export interface MachineParams {
  /** Magnetic field [T]. */
  B: number;
  /** Number of turns [-]. */
  N: number;
  /** Active side length (conductor length inside B) [m]. */
  L: number;
  /** Coil width = 2 × lever arm [m]. */
  w: number;
  /** Rotor moment of inertia [kg·m²]. */
  J: number;
  /** Winding resistance [Ω]. */
  Rw: number;
  /** Generator: equivalent resistive load of battery + converter [Ω]. */
  Rload: number;
  /** Generator: initial angular speed (start of the braking) [rad/s]. */
  omega0: number;
  /** Generator: external driving torque from the wheels/axle [N·m]. */
  tauExt: number;
  /** Motor: peak of the synchronised supply voltage v_s = V_s·sin θ [V]. */
  Vs: number;
  /** Motor: load (resisting) torque on the shaft [N·m]. */
  tauLoad: number;
}

/** Parameter schema (§4.3): SI values, Italian labels. */
export const params = {
  B: { min: 0.2, max: 1.2, step: 0.05, default: 0.8, unit: 'T', labelIT: 'Campo magnetico B' },
  N: { min: 10, max: 100, step: 1, default: 50, unit: 'spire', labelIT: 'Numero di spire N' },
  L: { min: 0.1, max: 0.3, step: 0.01, default: 0.2, unit: 'm', labelIT: 'Lato attivo L' },
  w: { min: 0.05, max: 0.2, step: 0.01, default: 0.1, unit: 'm', labelIT: 'Larghezza spira w' },
  J: {
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.5,
    unit: 'kg·m²',
    labelIT: "Momento d'inerzia del rotore J",
  },
  Rw: {
    min: 0.2,
    max: 3,
    step: 0.1,
    default: 1,
    unit: 'Ω',
    labelIT: "Resistenza dell'avvolgimento R_w",
  },
  Rload: {
    min: 0.5,
    max: 20,
    step: 0.5,
    default: 4,
    unit: 'Ω',
    labelIT: 'Carico equivalente batteria R_c',
  },
  omega0: {
    min: 0,
    max: 100,
    step: 1,
    default: 30,
    unit: 'rad/s',
    labelIT: 'Velocità iniziale ω₀',
  },
  tauExt: {
    min: 0,
    max: 3,
    step: 0.1,
    default: 0,
    unit: 'N·m',
    labelIT: 'Coppia esterna dalle ruote τ_est',
  },
  Vs: {
    min: 0,
    max: 48,
    step: 1,
    default: 24,
    unit: 'V',
    labelIT: 'Tensione di picco batteria V_s',
  },
  tauLoad: {
    min: 0,
    max: 5,
    step: 0.1,
    default: 2,
    unit: 'N·m',
    labelIT: 'Coppia resistente del carico τ_c',
  },
} satisfies ParamsSchema<MachineParams>;

/** Parameter keys used only in one mode (the UI hides the others). */
export const MODE_PARAMS: Record<MachineMode, readonly (keyof MachineParams)[]> = {
  generator: ['Rload', 'omega0', 'tauExt'],
  motor: ['Vs', 'tauLoad'],
};

export function defaultParams(): MachineParams {
  const out = {} as MachineParams;
  for (const k of Object.keys(params) as (keyof MachineParams)[]) out[k] = params[k].default;
  return out;
}

/** Speed scale of the smoothed load torque τ_c·tanh(ω/ω_s) [rad/s]. */
export const LOAD_OMEGA_SMOOTH = 0.5;

/**
 * Overspeed protection [rad/s]: the energy INPUT (generator: external torque;
 * motor: supply voltage) is faded out linearly between ω_max − band and ω_max,
 * like a clutch/inverter speed limit. It acts on the source, so the energy
 * bookkeeping stays exact (E_in integrates the power actually delivered).
 */
export const OMEGA_MAX = 150;
export const OMEGA_LIMIT_BAND = 10;

/** Input fade factor in [0, 1] (1 below ω_max − band, 0 above ω_max). */
export function speedLimiter(omega: number): number {
  return Math.min(1, Math.max(0, (OMEGA_MAX - omega) / OMEGA_LIMIT_BAND));
}

/** Max rotor angle advanced per RK4 sub-step [rad] (resolves the 2ω torque ripple). */
export const MAX_ANGLE_PER_SUBSTEP = 0.1;
/** Max sub-step relative to the fastest electromechanical time constant. */
export const MAX_STEP_OVER_TAU = 0.15;
/** Hard cap on sub-steps per physics step (performance guard). */
export const MAX_SUBSTEPS = 256;

/**
 * Fastest electromechanical time constant τ_min = J·R / (N·B·S)² [s]
 * (worst case sin²θ = 1; R = R_w + R_c for the generator, R_w for the motor).
 */
export function electromechTau(mode: MachineMode, p: MachineParams): number {
  const kMax = p.N * p.B * coilArea(p);
  const R = mode === 'generator' ? p.Rw + p.Rload : p.Rw;
  return kMax > 0 ? (p.J * R) / (kMax * kMax) : Infinity;
}

/**
 * Number of equal RK4 sub-steps used inside ONE physics step dt (§4.1 fixed
 * step 1/240 s is kept; sub-stepping only keeps RK4 accurate/stable when the
 * slider combination makes the system stiff or fast). Deterministic: depends
 * only on parameters, dt and the current ω.
 */
export function substeps(mode: MachineMode, p: MachineParams, omega: number, dt: number): number {
  const byTau = dt / (MAX_STEP_OVER_TAU * electromechTau(mode, p));
  const byAngle = (Math.abs(omega) * dt) / MAX_ANGLE_PER_SUBSTEP;
  return Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.max(byTau, byAngle))));
}

/** Initial rotor angle: generator Φ max (slide 18 convention), motor max torque. */
export const THETA0: Record<MachineMode, number> = { generator: 0, motor: Math.PI / 2 };

/** Area of one turn S = L·w [m²]. */
export function coilArea(p: Pick<MachineParams, 'L' | 'w'>): number {
  return p.L * p.w;
}

/**
 * State vector layout for {@link rk4Step}:
 * [θ, ω, E_in, E_out, E_J, E_conv] (rad, rad/s, J, J, J, J).
 */
export const IDX = { theta: 0, omega: 1, eIn: 2, eOut: 3, eJoule: 4, eConv: 5 } as const;

export interface MachineState {
  t: number;
  y: number[];
}

/** Instantaneous electrical and mechanical quantities at (θ, ω). */
export interface Instant {
  /** Flux through one turn Φ = B·S·cos θ [Wb]. */
  phi: number;
  /** k(θ) = N·B·S·sin θ [V·s/rad] (emf per unit speed). */
  k: number;
  /** Induced emf (back-emf in motor mode) = k·ω [V]. */
  emf: number;
  /** Supply voltage (motor) or voltage across the load R_c (generator) [V]. */
  vTerm: number;
  /** Circuit current, positive in the mode's natural direction [A]. */
  i: number;
  /** Current in the reference active side, along +y [A]. */
  sideCurrent: number;
  /** Signed Lorentz force on ONE active side (all N turns) [N]. */
  forceSide: number;
  /** Electromagnetic torque on the rotor, positive along +θ [N·m]. */
  tauEm: number;
  /** Shaft torque from outside, positive along +θ (generator τ_est, motor −τ_load) [N·m]. */
  tauShaft: number;
  /** Converted power emf·i ≥ 0 (mechanical ↔ electrical) [W]. */
  pConv: number;
  /** Mechanical power at the shaft: generator in (τ_est·ω), motor out (τ_load·ω) [W]. */
  pMech: number;
  /** Electrical power: generator to the battery (R_c·i²), motor from the battery (v_s·i) [W]. */
  pElec: number;
  /** Joule loss in the winding R_w·i² [W]. */
  pJoule: number;
}

/** Electromagnetic torque from the Lorentz force on the two active sides. */
export function lorentzTorque(p: MachineParams, sideCurrent: number, theta: number): number {
  const forceSide = p.N * lorentzForce(p.B, sideCurrent, p.L); // conductor ⟂ B
  // Two sides, lever arm w/2, tangential component ∝ sin θ.
  return 2 * (p.w / 2) * Math.sin(theta) * forceSide;
}

export function instant(
  mode: MachineMode,
  p: MachineParams,
  theta: number,
  omega: number,
): Instant {
  const S = coilArea(p);
  const unit = rotatingLoop(p.B, S, p.N, 1, theta); // emf at unit speed = N B S sin θ
  const k = unit.emf;
  const emf = k * omega;
  let i: number;
  let sideCurrent: number;
  let vTerm: number;
  let tauShaft: number;
  let pMech: number;
  let pElec: number;
  if (mode === 'generator') {
    i = inducedCurrent(emf, p.Rw + p.Rload);
    sideCurrent = -i; // Lenz: the induced current makes a braking torque
    vTerm = p.Rload * i;
    tauShaft = p.tauExt * speedLimiter(omega);
    pMech = tauShaft * omega;
    pElec = jouleLoss(p.Rload, i);
  } else {
    // synchronised supply, in phase with the back-emf (faded out above ω_max)
    vTerm = p.Vs * speedLimiter(omega) * Math.sin(theta);
    i = inducedCurrent(vTerm - emf, p.Rw);
    sideCurrent = i;
    const tauLoad = p.tauLoad * Math.tanh(omega / LOAD_OMEGA_SMOOTH);
    tauShaft = -tauLoad;
    pMech = tauLoad * omega;
    pElec = vTerm * i;
  }
  const forceSide = p.N * lorentzForce(p.B, sideCurrent, p.L);
  const tauEm = lorentzTorque(p, sideCurrent, theta);
  return {
    phi: unit.phi,
    k,
    emf,
    vTerm,
    i,
    sideCurrent,
    forceSide,
    tauEm,
    tauShaft,
    pConv: emf * i,
    pMech,
    pElec,
    pJoule: jouleLoss(p.Rw, i),
  };
}

/** Right-hand side dy/dt for {@link rk4Step} (state layout {@link IDX}). */
export function derivatives(mode: MachineMode, p: MachineParams): OdeRhs {
  return (_t, y) => {
    const theta = y[IDX.theta] as number;
    const omega = y[IDX.omega] as number;
    const q = instant(mode, p, theta, omega);
    return [
      omega,
      (q.tauShaft + q.tauEm) / p.J,
      mode === 'generator' ? q.pMech : q.pElec,
      mode === 'generator' ? q.pElec : q.pMech,
      q.pJoule,
      q.pConv,
    ];
  };
}

export function initialState(mode: MachineMode, p: MachineParams): MachineState {
  return { t: 0, y: [THETA0[mode], mode === 'generator' ? p.omega0 : 0, 0, 0, 0, 0] };
}

/** Advance by one fixed RK4 step (dt = PHYSICS_DT in the app). Pure. */
export function step(
  mode: MachineMode,
  p: MachineParams,
  s: MachineState,
  dt: number,
): MachineState {
  return stepWith(derivatives(mode, p), mode, p, s, dt);
}

function stepWith(
  f: OdeRhs,
  mode: MachineMode,
  p: MachineParams,
  s: MachineState,
  dt: number,
): MachineState {
  const n = substeps(mode, p, s.y[IDX.omega] as number, dt);
  const h = dt / n;
  let y = s.y;
  for (let j = 0; j < n; j++) y = rk4Step(f, s.t + j * h, y, h);
  return { t: s.t + dt, y };
}

export function simulate(
  mode: MachineMode,
  p: MachineParams,
  duration: number,
  dt: number,
  from: MachineState = initialState(mode, p),
): MachineState {
  const n = Math.round(duration / dt);
  const f = derivatives(mode, p);
  let s = from;
  for (let j = 0; j < n; j++) s = stepWith(f, mode, p, s, dt);
  return s;
}

export function kineticEnergy(J: number, omega: number): number {
  return 0.5 * J * omega * omega;
}

export interface EnergyBalance {
  /** Energy entering the conversion: generator mechanical (shaft work + kinetic energy released), motor electrical (battery) [J]. */
  input: number;
  /** Useful output: generator to the battery, motor shaft work + kinetic energy stored [J]. */
  useful: number;
  /** Joule losses in the winding [J]. */
  losses: number;
  /** ΔE_kin = E_kin − E_kin,0 [J]. */
  dEkin: number;
  /** input − (useful + losses) [J]. */
  residual: number;
  /** |residual| / |input| (0 when input = 0). */
  relError: number;
}

/** Energy bookkeeping between two states of the same run. */
export function energyBalance(
  mode: MachineMode,
  p: MachineParams,
  s0: MachineState,
  s: MachineState,
): EnergyBalance {
  const g = (st: MachineState, k: number): number => st.y[k] as number;
  const dEkin = kineticEnergy(p.J, g(s, IDX.omega)) - kineticEnergy(p.J, g(s0, IDX.omega));
  const eIn = g(s, IDX.eIn) - g(s0, IDX.eIn);
  const eOut = g(s, IDX.eOut) - g(s0, IDX.eOut);
  const losses = g(s, IDX.eJoule) - g(s0, IDX.eJoule);
  const input = mode === 'generator' ? eIn - dEkin : eIn;
  const useful = mode === 'generator' ? eOut : eOut + dEkin;
  const residual = input - (useful + losses);
  return {
    input,
    useful,
    losses,
    dEkin,
    residual,
    relError: input === 0 ? 0 : Math.abs(residual) / Math.abs(input),
  };
}

/** ω [rad/s] → giri/min. */
export function rpm(omega: number): number {
  return (omega * 60) / (2 * Math.PI);
}

/** Motor no-load speed V_s / (N·B·S) [rad/s] (back-emf peak = supply peak). */
export function noLoadSpeed(p: MachineParams): number {
  const kMax = p.N * p.B * coilArea(p);
  return kMax > 0 ? p.Vs / kMax : 0;
}
