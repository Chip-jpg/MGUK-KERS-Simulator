import { describe, expect, it } from 'vitest';
import {
  computeTransmission,
  lossCurve,
  lossReductionFactor,
  siPrefix,
  visualTurns,
} from '../../../src/sims/joule-transformer/model';
import { defaultInputs, params } from '../../../src/sims/joule-transformer/params';

describe('joule-transformer model', () => {
  it('GATE: 10× voltage ⇒ loss ÷100 (computed factor = 100 within 1e-9)', () => {
    expect(Math.abs(lossReductionFactor(10e6, 20e3, 5) - 100)).toBeLessThan(1e-9);
    // Holds for any P, V, R (pseudo-random sweep over the slider ranges).
    let seed = 7;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 200; k++) {
      const P = params.P.min + rnd() * (params.P.max - params.P.min);
      const V = params.V1.min + rnd() * (params.V1.max - params.V1.min);
      const R = params.Rline.min + rnd() * (params.Rline.max - params.Rline.min);
      expect(Math.abs(lossReductionFactor(P, V, R) - 100)).toBeLessThan(1e-9);
    }
    expect(lossReductionFactor(1e6, 1e4, 1, 3)).toBeCloseTo(9, 12);
  });

  it('reproduces the theory-section-08 example with the default parameters', () => {
    const r = computeTransmission(defaultInputs());
    expect(r.V2).toBeCloseTo(200e3, 6);
    expect(r.I1).toBeCloseTo(500, 9);
    expect(r.I2).toBeCloseTo(50, 9);
    expect(r.line.I).toBeCloseTo(50, 9);
    expect(r.line.loss).toBeCloseTo(12.5e3, 6);
    expect(r.line.fraction).toBeCloseTo(0.00125, 12);
    expect(r.direct.loss).toBeCloseTo(1.25e6, 3);
    expect(r.direct.fraction).toBeCloseTo(0.125, 12);
    expect(r.savingFactor).toBeCloseTo(100, 9);
    expect(r.valid).toBe(true);
    expect(r.delivered).toBeCloseTo(10e6 - 12.5e3, 3);
    expect(r.Vreceived).toBeCloseTo(200e3 - 250, 6);
    expect(r.Vout).toBeCloseTo((200e3 - 250) / 10, 6);
    expect(r.Iout).toBeCloseTo(500, 9);
  });

  it('ideal transformer conserves power V₁I₁ = V₂I₂ and R·I² matches lineLoss', () => {
    for (const [N1, N2] of [
      [100, 1000],
      [2000, 50],
      [370, 370],
      [50, 4000],
    ] as const) {
      const r = computeTransmission({ V1: 15e3, N1, N2, P: 42e6, Rline: 7.5 });
      expect(r.powerMismatch).toBeLessThan(1e-12);
      expect(r.P1).toBeCloseTo(42e6, 3);
      expect(r.V2 / r.V1).toBeCloseTo(N2 / N1, 12);
      expect(r.jouleCheck / r.line.loss).toBeCloseTo(1, 12);
    }
  });

  it('flags the model as invalid when the line would dissipate ≥ P', () => {
    const r = computeTransmission({ V1: 10e3, N1: 2000, N2: 50, P: 100e6, Rline: 50 });
    expect(r.line.fraction).toBeGreaterThan(1);
    expect(r.valid).toBe(false);
    expect(r.delivered).toBe(0);
    expect(r.Vreceived).toBe(0);
  });

  it('loss curve is log-spaced and falls as 1/V²', () => {
    const c = lossCurve(10e6, 5, 1e3, 1e6, 4);
    expect(c.V.map((v) => Math.round(Math.log10(v)))).toEqual([3, 4, 5, 6]);
    expect((c.loss[1] ?? 0) / (c.loss[2] ?? 1)).toBeCloseTo(100, 9);
  });

  it('display helpers', () => {
    expect(siPrefix(12_500, 'W')).toEqual({ scale: 1e-3, unit: 'kW' });
    expect(siPrefix(2e6, 'W').unit).toBe('MW');
    expect(siPrefix(0.5, 'A').unit).toBe('mA');
    const vt = visualTurns(100, 1000);
    expect(vt).toEqual({ n1: 2, n2: 24 });
    expect(visualTurns(500, 500)).toEqual({ n1: 24, n2: 24 });
  });

  it('params satisfy min ≤ default ≤ max and step > 0', () => {
    for (const s of Object.values(params)) {
      expect(s.min).toBeLessThanOrEqual(s.default);
      expect(s.default).toBeLessThanOrEqual(s.max);
      expect(s.step).toBeGreaterThan(0);
      expect(s.labelIT.length).toBeGreaterThan(0);
      expect(s.unit.length).toBeGreaterThan(0);
    }
  });
});
