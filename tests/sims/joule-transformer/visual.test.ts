import { describe, expect, it } from 'vitest';
import { catenarySag, coreFluxPeak, thermalSteadyState } from '../../../src/physics';
import {
  FLUX_REF_WB,
  LINE,
  LINE_A0,
  LINE_C,
  LINE_HA,
  TOTAL_WINDOWS,
  WINDOW_W,
  fluxFraction,
  heatPerMetre,
  litWindows,
  resistancePerMetre,
  sagAt,
  wireRadius,
} from '../../../src/sims/joule-transformer/visual';

describe('joule-transformer visual scales', () => {
  it('line: R′ = R/(2ℓ), q′ = R′·I² (∝ I², so ÷100 at 10× voltage)', () => {
    expect(resistancePerMetre(5)).toBeCloseTo(5e-5, 15);
    expect(heatPerMetre(5, 50)).toBeCloseTo(0.125, 12);
    expect(heatPerMetre(5, 500) / heatPerMetre(5, 50)).toBeCloseTo(100, 9);
  });

  it('thermal data: C′ = 1350 J/(m·K), τ ≈ 21 min, steady rise q′/hA′', () => {
    expect(LINE_C).toBeCloseTo(1350, 9);
    expect(LINE_C / LINE_HA / 60).toBeGreaterThan(20);
    expect(LINE_C / LINE_HA / 60).toBeLessThan(23);
    // 10 kV line at 10 MW, 5 Ω: I = 1000 A ⇒ 50 W/m ⇒ ≈ +47 K
    const T = thermalSteadyState(heatPerMetre(5, 1000), LINE_HA, LINE.Tamb);
    expect(T - LINE.Tamb).toBeGreaterThan(45);
    expect(T - LINE.Tamb).toBeLessThan(50);
  });

  it('sag: catenary at 20 °C (≈ 8,3 m on 300 m) and more sag when hot', () => {
    expect(sagAt(LINE.Tamb)).toBeCloseTo(catenarySag(LINE.span, LINE_A0), 12);
    expect(sagAt(LINE.Tamb)).toBeGreaterThan(8.2);
    expect(sagAt(LINE.Tamb)).toBeLessThan(8.4);
    expect(sagAt(LINE.Tamb + 50)).toBeGreaterThan(sagAt(LINE.Tamb + 10));
    expect(sagAt(LINE.Tamb + 10)).toBeGreaterThan(sagAt(LINE.Tamb));
  });

  it('windows ∝ delivered power, capped; flux fraction ∝ Φ̂', () => {
    expect(litWindows(0)).toBe(0);
    expect(litWindows(-5)).toBe(0);
    expect(litWindows(10e6)).toBe(20);
    expect(litWindows(9.99e6)).toBe(20);
    expect(litWindows(1e9)).toBe(TOTAL_WINDOWS);
    expect(TOTAL_WINDOWS * WINDOW_W).toBe(100e6); // the slider maximum lights the whole town
    expect(fluxFraction(0)).toBe(0);
    expect(fluxFraction(FLUX_REF_WB)).toBe(1);
    expect(fluxFraction(coreFluxPeak(20_000, 50, 100))).toBeCloseTo(0.4, 9);
    expect(fluxFraction(1e9)).toBe(1);
  });

  it('wire radius ∝ √I (equal current density), clamped', () => {
    expect(wireRadius(500, 500, 0.05, 0.01, 0.06)).toBeCloseTo(0.05, 12);
    expect(wireRadius(50, 500, 0.05, 0.01, 0.06)).toBeCloseTo(0.05 / Math.sqrt(10), 12);
    expect(wireRadius(0.1, 500, 0.05, 0.01, 0.06)).toBe(0.01);
    expect(wireRadius(5000, 500, 0.05, 0.01, 0.06)).toBe(0.06);
    expect(wireRadius(0, 500, 0.05, 0.01, 0.06)).toBe(0.01);
  });
});
