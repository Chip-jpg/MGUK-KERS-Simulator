import type { ParamsSchema } from '../../core/types';

/** Numeric parameters of `rl-energy` (SI units; `unit` is the display symbol). */
export interface RlParams {
  /** Generator emf [V]. */
  E: number;
  /** Resistance [Ω]. */
  R: number;
  /** Inductance [H] (used when "L da solenoide" is off). */
  L: number;
  /** Solenoid turns [-]. */
  N: number;
  /** Solenoid cross-section [m²]. */
  S: number;
  /** Solenoid length [m]. */
  l: number;
  /** Relative permeability of the core [-]. */
  muR: number;
}

/**
 * Defaults reproduce the worked example of theory section 06:
 * E = 12 V, R = 4 Ω, L = 0,20 H ⇒ I₀ = 3 A, τ = 0,05 s, U_M = 0,90 J.
 */
export const params = {
  E: { min: 1, max: 24, step: 0.5, default: 12, unit: 'V', labelIT: 'F.e.m. del generatore E' },
  R: { min: 0.5, max: 100, step: 0.5, default: 4, unit: 'Ω', labelIT: 'Resistenza R' },
  L: { min: 0.01, max: 2, step: 0.01, default: 0.2, unit: 'H', labelIT: 'Induttanza L' },
  N: { min: 100, max: 5000, step: 50, default: 1000, unit: 'spire', labelIT: 'Spire N' },
  S: {
    min: 0.0001,
    max: 0.01,
    step: 0.0001,
    default: 0.001,
    unit: 'm²',
    labelIT: 'Sezione S',
  },
  l: { min: 0.05, max: 1, step: 0.01, default: 0.2, unit: 'm', labelIT: 'Lunghezza l' },
  muR: {
    min: 1,
    max: 1000,
    step: 1,
    default: 100,
    unit: '(adimensionale)',
    labelIT: 'Permeabilità relativa del nucleo μᵣ',
  },
} satisfies ParamsSchema<RlParams>;

export type ParamKey = keyof RlParams;

export function defaultParams(): RlParams {
  const out = {} as RlParams;
  for (const k of Object.keys(params) as ParamKey[]) out[k] = params[k].default;
  return out;
}
