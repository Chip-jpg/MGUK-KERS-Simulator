/**
 * Energy store (battery) of the KERS / MGU-K (fix round 1, F1/F9). Pure
 * functions, SI units, deterministic; no ODE needed: within one step of length
 * dt the terminal power is constant (zero-order hold), so every step is exact.
 *
 * Modello semplificato (docs/PHYSICS.md §13):
 * - state of charge soc = E_stored / capacityJ ∈ [0, 1] (usable energy only);
 * - terminal power P: > 0 discharge (deploy, battery → MGU-K), < 0 charge
 *   (harvest, MGU-K → battery); current I = |P| / vNominal (constant voltage);
 * - charge: stored power P_st = η_c·|P| − R·I²; losses (1 − η_c)·|P| + R·I²;
 * - discharge: power drawn from the store P_dr = |P| / η_d + R·I²; losses
 *   P_dr − |P| = (1/η_d − 1)·|P| + R·I²;
 * - therefore, exactly: E_in − E_out = ΔE_stored + E_loss (cumulative eIn,
 *   eOut, eLoss of {@link BatteryState});
 * - limits: |P| ≤ pChargeMax / pDischargeMax, and the step never takes soc
 *   below 0 or above 1: the granted power is clipped so that the step lands
 *   exactly on the bound;
 * - depletion with hysteresis: when soc reaches 0 the store is `depleted` and
 *   deploy is forbidden (pDeployMax = 0) until soc ≥ restartSoc again; harvest
 *   is always allowed.
 *
 * No temperature, no SoC-dependent open-circuit voltage, no ageing.
 */
import { finite, noNegZero, nonNegative, positive } from './validate';

/** Default hysteresis threshold for {@link BatteryParams.restartSoc} [-] (5 %). */
export const DEFAULT_RESTART_SOC = 0.05;

/** Parameters of the energy store (docs/FIX_ROUND_1.md §6.1). */
export interface BatteryParams {
  /** Usable energy [J], > 0. */
  capacityJ: number;
  /** Charge efficiency (0, 1]: stored = absorbed·etaCharge (before Joule loss). */
  etaCharge: number;
  /** Discharge efficiency (0, 1]: delivered = drawn·etaDischarge (before Joule loss). */
  etaDischarge: number;
  /** Internal resistance [Ω] ≥ 0: Joule loss R·I² with I = |P| / vNominal. */
  rInternal: number;
  /** Nominal (constant) terminal voltage [V] > 0. */
  vNominal: number;
  /** Limit on absorbed terminal power [W] ≥ 0. */
  pChargeMax: number;
  /** Limit on delivered terminal power [W] ≥ 0. */
  pDischargeMax: number;
  /** Hysteresis threshold in [0, 1] (default {@link DEFAULT_RESTART_SOC}). */
  restartSoc: number;
}

/** State of the energy store (docs/FIX_ROUND_1.md §6.1). */
export interface BatteryState {
  /** State of charge [0, 1]. */
  soc: number;
  /** True once soc hit 0; false again only when soc ≥ restartSoc. */
  depleted: boolean;
  /** Cumulative terminal energy absorbed (charge) [J]. */
  eIn: number;
  /** Cumulative terminal energy delivered (discharge) [J]. */
  eOut: number;
  /** Cumulative losses (η + Joule) [J]. */
  eLoss: number;
}

function checkParams(fn: string, p: BatteryParams): void {
  positive(fn, 'capacityJ', p.capacityJ);
  for (const [name, eta] of [
    ['etaCharge', p.etaCharge],
    ['etaDischarge', p.etaDischarge],
  ] as const) {
    finite(fn, name, eta);
    if (!(eta > 0 && eta <= 1))
      throw new RangeError(`${fn}: ${name} must be in (0, 1] (got ${eta})`);
  }
  nonNegative(fn, 'rInternal', p.rInternal);
  positive(fn, 'vNominal', p.vNominal);
  nonNegative(fn, 'pChargeMax', p.pChargeMax);
  nonNegative(fn, 'pDischargeMax', p.pDischargeMax);
  unitInterval(fn, 'restartSoc', p.restartSoc);
}

