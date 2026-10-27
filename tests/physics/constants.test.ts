import { describe, expect, it } from 'vitest';
import { MU_0, MU_0_SI2019, degToRad, kmhToMs, msToKmh, radToDeg } from '../../src/physics';

describe('constants and conversions', () => {
  it('μ₀ = 4π·10⁻⁷ H/m, within 1e-9 of the 2019-SI value', () => {
    expect(MU_0).toBe(4 * Math.PI * 1e-7);
    expect(Math.abs(MU_0 - MU_0_SI2019) / MU_0_SI2019).toBeLessThan(1e-9);
  });
  it('km/h ↔ m/s', () => {
    expect(kmhToMs(36)).toBe(10);
    expect(msToKmh(10)).toBe(36);
    expect(msToKmh(kmhToMs(300))).toBeCloseTo(300, 12);
  });
  it('deg ↔ rad', () => {
    expect(degToRad(180)).toBe(Math.PI);
    expect(radToDeg(Math.PI / 2)).toBe(90);
  });
});
