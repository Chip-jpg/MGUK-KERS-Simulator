import { describe, expect, it } from 'vitest';
import {
  emfFaraday,
  fluxUniform,
  inducedCurrent,
  kersBrakingEvent,
  kineticEnergyDelta,
  kmhToMs,
  lineLoss,
  rlCurrent,
  rlTimeConstant,
  rotatingLoop,
  transformerCurrent,
  transformerSecondary,
} from '../../src/physics';

/** The numeric sanity targets of §4.2 (hard acceptance tests). */
describe('§4.2 numeric sanity targets', () => {
  it('slide 10 worked example: I = 62.5 mA (±0.1 mA)', () => {
    const S = 5.0e-2; // m²
    const dt = 0.46; // s
    const R = 4e-3; // Ω
    const dPhi = fluxUniform(3.5e-3, S, 0) - fluxUniform(1.2e-3, S, 0); // 1.15e-4 Wb
    expect(dPhi).toBeCloseTo(1.15e-4, 15);
    const emf = emfFaraday(dPhi, dt); // −2.5e-4 V
    expect(emf).toBeCloseTo(-2.5e-4, 15);
    const I = inducedCurrent(emf, R);
    // Exact arithmetic gives |I| = 0.0625 A: no rounding needed (see PHYSICS.md §5).
    expect(Math.abs(I) * 1e3).toBeCloseTo(62.5, 9);
    expect(Math.abs(Math.abs(I) - 0.0625)).toBeLessThan(1e-4);
    expect(I).toBeLessThan(0); // Lenz: opposes the increase of flux
  });

  it('m = 800 kg, 300 → 100 km/h ⇒ ΔE_k ≈ 2.47 MJ', () => {
    const dEk = kineticEnergyDelta(800, kmhToMs(300), kmhToMs(100));
    expect(dEk).toBeCloseTo(2_469_135.8, 0); // = 400·(83.3̅² − 27.7̅²) J
    expect(dEk / 1e6).toBeCloseTo(2.47, 2);
    const ev = kersBrakingEvent({
      m: 800,
      v1: kmhToMs(300),
      v2: kmhToMs(100),
      Pmax: 120e3,
      eta: 0.9,
      tBrake: 2.5,
    });
    expect(ev.dEk).toBe(dEk);
    expect(ev.recovered + ev.dissipated).toBeCloseTo(ev.dEk, 6);
  });

  it('10× transmission voltage ⇒ line loss ÷ 100 at equal P and R', () => {
    const low = lineLoss(1e6, 20e3, 5);
    const high = lineLoss(1e6, 200e3, 5);
    expect(low.loss / high.loss).toBeCloseTo(100, 10);
    expect(low.fraction / high.fraction).toBeCloseTo(100, 10);
    expect(low.I / high.I).toBeCloseTo(10, 12);
  });

  it('ideal transformer conserves V₁I₁ = V₂I₂', () => {
    const V1 = 230;
    const I1 = 4;
    for (const [N1, N2] of [
      [100, 1000],
      [1000, 50],
      [7, 13],
    ] as const) {
      const V2 = transformerSecondary(V1, N1, N2);
      const I2 = transformerCurrent(I1, N1, N2);
      expect(V2 * I2).toBeCloseTo(V1 * I1, 9);
    }
  });

  it('rlCurrent(t = τ) = 0.632 · I₀ (±1e-3)', () => {
    const E = 12;
    const R = 6;
    const L = 0.3;
    const I0 = E / R;
    const tau = rlTimeConstant(R, L);
    expect(tau).toBeCloseTo(0.05, 15);
    const ratio = rlCurrent(E, R, L, tau) / I0;
    expect(Math.abs(ratio - 0.632)).toBeLessThan(1e-3);
    expect(ratio).toBeCloseTo(1 - Math.exp(-1), 12);
  });

  it('rotatingLoop peak emf = N · B · S · ω', () => {
    const B = 0.8;
    const S = 0.02;
    const N = 50;
    const omega = 2 * Math.PI * 50;
    const peak = N * B * S * omega;
    const { V0 } = rotatingLoop(B, S, N, omega, 0);
    expect(V0).toBeCloseTo(peak, 10);
    // emf reaches V0 a quarter period after maximum flux.
    const atQuarter = rotatingLoop(B, S, N, omega, Math.PI / 2 / omega);
    expect(atQuarter.emf).toBeCloseTo(peak, 9);
    expect(atQuarter.phi).toBeCloseTo(0, 12);
  });
});
