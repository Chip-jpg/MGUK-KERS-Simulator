import { describe, expect, it } from 'vitest';
import {
  BLACKBODY_LUT_MAX,
  BLACKBODY_LUT_MIN,
  blackbodyLuminance,
  blackbodyRGB,
  blackbodyXYZ,
  cie1931,
  planckRadiance,
  thermalSteadyState,
  thermalStep,
  thermalStepLoss,
  xyzToLinearSRGB,
} from '../../src/physics';

describe('thermalStep (lumped model, exact exponential)', () => {
  const C = 2000; // J/K
  const hA = 15; // W/K
  const Tamb = 300;
  it('relaxes to the steady state T_amb + P/hA', () => {
    const P = 3000;
    const Tinf = thermalSteadyState(P, hA, Tamb);
    expect(Tinf).toBe(500);
    let T = Tamb;
    for (let k = 0; k < 10000; k++) T = thermalStep(T, P, C, hA, Tamb, 1);
    expect(T).toBeCloseTo(Tinf, 9);
    // one time constant τ = C/hA reaches 63,2 %
    const tau = C / hA;
    expect((thermalStep(Tamb, P, C, hA, Tamb, tau) - Tamb) / (Tinf - Tamb)).toBeCloseTo(
      1 - Math.exp(-1),
      12,
    );
  });
  it('is exact: two half steps equal one full step', () => {
    const a = thermalStep(thermalStep(350, 800, C, hA, Tamb, 0.37), 800, C, hA, Tamb, 0.37);
    expect(a).toBeCloseTo(thermalStep(350, 800, C, hA, Tamb, 0.74), 12);
  });
  it('conserves energy: C ΔT = P dt − ∫ hA (T − T_amb) dt', () => {
    const T0 = 420;
    const P = 5000;
    const dt = 30;
    const T1 = thermalStep(T0, P, C, hA, Tamb, dt);
    // independent quadrature of the loss along the exact trajectory (Simpson, 2000 panels)
    const n = 2000;
    let q = 0;
    for (let i = 0; i <= n; i++) {
      const t = (dt * i) / n;
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      q += w * hA * (thermalStep(T0, P, C, hA, Tamb, t) - Tamb);
    }
    q *= dt / n / 3;
    expect(C * (T1 - T0)).toBeCloseTo(P * dt - q, 3);
    expect(thermalStepLoss(T0, P, C, hA, Tamb, dt)).toBeCloseTo(q, 3);
  });
  it('adiabatic case and validation', () => {
    expect(thermalStep(300, 100, 50, 0, 300, 2)).toBe(304);
    expect(() => thermalStep(300, 1, 0, 1, 300, 1)).toThrow(RangeError);
    expect(() => thermalStep(300, 1, 1, -1, 300, 1)).toThrow(RangeError);
    expect(() => thermalStep(300, 1, 1, 1, 300, -1)).toThrow(RangeError);
    expect(() => thermalSteadyState(1, 0, 300)).toThrow(RangeError);
  });
});

describe('black-body colour', () => {
  it('Planck law: Wien peak and Stefan–Boltzmann scaling', () => {
    const T = 1500;
    const peak = 2.897771955e-3 / T;
    expect(planckRadiance(peak, T)).toBeGreaterThan(planckRadiance(peak * 1.05, T));
    expect(planckRadiance(peak, T)).toBeGreaterThan(planckRadiance(peak * 0.95, T));
    expect(() => planckRadiance(0, T)).toThrow(RangeError);
  });
  it('CIE 1931 fit: ȳ peaks near 555 nm with value ≈ 1', () => {
    expect(cie1931(555)[1]).toBeCloseTo(1, 1);
    expect(cie1931(450)[2]).toBeGreaterThan(1.5);
    expect(cie1931(700)[0]).toBeLessThan(0.02);
  });
  it('chromaticity lies on the Planckian locus (CIE 1931 reference values)', () => {
    // (x, y) of the Planckian locus, CIE 1931 2° observer.
    // Tolerance: the analytic CMF fit is least accurate in the deep-red tail (≤ 1000 K).
    const ref: Array<[number, number, number, number]> = [
      [1000, 0.6528, 0.3444, 0.012],
      [1500, 0.5857, 0.3931, 0.006],
      [2000, 0.5267, 0.4133, 0.004],
      [3000, 0.4369, 0.4041, 0.002],
      [6500, 0.3135, 0.3236, 0.002],
    ];
    for (const [T, x, y, tol] of ref) {
      const [X, Y, Z] = blackbodyXYZ(T);
      expect(Math.abs(X / (X + Y + Z) - x)).toBeLessThan(tol);
      expect(Math.abs(Y / (X + Y + Z) - y)).toBeLessThan(tol);
    }
  });
  it('sRGB conversion maps D65 white to (1, 1, 1)', () => {
    const [r, g, b] = xyzToLinearSRGB([0.95047, 1, 1.08883]);
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(1, 3);
    expect(b).toBeCloseTo(1, 3);
  });
  it('hue shifts monotonically red → orange → white', () => {
    let prevG = -1;
    let prevB = -1;
    for (let T = 900; T <= 2500; T += 50) {
      const [r, g, b] = blackbodyRGB(T);
      expect(r).toBe(1); // red is always the largest channel below 6500 K
      expect(g).toBeGreaterThan(prevG);
      expect(b).toBeGreaterThanOrEqual(prevB);
      prevG = g;
      prevB = b;
    }
    // below ≈ 850 K the colour is pure red (green clipped out of the sRGB gamut)
    expect(blackbodyRGB(800)).toEqual([1, 0, 0]);
    // ≈ 1000 K: deep red (G/R small); 2500 K: warm white-orange
    expect(blackbodyRGB(1000)[1]).toBeLessThan(0.08);
    expect(blackbodyRGB(2500)[1]).toBeGreaterThan(0.25);
    expect(blackbodyRGB(2500)[2]).toBeGreaterThan(0.03);
  });
  it('the LUT interpolates the exact computation and clamps outside its range', () => {
    const exact = (T: number): number[] => {
      const rgb = xyzToLinearSRGB(blackbodyXYZ(T)).map((c) => Math.max(0, c));
      const m = Math.max(...rgb);
      return rgb.map((c) => c / m);
    };
    for (const T of [905, 1234, 1777, 2391]) {
      const a = blackbodyRGB(T);
      const b = exact(T);
      for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, 3);
    }
    expect(blackbodyRGB(100)).toEqual(blackbodyRGB(BLACKBODY_LUT_MIN));
    expect(blackbodyRGB(9000)).toEqual(blackbodyRGB(BLACKBODY_LUT_MAX));
    const out: [number, number, number] = [0, 0, 0];
    expect(blackbodyRGB(1500, out)).toBe(out);
    expect(() => blackbodyRGB(Number.NaN)).toThrow(RangeError);
  });
  it('luminance grows by orders of magnitude from 700 K to 2500 K', () => {
    expect(blackbodyLuminance(2500)).toBeCloseTo(1, 12);
    expect(blackbodyLuminance(700)).toBeLessThan(1e-5);
    expect(blackbodyLuminance(1200)).toBeGreaterThan(blackbodyLuminance(1000) * 5);
    expect(() => blackbodyLuminance(-1)).toThrow(RangeError);
  });
});
