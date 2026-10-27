/**
 * Display scaling for quantities that span many orders of magnitude
 * (V₀ goes from ~5 µV to ~7,5 kV over the slider ranges). Pure, DOM-free.
 */
import { radToDeg } from '../../physics';

export interface DisplayScale {
  /** Multiply the SI value by this before formatting. */
  scale: number;
  /** Prefixed unit, e.g. 'mV'. */
  unit: string;
  /** Fraction digits giving ≈ 3 significant digits at the reference amplitude. */
  digits: number;
}

const PREFIXES: ReadonlyArray<[number, string]> = [
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
];

/**
 * Choose an SI prefix so that the reference amplitude `ref` (e.g. V₀ for the emf,
 * B·S for the flux) is shown as a mantissa in [1, 1000) with ≈ 3 significant digits.
 */
export function chooseScale(ref: number, baseUnit: string): DisplayScale {
  const a = Math.abs(ref);
  let factor = 1;
  let prefix = '';
  if (Number.isFinite(a) && a > 0) {
    const found = PREFIXES.find(([f]) => a >= f * (1 - 1e-12));
    const [f, p] = found ?? (PREFIXES[PREFIXES.length - 1] as [number, string]);
    factor = f;
    prefix = p;
  }
  const mantissa = a / factor;
  const digits = mantissa >= 100 ? 0 : mantissa >= 10 ? 1 : 2;
  return { scale: 1 / factor, unit: `${prefix}${baseUnit}`, digits };
}

/** Angle in radians → degrees in [0, 360) for display (the only place degrees appear). */
export function toDegrees360(rad: number): number {
  const d = radToDeg(rad);
  const w = ((d % 360) + 360) % 360;
  return w >= 359.9999999 ? 0 : w;
}
