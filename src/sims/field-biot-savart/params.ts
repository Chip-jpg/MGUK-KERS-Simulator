import type { ParamsSchema } from '../../core/types';

/** Coil geometry shown by the simulator. */
export type Geometry = 'loop' | 'solenoid' | 'helmholtz';

export const GEOMETRY_OPTIONS: ReadonlyArray<{ value: Geometry; labelIT: string }> = [
  { value: 'loop', labelIT: 'Spira singola' },
  { value: 'solenoid', labelIT: 'Solenoide' },
  { value: 'helmholtz', labelIT: 'Bobine di Helmholtz' },
];

/** Numeric parameters of `field-biot-savart` (SI units; `unit` is the display symbol). */
export interface BiotParams {
  /** Current [A]. */
  I: number;
  /** Turns (per coil for Helmholtz) [-]. */
  N: number;
  /** Coil radius [m]. */
  R: number;
  /** Solenoid length [m] (solenoid only). */
  l: number;
  /** Number of traced field lines [-]. */
  lines: number;
}

/**
 * Defaults: a solenoid with N = 40, R = 3 cm, l = 30 cm (l/R = 10), I = 5 A ⇒
 * ideal B = μ₀NI/l ≈ 0,84 mT.
 */
export const params = {
  I: { min: 0.5, max: 20, step: 0.5, default: 5, unit: 'A', labelIT: 'Corrente I' },
  N: { min: 1, max: 80, step: 1, default: 40, unit: 'spire', labelIT: 'Spire N' },
  R: { min: 0.01, max: 0.1, step: 0.005, default: 0.03, unit: 'm', labelIT: 'Raggio R' },
  l: { min: 0.05, max: 0.6, step: 0.01, default: 0.3, unit: 'm', labelIT: 'Lunghezza l' },
  lines: {
    min: 4,
    max: 24,
    step: 2,
    default: 12,
    unit: 'linee',
    labelIT: 'Numero di linee di campo',
  },
} satisfies ParamsSchema<BiotParams>;

export type ParamKey = keyof BiotParams;

export const DEFAULT_GEOMETRY: Geometry = 'solenoid';

export function defaultParams(): BiotParams {
  const out = {} as BiotParams;
  for (const k of Object.keys(params) as ParamKey[]) out[k] = params[k].default;
  return out;
}