function unitInterval(fn: string, name: string, x: number): void {
  finite(fn, name, x);
  if (x < 0 || x > 1) throw new RangeError(`${fn}: ${name} must be in [0, 1] (got ${x})`);
}

function checkState(fn: string, s: BatteryState): void {
  unitInterval(fn, 'soc', s.soc);
}

/**
 * Initial state of the energy store.
 *
 * E_stored = soc0 · capacityJ; depleted = (soc0 = 0); eIn = eOut = eLoss = 0.
 *
 * @param p - battery parameters (see {@link BatteryParams})
 * @param soc0 - initial state of charge [-] in [0, 1]
 * @returns a fresh {@link BatteryState}
 * @throws RangeError on invalid parameters or soc0 ∉ [0, 1]
 * @slide none (extension: KERS energy store, fix round 1)
 */
export function createBattery(p: BatteryParams, soc0: number): BatteryState {
  const fn = 'createBattery';
  checkParams(fn, p);
  unitInterval(fn, 'soc0', soc0);
  return { soc: noNegZero(soc0), depleted: soc0 === 0, eIn: 0, eOut: 0, eLoss: 0 };
}

/**
 * Relative tolerance for "the step was limited by the SoC headroom": a request
 * within 1e-12 of the headroom power lands exactly on the bound (absorbs the
 * rounding of callers that rescale the limit, e.g. by an efficiency).
 */
const SNAP_TOL = 1e-12;

/** k = R / V² [1/W]: Joule loss = k·P². */
function joule(p: BatteryParams): number {
  return p.rInternal / (p.vNominal * p.vNominal);
}

/** Charge power that maximises the stored power η_c·P − k·P²: η_c/(2k) (∞ if R = 0). */
function chargePeak(etaC: number, k: number): number {
  return k > 0 ? etaC / (2 * k) : Infinity;
}

/**
 * Terminal charge power whose stored power η_c·P − k·P² equals `rate`
 * (smaller root, numerically stable form, ≤ the peak); +∞ when even the peak
 * stores less than `rate` (the headroom does not limit the step).
 */
function chargeForStoredRate(etaC: number, k: number, rate: number): number {
  const disc = etaC * etaC - 4 * k * rate;
  if (disc <= 0) return Infinity;
  return (2 * rate) / (etaC + Math.sqrt(disc));
}

/** Terminal discharge power whose drawn power P/η_d + k·P² equals `rate`. */
function dischargeForDrawnRate(etaD: number, k: number, rate: number): number {
  const b = 1 / etaD;
  return (2 * rate) / (b + Math.sqrt(b * b + 4 * k * rate));
}

/**
 * Terminal power limits for the next step of length dt, SoC- and
 * depletion-aware.
 *
 * pDeployMax = 0 if depleted, else min(pDischargeMax, P such that
 *   (P/η_d + R P²/V²)·dt = soc·C)  — never empties the store beyond 0;
 * pHarvestMax = min(pChargeMax, η_c V²/(2R), P such that
 *   (η_c P − R P²/V²)·dt = (1 − soc)·C)  — never fills beyond 1.
 * The cap η_c V²/(2R) is the charge power that maximises the stored power
 * (beyond it more current would store less); it is +∞ when R = 0.
 *
 * @param p - battery parameters
 * @param s - current state
 * @param dt - step length [s], > 0
 * @returns `pDeployMax`, `pHarvestMax` [W], both ≥ 0 (terminal powers)
 * @throws RangeError on invalid parameters/state or dt ≤ 0
 * @slide none (extension: KERS energy store, fix round 1)
 */
export function batteryLimits(
  p: BatteryParams,
  s: BatteryState,
  dt: number,
): { pDeployMax: number; pHarvestMax: number } {
  const fn = 'batteryLimits';
  checkParams(fn, p);
  checkState(fn, s);
  positive(fn, 'dt', dt);
  const k = joule(p);
  const pDeployMax = s.depleted
    ? 0
    : Math.min(
        p.pDischargeMax,
        dischargeForDrawnRate(p.etaDischarge, k, (s.soc * p.capacityJ) / dt),
      );
  const pHarvestMax = Math.min(
    chargePeak(p.etaCharge, k),
    p.pChargeMax,
    chargeForStoredRate(p.etaCharge, k, ((1 - s.soc) * p.capacityJ) / dt),
  );
  return { pDeployMax: noNegZero(pDeployMax), pHarvestMax: noNegZero(pHarvestMax) };
}

