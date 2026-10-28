import { describe, expect, it, vi } from 'vitest';
import { formatIT } from '../../src/core/format';
import { tickDigits } from '../../src/ui/plot';

// uPlot touches window/matchMedia at import time; tickDigits does not need it.
vi.mock('uplot', () => ({ default: class {} }));

describe('tickDigits (QA-003)', () => {
  it('uses the decimals the step itself needs', () => {
    expect(tickDigits([0, 0.25])).toBe(2);
    expect(tickDigits([0, 2.5])).toBe(1);
    expect(tickDigits([0, 0.1])).toBe(1);
    expect(tickDigits([0, 5])).toBe(0);
    expect(tickDigits([0, 1000])).toBe(0);
    expect(tickDigits([0, 0.002])).toBe(3);
    expect(tickDigits([0, 0.0025])).toBe(4);
  });

  it('tolerates float noise from split arithmetic', () => {
    expect(tickDigits([0.1, 0.1 + 0.2])).toBe(1);
    expect(tickDigits([0.75, 1])).toBe(2);
    expect(tickDigits([12.5, 15.000000000000002])).toBe(1);
  });

  it('caps at 6 decimals and falls back for degenerate splits', () => {
    expect(tickDigits([0, 1 / 3])).toBe(6);
    expect(tickDigits([0])).toBe(2);
    expect(tickDigits([1, 1])).toBe(2);
  });

  it('labels 0,25-step ticks distinctly', () => {
    const splits = [0, 0.25, 0.5, 0.75];
    const d = tickDigits(splits);
    expect(splits.map((v) => formatIT(v, d))).toEqual(['0,00', '0,25', '0,50', '0,75']);
  });
});
