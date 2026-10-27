import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumberIT, texNumber, withinTolerance } from '../../src/quiz/numbers';

describe('parseNumberIT', () => {
  const ok: Array<[string, number]> = [
    ['62,5', 62.5],
    ['62.5', 62.5],
    [' 62,5 ', 62.5],
    ['-0,5', -0.5],
    ['−0,5', -0.5],
    ['+3', 3],
    [',5', 0.5],
    ['0,250', 0.25],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['1.234.567', 1234567],
    ['1 234', 1234],
    ['2,5e-4', 2.5e-4],
    ['2,5E-4', 2.5e-4],
    ['2.5e-4', 2.5e-4],
    ['2,5e+3', 2500],
    ['2,5·10^-4', 2.5e-4],
    ['2,5 · 10^-4', 2.5e-4],
    ['2,5*10^-4', 2.5e-4],
    ['2,5x10^-4', 2.5e-4],
    ['2,5×10^(-4)', 2.5e-4],
    ['2,5·10^{-4}', 2.5e-4],
    ['2,5·10⁻⁴', 2.5e-4],
    ['2,50·10⁶', 2.5e6],
    ['10^3', 1000],
    ['-10^3', -1000],
    ['0', 0],
  ];
  for (const [s, v] of ok) {
    it(`parses "${s}"`, () => {
      const r = parseNumberIT(s);
      expect(r).not.toBeNull();
      expect(r!).toBeCloseTo(v, 12);
    });
  }

  for (const s of [
    '',
    ' ',
    'abc',
    '1,2,3',
    '2,510^-4',
    '1.2.3',
    '12a',
    'e5',
    '--3',
    '1,5.000,2',
    '2,5e',
    'NaN',
    'Infinity',
  ]) {
    it(`rejects "${s}"`, () => expect(parseNumberIT(s)).toBeNull());
  }
});

describe('formatNumber / texNumber', () => {
  it('formats Italian style with 3 significant digits', () => {
    expect(formatNumber(62.5)).toBe('62,5');
    expect(formatNumber(0.25)).toBe('0,250');
    expect(formatNumber(2940)).toBe('2940');
    expect(formatNumber(2.5e-4)).toBe('2,50·10⁻⁴');
    expect(formatNumber(1.2345e6)).toBe('1,23·10⁶');
    expect(formatNumber(9.996)).toBe('10,0');
    expect(formatNumber(99996)).toBe('1,00·10⁵');
    expect(formatNumber(-0.0125)).toBe('-0,0125');
    expect(formatNumber(0)).toBe('0');
  });

  it('trims trailing zeros for prompt values', () => {
    expect(formatNumber(0.5, 4, true)).toBe('0,5');
    expect(formatNumber(0.05, 4, true)).toBe('0,05');
    expect(formatNumber(5e-3, 4, true)).toBe('5·10⁻³');
    expect(formatNumber(5e-4, 4, true)).toBe('5·10⁻⁴');
    expect(formatNumber(20, 4, true)).toBe('20');
  });

  it('formatted numbers parse back to the same value (round trip)', () => {
    for (const x of [62.5, 0.0123, 2.5e-4, 1.5e7, 3.14159, 9999, 12345, -0.75]) {
      expect(withinTolerance(parseNumberIT(formatNumber(x))!, x, 0.005)).toBe(true);
    }
  });

  it('TeX output uses {,} for the decimal comma and \\cdot 10^{n}', () => {
    expect(texNumber(62.5)).toBe('62{,}5');
    expect(texNumber(2.5e-4)).toBe('2{,}50\\cdot 10^{-4}');
  });
});

describe('withinTolerance', () => {
  it('uses a relative tolerance', () => {
    expect(withinTolerance(101, 100, 0.02)).toBe(true);
    expect(withinTolerance(102, 100, 0.02)).toBe(true);
    expect(withinTolerance(103, 100, 0.02)).toBe(false);
    expect(withinTolerance(-100, 100, 0.02)).toBe(false);
    expect(withinTolerance(0.001, 0, 0.02)).toBe(true);
    expect(withinTolerance(NaN, 1, 0.02)).toBe(false);
  });
});
