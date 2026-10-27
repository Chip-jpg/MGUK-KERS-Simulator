/**
 * Italian number formatting for every number shown in the UI (decimal comma,
 * "." as thousands separator). Never format numbers with toFixed() in the UI.
 */

/** Non-breaking space between value and unit, so "62,5 mA" never wraps. */
export const UNIT_SEPARATOR = '\u00A0';

/** Placeholder for NaN / ±Infinity. */
export const NOT_A_NUMBER = '—';

const DEFAULT_DIGITS = 2;
const cache = new Map<number, Intl.NumberFormat>();

function formatter(digits: number): Intl.NumberFormat {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    cache.set(digits, f);
  }
  return f;
}

/**
 * Format a number Italian style.
 *
 * @param n - value (already in the display unit)
 * @param digits - fraction digits, integer 0–20 (default 2)
 * @param unit - optional unit symbol appended after a non-breaking space
 * @returns e.g. `formatIT(62.5, 1, 'mA') === '62,5\u00A0mA'`
 */
export function formatIT(n: number, digits: number = DEFAULT_DIGITS, unit?: string): string {
  const d = Number.isFinite(digits)
    ? Math.min(20, Math.max(0, Math.round(digits)))
    : DEFAULT_DIGITS;
  let text = Number.isFinite(n) ? formatter(d).format(n) : NOT_A_NUMBER;
  // Avoid "-0" / "-0,00" after rounding.
  if (/^-0(,0+)?$/.test(text)) text = text.slice(1);
  return unit ? `${text}${UNIT_SEPARATOR}${unit}` : text;
}
