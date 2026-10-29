import { describe, expect, it } from 'vitest';
import {
  BRAKE_DISC_ILLUSTRATIVE,
  STEFAN_BOLTZMANN,
  celsiusToKelvin,
  discAdiabaticRise,
  discConvectionCoefficient,
  discHeatCapacity,
  discLossPower,
  discThermalStep,
  kelvinToCelsius,
  type DiscThermalSpec,
} from '../../src/physics/brake-thermal';
import { PHYSICS_DT } from '../../src/physics';

const FRONT = BRAKE_DISC_ILLUSTRATIVE.front;
const REAR = BRAKE_DISC_ILLUSTRATIVE.rear;
const TAMB = BRAKE_DISC_ILLUSTRATIVE.Tamb;
const ADIABATIC: DiscThermalSpec = { ...FRONT, h0: 0, hRef: 0, emissivity: 0 };

describe('brake-disc lumped thermal model', () => {
  it('documents illustrative constants: C = m·c', () => {
    expect(discHeatCapacity(FRONT)).toBeCloseTo(1680, 9);
    expect(discHeatCapacity(REAR)).toBeCloseTo(1260, 9);
    expect(() => discHeatCapacity({ ...FRONT, mass: 0 })).toThrow(RangeError);
    expect(() => discHeatCapacity({ ...FRONT, c: -1 })).toThrow(RangeError);
  });

  it('forced convection h(v) = h0 + h_ref·(v/v_ref)^0,8', () => {
    expect(discConvectionCoefficient(FRONT, 0)).toBe(FRONT.h0);
    expect(discConvectionCoefficient(FRONT, FRONT.vRef)).toBeCloseTo(FRONT.h0 + FRONT.hRef, 12);
    expect(discConvectionCoefficient(FRONT, -FRONT.vRef)).toBeCloseTo(FRONT.h0 + FRONT.hRef, 12);
    const r = discConvectionCoefficient(FRONT, 2 * FRONT.vRef) - FRONT.h0;
    expect(r / FRONT.hRef).toBeCloseTo(2 ** 0.8, 12);
    expect(() => discConvectionCoefficient(FRONT, Number.NaN)).toThrow(RangeError);
  });

  it('loss = convection + radiation, zero at ambient, sign follows T − T_amb', () => {
    expect(discLossPower(TAMB, 50, FRONT, TAMB)).toBe(0);
    const T = 1000;
    const conv = discConvectionCoefficient(FRONT, 50) * FRONT.area * (T - TAMB);
    const rad = FRONT.emissivity * STEFAN_BOLTZMANN * FRONT.area * (T ** 4 - TAMB ** 4);
    expect(discLossPower(T, 50, FRONT, TAMB)).toBeCloseTo(conv + rad, 9);
    expect(discLossPower(280, 0, FRONT, TAMB)).toBeLessThan(0);
    expect(() => discLossPower(0, 0, FRONT, TAMB)).toThrow(RangeError);
    expect(() => discLossPower(500, 0, FRONT, 0)).toThrow(RangeError);
  });

  it('conserves energy on every step: C·ΔT + Q_loss = P·dt', () => {
    const C = discHeatCapacity(FRONT);
    let T = celsiusToKelvin(300);
    let qTot = 0;
    let eIn = 0;
    const T0 = T;
    const out = { T: 0, qLoss: 0 };
    for (let k = 0; k < 2400; k++) {
      const t = k * PHYSICS_DT;
      const P = t < 3 ? 400e3 * (1 - t / 4) : 0; // braking then cooling
      const v = Math.max(20, 83 - 20 * t);
      const r = discThermalStep(T, P, v, FRONT, TAMB, PHYSICS_DT, out);
      expect(C * (r.T - T) + r.qLoss).toBeCloseTo(P * PHYSICS_DT, 6);
      T = r.T;
      qTot += r.qLoss;
      eIn += P * PHYSICS_DT;
    }
    expect(Math.abs(C * (T - T0) + qTot - eIn) / eIn).toBeLessThan(1e-12);
    expect(qTot).toBeGreaterThan(0);
  });

  it('adiabatic stop: T rises by exactly E/C', () => {
    let T = celsiusToKelvin(300);
    const T0 = T;
    const P = 250e3;
    const n = 480; // 2 s
    for (let k = 0; k < n; k++) T = discThermalStep(T, P, 60, ADIABATIC, TAMB, PHYSICS_DT).T;
    const E = P * n * PHYSICS_DT;
    expect(T - T0).toBeCloseTo(discAdiabaticRise(E, ADIABATIC), 8);
    expect(discAdiabaticRise(E, FRONT)).toBeCloseTo(E / 1680, 12);
  });

  it('short real stop: ΔT ≈ E/C (losses < 5 % over 1 s)', () => {
    let T = celsiusToKelvin(300);
    const T0 = T;
    const P = 300e3;
    for (let k = 0; k < 240; k++) T = discThermalStep(T, P, 70, FRONT, TAMB, PHYSICS_DT).T;
    const rise = discAdiabaticRise(P * 1, FRONT);
    expect(T - T0).toBeLessThan(rise);
    expect((T - T0) / rise).toBeGreaterThan(0.95);
  });

  it('cools towards ambient with no input (monotone, never below T_amb)', () => {
    let T = 1100;
    let prev = T;
    for (let k = 0; k < 3000; k++) {
      T = discThermalStep(T, 0, 30, REAR, TAMB, 1).T;
      expect(T).toBeLessThanOrEqual(prev);
      expect(T).toBeGreaterThanOrEqual(TAMB);
      prev = T;
    }
    expect(T).toBeLessThan(TAMB + 5);
  });

  it('validates its inputs; dt = 0 is the identity', () => {
    expect(discThermalStep(500, 1000, 0, FRONT, TAMB, 0)).toEqual({ T: 500, qLoss: 0 });
    expect(() => discThermalStep(500, -1, 0, FRONT, TAMB, 0.1)).toThrow(RangeError);
    expect(() => discThermalStep(500, 1, 0, FRONT, TAMB, -0.1)).toThrow(RangeError);
    expect(() => discThermalStep(-1, 1, 0, FRONT, TAMB, 0.1)).toThrow(RangeError);
    expect(() => discAdiabaticRise(Number.POSITIVE_INFINITY, FRONT)).toThrow(RangeError);
    expect(kelvinToCelsius(celsiusToKelvin(300))).toBeCloseTo(300, 12);
  });
});
