import type { ParamsSchema } from '../../core/types';

/** Numeric parameters of the `lenz` simulator (SI units). */
export interface LenzParams {
  /** Magnet speed [m/s] (auto run speed, and max follow speed in manual mode). */
  v: number;
  /** Number of turns of the coil. */
  N: number;
  /** Coil radius [m]. */
  a: number;
  /** Circuit resistance [Ω]. */
  R: number;
  /** Magnet dipole moment [A·m²]. */
  m: number;
}

export const params = {
  v: {
    min: 0.05,
    max: 1,
    step: 0.05,
    default: 0.3,
    unit: 'm/s',
    labelIT: 'Velocità del magnete v',
  },
  N: { min: 1, max: 500, step: 1, default: 200, unit: 'spire', labelIT: 'Numero di spire N' },
  a: {
    min: 0.02,
    max: 0.08,
    step: 0.005,
    default: 0.04,
    unit: 'm',
    labelIT: 'Raggio della bobina a',
  },
  R: {
    min: 0.5,
    max: 100,
    step: 0.5,
    default: 10,
    unit: 'Ω',
    labelIT: 'Resistenza del circuito R',
  },
  m: {
    min: 0.5,
    max: 20,
    step: 0.5,
    default: 5,
    unit: 'A·m²',
    labelIT: 'Momento magnetico del magnete m',
  },
} satisfies ParamsSchema<LenzParams>;

/** Default values of {@link params}. */
export function defaultParams(): LenzParams {
  return {
    v: params.v.default,
    N: params.N.default,
    a: params.a.default,
    R: params.R.default,
    m: params.m.default,
  };
}
