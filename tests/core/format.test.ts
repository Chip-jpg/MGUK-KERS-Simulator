import { describe, expect, it } from 'vitest';
import { formatIT, NOT_A_NUMBER, UNIT_SEPARATOR } from '../../src/core/format';

const NBSP = ' ';

describe('formatIT', () => {
  it('uses the Italian decimal comma', () => {
    expect(formatIT(62.5, 1)).toBe('62,5');
    expect(formatIT(3.14159, 3)).toBe('3,142');
  });

  it('defaults to 2 fraction digits', () => {
    expect(formatIT(1.5)).toBe('1,50');
  });

  it('uses "." as thousands separator for large numbers', () => {
    expect(formatIT(12345.6, 1)).toBe('12.345,6');
    expect(formatIT(2_470_000, 0)).toBe('2.470.000');
  });

  it('appends the unit after a non-breaking space', () => {
    expect(UNIT_SEPARATOR).toBe(NBSP);
    expect(formatIT(62.5, 1, 'mA')).toBe(`62,5${NBSP}mA`);
    expect(formatIT(0.5, 2, 'T')).toBe(`0,50${NBSP}T`);
  });

  it('formats negatives and never shows a negative zero', () => {
    expect(formatIT(-3.14159, 2)).toBe('-3,14');
    expect(formatIT(-0.001, 2)).toBe('0,00');
    expect(formatIT(-0, 0)).toBe('0');
  });

  it('handles non-finite values', () => {
    expect(formatIT(Number.NaN)).toBe(NOT_A_NUMBER);
    expect(formatIT(Number.POSITIVE_INFINITY, 2, 'V')).toBe(`${NOT_A_NUMBER}${NBSP}V`);
  });

  it('clamps invalid digit counts', () => {
    expect(formatIT(1.26, -1)).toBe('1');
    expect(formatIT(1.26, Number.NaN)).toBe('1,26');
    expect(formatIT(1.25, 1.4)).toBe('1,3');
  });
});