/**
 * One step of the energy store with constant terminal power over dt.
 *
 * Granted power: pTerminal = clamp(pRequest, −pHarvestMax, +pDeployMax) from
 * {@link batteryLimits} (|pTerminal| ≤ |pRequest|, same sign).
 * Charge (pTerminal < 0, P = |pTerminal|): ΔE = (η_c P − R P²/V²)·dt;
 * discharge (pTerminal > 0): ΔE = −(P/η_d + R P²/V²)·dt;
 * soc' = soc + ΔE / C, landing exactly on 0 or 1 when the bound limited the step.
 * Loss over the step = terminal energy in − ΔE (charge) or drawn − delivered
 * (discharge), so eIn − eOut = C·Δsoc + ΔeLoss holds exactly per step.
 * depleted' = true if soc' = 0; false if it was depleted and soc' ≥ restartSoc.
 *
 * @param p - battery parameters
 * @param s - current state (not mutated)
 * @param pRequest - requested terminal power [W]: > 0 discharge, < 0 charge
 * @param dt - step length [s], > 0
 * @returns new `state`, granted `pTerminal` [W] (sign as pRequest) and average
 *   loss power `pLoss` [W] ≥ 0 over the step
 * @throws RangeError on invalid parameters/state, non-finite pRequest or dt ≤ 0
 * @slide none (extension: KERS energy store; Joule loss as in slide 16)
 */
export function batteryStep(
  p: BatteryParams,
  s: BatteryState,
  pRequest: number,
  dt: number,
): { state: BatteryState; pTerminal: number; pLoss: number } {
  const fn = 'batteryStep';
  finite(fn, 'pRequest', pRequest);
  const lim = batteryLimits(p, s, dt);
  const k = joule(p);
  const C = p.capacityJ;
  let soc = s.soc;
  let pTerminal = 0;
  let eTerm = 0; // |terminal energy| [J]
  if (pRequest > 0) {
    pTerminal = Math.min(pRequest, lim.pDeployMax);
    eTerm = pTerminal * dt;
    const drawn = (pTerminal / p.etaDischarge + k * pTerminal * pTerminal) * dt;
    // Headroom-limited (the store would empty in this step): land exactly on 0.
    const headroom = dischargeForDrawnRate(p.etaDischarge, k, (s.soc * C) / dt);
    soc =
      pTerminal > 0 && pTerminal >= headroom * (1 - SNAP_TOL) ? 0 : Math.max(0, s.soc - drawn / C);
  } else if (pRequest < 0) {
    const P = Math.min(-pRequest, lim.pHarvestMax);
    pTerminal = -P;
    eTerm = P * dt;
    const stored = (p.etaCharge * P - k * P * P) * dt;
    const headroom = chargeForStoredRate(p.etaCharge, k, ((1 - s.soc) * C) / dt);
    soc = P > 0 && P >= headroom * (1 - SNAP_TOL) ? 1 : Math.min(1, s.soc + stored / C);
  }
  const eStoredDelta = (soc - s.soc) * C; // ΔE_stored [J]
  // Loss closes the balance exactly: charge: in − ΔE; discharge: −ΔE − out.
  const loss = Math.max(0, pTerminal > 0 ? -eStoredDelta - eTerm : eTerm - eStoredDelta);
  let depleted = s.depleted;
  if (soc <= 0) depleted = true;
  else if (depleted && soc >= p.restartSoc) depleted = false;
  const state: BatteryState = {
    soc: noNegZero(soc),
    depleted,
    eIn: s.eIn + (pTerminal < 0 ? eTerm : 0),
    eOut: s.eOut + (pTerminal > 0 ? eTerm : 0),
    eLoss: s.eLoss + loss,
  };
  return { state, pTerminal: noNegZero(pTerminal), pLoss: loss / dt };
}
