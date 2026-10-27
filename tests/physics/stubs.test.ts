import { describe, expect, expectTypeOf, it } from 'vitest';
import * as physics from '../../src/physics';

/**
 * Contract guard for §4.2. Runtime part: every export exists and is a function.
 * Type part: `expectTypeOf` assertions fail `npm run typecheck` if a signature
 * (parameter types, optional parameters, return shape) drifts from the contract.
 * Since A1 every function is implemented; this file also checks that no stub is
 * left behind.
 */
const API = [
  'fluxUniform',
  'emfFaraday',
  'emfMotional',
  'rotatingLoop',
  'inducedCurrent',
  'lenzSign',
  'solenoidInductance',
  'emfSelf',
  'rlCurrent',
  'magneticEnergy',
  'transformerSecondary',
  'transformerCurrent',
  'jouleLoss',
  'lineLoss',
  'lorentzForce',
  'kineticEnergyDelta',
  'kersBrakingEvent',
  'rk4Step',
] as const;

describe('physics API contract (§4.2)', () => {
  it.each(API)('%s is an exported function', (name) => {
    expect(typeof physics[name]).toBe('function');
  });

  it('exports the fixed physics step dt = 1/240 s', () => {
    expect(physics.PHYSICS_DT).toBe(1 / 240);
  });

  it('no §4.2 function is still a NotImplemented stub', () => {
    const p = physics;
    const calls: Array<() => unknown> = [
      () => p.fluxUniform(1, 1, 0),
      () => p.emfFaraday(1, 1),
      () => p.emfMotional(1, 1, 1),
      () => p.rotatingLoop(1, 1, 1, 1, 0),
      () => p.inducedCurrent(1, 1),
      () => p.lenzSign(1),
      () => p.solenoidInductance(1, 1, 1),
      () => p.emfSelf(1, 1),
      () => p.rlCurrent(1, 1, 1, 1),
      () => p.magneticEnergy(1, 1),
      () => p.transformerSecondary(1, 1, 1),
      () => p.transformerCurrent(1, 1, 1),
      () => p.jouleLoss(1, 1),
      () => p.lineLoss(1, 1, 1),
      () => p.lorentzForce(1, 1, 1),
      () => p.kineticEnergyDelta(1, 2, 1),
      () => p.kersBrakingEvent({ m: 1, v1: 2, v2: 1, Pmax: 1, eta: 1, tBrake: 1 }),
      () => p.rk4Step(() => [0], 0, [1], 0.1),
    ];
    expect(calls).toHaveLength(API.length);
    for (const call of calls) expect(call).not.toThrow();
  });

  it('exports NotImplementedError', () => {
    const err = new physics.NotImplementedError('x');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotImplementedError');
    expect(err.message).toContain('x');
  });

  it('has the exact §4.2 signatures (checked by tsc)', () => {
    type N = number;
    expectTypeOf(physics.fluxUniform).toEqualTypeOf<(B: N, S: N, alphaRad: N) => N>();
    expectTypeOf(physics.emfFaraday).toEqualTypeOf<(dPhi: N, dt: N, N?: N) => N>();
    expectTypeOf(physics.emfMotional).toEqualTypeOf<(B: N, l: N, v: N) => N>();
    expectTypeOf(physics.rotatingLoop).toEqualTypeOf<
      (B: N, S: N, N: N, omega: N, t: N) => { phi: N; emf: N; V0: N }
    >();
    expectTypeOf(physics.inducedCurrent).toEqualTypeOf<(emf: N, R: N) => N>();
    expectTypeOf(physics.lenzSign).toEqualTypeOf<(dPhiDt: N) => -1 | 0 | 1>();
    expectTypeOf(physics.solenoidInductance).toEqualTypeOf<(N: N, S: N, l: N, mu?: N) => N>();
    expectTypeOf(physics.emfSelf).toEqualTypeOf<(L: N, dIdt: N) => N>();
    expectTypeOf(physics.rlCurrent).toEqualTypeOf<(emfDC: N, R: N, L: N, t: N) => N>();
    expectTypeOf(physics.magneticEnergy).toEqualTypeOf<(L: N, I: N) => N>();
    expectTypeOf(physics.transformerSecondary).toEqualTypeOf<(V1: N, N1: N, N2: N) => N>();
    expectTypeOf(physics.transformerCurrent).toEqualTypeOf<(I1: N, N1: N, N2: N) => N>();
    expectTypeOf(physics.jouleLoss).toEqualTypeOf<(R: N, I: N) => N>();
    expectTypeOf(physics.lineLoss).toEqualTypeOf<
      (P: N, V: N, Rline: N) => { I: N; loss: N; fraction: N }
    >();
    expectTypeOf(physics.lorentzForce).toEqualTypeOf<(B: N, I: N, L: N, theta?: N) => N>();
    expectTypeOf(physics.kineticEnergyDelta).toEqualTypeOf<(m: N, v1: N, v2: N) => N>();
    expectTypeOf(physics.kersBrakingEvent).toEqualTypeOf<
      (p: { m: N; v1: N; v2: N; Pmax: N; eta: N; tBrake: N }) => {
        dEk: N;
        recoverable: N;
        recovered: N;
        dissipated: N;
        timeToRecoverAtPmax: N;
        powerTrace: Array<{ t: N; pKers: N; pBrakes: N }>;
      }
    >();
    expectTypeOf(physics.rk4Step).toEqualTypeOf<
      (f: (t: N, y: readonly N[]) => N[], t: N, y: readonly N[], dt: N) => N[]
    >();
  });
});
