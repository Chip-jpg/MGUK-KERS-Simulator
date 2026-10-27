import type { ParamsSchema } from '../../core/types';
import type { TransmissionInputs } from './model';

/**
 * Tunable parameters of `joule-transformer` (SI units; `unit` is the display
 * symbol). Defaults reproduce the worked example of theory section 08:
 * P = 10 MW, R = 5 Ω, 20 kV → 200 kV ⇒ loss 1,25 MW → 12,5 kW.
 */
export const params = {
  V1: {
    min: 10_000,
    max: 25_000,
    step: 500,
    default: 20_000,
    unit: 'V',
    labelIT: 'Tensione del generatore V₁',
  },
  N1: { min: 50, max: 2000, step: 10, default: 100, unit: 'spire', labelIT: 'Spire primario N₁' },
  N2: {
    min: 50,
    max: 4000,
    step: 50,
    default: 1000,
    unit: 'spire',
    labelIT: 'Spire secondario N₂',
  },
  P: {
    min: 1_000_000,
    max: 100_000_000,
    step: 1_000_000,
    default: 10_000_000,
    unit: 'W',
    labelIT: 'Potenza trasmessa P',
  },
  Rline: {
    min: 0.5,
    max: 50,
    step: 0.5,
    default: 5,
    unit: 'Ω',
    labelIT: 'Resistenza della linea R',
  },
} satisfies ParamsSchema<TransmissionInputs>;

export type ParamKey = keyof typeof params;

/** Default inputs taken from {@link params}. */
export function defaultInputs(): TransmissionInputs {
  return {
    V1: params.V1.default,
    N1: params.N1.default,
    N2: params.N2.default,
    P: params.P.default,
    Rline: params.Rline.default,
  };
}
