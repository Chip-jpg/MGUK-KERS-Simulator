import { formatIT } from '../core/format';

/**
 * Number formatting and parsing for numeric quiz answers (Italian style).
 *
 * Formatting: decimal comma via `formatIT`; values outside [0,01; 10 000) are
 * written in scientific notation "2,5·10⁻⁴" so the canonical answer never
 * contains a thousands separator (which the parser would read as a decimal dot).
 *
 * Parsing accepts: "62,5", "62.5", "-0,5", "1.234,5", "2,5e-4", "2,5E-4",
 * "2,5·10^-4", "2,5*10^(-4)", "2,5x10^-4", "2,5 × 10^{-4}", "2,5·10⁻⁴",
 * "10^-4", Unicode minus "−", spaces and non-breaking spaces.
 */

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
};
const FROM_SUP: Record<string, string> = Object.fromEntries(
  Object.entries(SUP).map(([k, v]) => [v, k]),
);

interface Parts {
  /** Fixed notation (exp = 0) or mantissa (exp ≠ 0), already Italian-formatted. */
  mantissa: string;
  exp: number;
}

function trimZeros(s: string): string {
  return s.includes(',') ? s.replace(/0+$/, '').replace(/,$/, '') : s;
}

function parts(x: number, sig: number, trim: boolean): Parts {
  if (!Number.isFinite(x)) return { mantissa: formatIT(x), exp: 0 };
  if (x === 0) return { mantissa: '0', exp: 0 };
  const s = Math.max(1, Math.round(sig));
  let e = Math.floor(Math.log10(Math.abs(x)));
  // Rounding can push the mantissa to 10 (9,996 → 10,0): re-normalise.
  const m0 = Number((x / 10 ** e).toFixed(s - 1));
  if (Math.abs(m0) >= 10) e += 1;
  const fix = (str: string): string => (trim ? trimZeros(str) : str);
  if (e >= -2 && e <= 3) {
    return { mantissa: fix(formatIT(x, Math.max(0, s - 1 - e))), exp: 0 };
  }
  return { mantissa: fix(formatIT(x / 10 ** e, s - 1)), exp: e };
}

/**
 * Plain-text Italian number with `sig` significant digits, e.g.
 * `formatNumber(2.5e-4) === '2,50·10⁻⁴'`, `formatNumber(62.5) === '62,5'`.
 * @param trim - drop trailing zeros (for prompt values, e.g. "0,5" not "0,500")
 */
export function formatNumber(x: number, sig = 3, trim = false): string {
  const p = parts(x, sig, trim);
  if (p.exp === 0) return p.mantissa;
  const exp = String(p.exp)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');
  return `${p.mantissa}·10${exp}`;
}

/** Same number as TeX: `2{,}5\cdot 10^{-4}` (decimal comma without extra space). */
export function texNumber(x: number, sig = 3, trim = false): string {
  const p = parts(x, sig, trim);
  const m = p.mantissa
    .replace(/\./g, '')
    .replace(/,/g, '{,}')
    .replace(/\u00a0/g, '');
  return p.exp === 0 ? m : `${m}\\cdot 10^{${p.exp}}`;
}

/** Prompt value: up to 4 significant digits, trailing zeros removed. */
export function fmt(x: number, unit?: string, sig = 4): string {
  const n = formatNumber(x, sig, true);
  return unit ? `${n}\u00a0${unit}` : n;
}

/** TeX prompt value with unit: `0{,}5\ \text{T}`. */
export function tex(x: number, unit?: string, sig = 4): string {
  const n = texNumber(x, sig, true);
  return unit ? `${n}\\ \\text{${unit}}` : n;
}

function parseDecimal(s: string): number | null {
  if (s === '') return null;
  let body = s;
  let sign = '';
  if (body[0] === '+' || body[0] === '-') {
    sign = body[0] === '-' ? '-' : '';
    body = body.slice(1);
  }
  if (!/^[0-9.,]+$/.test(body) || !/[0-9]/.test(body)) return null;
  const commas = (body.match(/,/g) ?? []).length;
  const dots = (body.match(/\./g) ?? []).length;
  let normal: string;
  if (commas > 0 && dots > 0) {
    // Both present: the last one is the decimal separator, the other groups thousands.
    const decimalIsComma = body.lastIndexOf(',') > body.lastIndexOf('.');
    const dec = decimalIsComma ? ',' : '.';
    const grp = decimalIsComma ? '.' : ',';
    if ((body.match(new RegExp(`\\${dec}`, 'g')) ?? []).length !== 1) return null;
    const [intPart = '', fracPart = ''] = body.split(dec);
    if (!/^\d{1,3}(\.\d{3})*$|^\d{1,3}(,\d{3})*$/.test(intPart)) return null;
    normal = `${intPart.split(grp).join('')}.${fracPart}`;
  } else if (commas > 1) {
    return null;
  } else if (commas === 1) {
    normal = body.replace(',', '.');
  } else if (dots > 1) {
    // "1.234.567": Italian thousands separators.
    if (!/^\d{1,3}(\.\d{3})+$/.test(body)) return null;
    normal = body.replace(/\./g, '');
  } else {
    normal = body; // single dot = decimal point
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normal)) return null;
  const v = Number(sign + normal);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse a user-typed number (Italian or English decimals, scientific notation).
 * @returns the value, or `null` if the text is not a number
 */
export function parseNumberIT(input: string): number | null {
  let s = input
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[−–]/g, '-');
  if (s === '') return null;
  // Unicode superscripts → "^exp".
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => '^' + [...m].map((c) => FROM_SUP[c] ?? c).join(''));
  // e-notation.
  let m = /^([^eE]*)[eE]([+-]?\d+)$/.exec(s);
  if (m) {
    const mant = parseDecimal(m[1] ?? '');
    return mant === null ? null : finiteOrNull(mant * 10 ** Number(m[2]));
  }
  // "×10^exp" with optional (), {}.
  m = /^(.*?)([·*x×⋅]?)10\^[({]?([+-]?\d+)[)}]?$/.exec(s);
  if (m) {
    const head = m[1] ?? '';
    const op = m[2] ?? '';
    const exp = Number(m[3]);
    if (op === '' && head === '') return finiteOrNull(10 ** exp);
    if (op === '' && head === '-') return finiteOrNull(-(10 ** exp));
    // "2,510^-4" without an operator is ambiguous: reject.
    if (op === '') return null;
    const mant = parseDecimal(head);
    return mant === null ? null : finiteOrNull(mant * 10 ** exp);
  }
  return parseDecimal(s);
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * Relative-tolerance check: |given − expected| ≤ tol · |expected|.
 * `expected = 0` uses an absolute tolerance `tol`.
 */
export function withinTolerance(given: number, expected: number, tol: number): boolean {
  if (!Number.isFinite(given) || !Number.isFinite(expected)) return false;
  const scale = expected === 0 ? 1 : Math.abs(expected);
  return Math.abs(given - expected) <= tol * scale * (1 + 1e-12);
}
