import { describe, expect, it } from 'vitest';
import { formatIT } from '../../../src/core/format';
import { PHYSICS_DT } from '../../../src/physics';
import { chooseScale, toDegrees360 } from '../../../src/sims/faraday/format';
import {
  defaultParams,
  FaradaySim,
  params,
  X_MAX,
  X_MIN,
  type FaradayParams,
} from '../../../src/sims/faraday/model';
import { formulaItems, panelScales } from '../../../src/sims/faraday/panel';
import { mulberry32, uniform } from '../../physics/prng';

/** Run the sim for `seconds` of simulated time in fixed steps. */
function run(sim: FaradaySim, seconds: number): void {
  const n = Math.ceil(seconds / sim.dt);
  for (let k = 0; k < n; k++) sim.step();
}

function randomParams(rnd: () => number): FaradayParams {
  const snap = (v: number, step: number, min: number): number =>
    Number((min + Math.round((v - min) / step) * step).toFixed(6));
  return {
    ...defaultParams(),
    B: snap(uniform(rnd, params.B.min, params.B.max), params.B.step, params.B.min),
    S: snap(uniform(rnd, params.S.min, params.S.max), params.S.step, params.S.min),
    N: snap(uniform(rnd, params.N.min, params.N.max), params.N.step, params.N.min),
    omega: snap(
      uniform(rnd, params.omega.min, params.omega.max),
      params.omega.step,
      params.omega.min,
    ),
  };
}

describe('faraday params schema', () => {
  it('has {min,max,step,default,unit,labelIT} with default inside range', () => {
    for (const spec of Object.values(params)) {
      expect(spec.min).toBeLessThan(spec.max);
      expect(spec.step).toBeGreaterThan(0);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.unit).not.toBe('');
      expect(spec.labelIT).not.toBe('');
    }
    expect(params.B).toMatchObject({ min: 0.01, max: 1.5, unit: 'T' });
    expect(params.S).toMatchObject({ min: 0.001, max: 0.1, unit: 'm²' });
    expect(params.N).toMatchObject({ min: 1, max: 500 });
    expect(params.omega).toMatchObject({ min: 0.5, max: 100, unit: 'rad/s' });
  });
});

describe('rotating loop', () => {
  it('starts at α = 0 with maximum flux B·S and zero emf; α = ωt at constant ω', () => {
    const p = defaultParams();
    const sim = new FaradaySim(p);
    let r = sim.readout();
    expect(r.phi).toBeCloseTo(p.B * p.S, 12);
    expect(r.emf).toBe(0);
    run(sim, 0.5);
    r = sim.readout();
    expect(r.t).toBeCloseTo(120 * PHYSICS_DT, 12);
    expect(r.alpha).toBeCloseTo((p.omega * r.t) % (2 * Math.PI), 10);
    expect(r.phi).toBeCloseTo(p.B * p.S * Math.cos(p.omega * r.t), 12);
    expect(r.emf).toBeCloseTo(p.N * p.B * p.S * p.omega * Math.sin(p.omega * r.t), 10);
    expect(r.f).toBeCloseTo(p.omega / (2 * Math.PI), 12);
  });

  it('is deterministic (same steps ⇒ same state)', () => {
    const a = new FaradaySim();
    const b = new FaradaySim();
    run(a, 1.234);
    run(b, 1.234);
    expect(a.readout()).toEqual(b.readout());
  });

  it('emf is maximal where flux is zero and zero where flux is maximal', () => {
    const p = { ...defaultParams(), omega: 2 };
    const sim = new FaradaySim(p);
    let best = { emf: 0, phi: 1 };
    for (let k = 0; k < 2000; k++) {
      sim.step();
      const r = sim.readout();
      if (Math.abs(r.emf) > Math.abs(best.emf)) best = { emf: r.emf, phi: r.phi };
    }
    expect(Math.abs(best.phi)).toBeLessThan(0.01 * p.B * p.S);
  });

  it('keeps α continuous when ω changes and restarts the peak measurement', () => {
    const sim = new FaradaySim();
    run(sim, 2);
    const before = sim.readout().alpha;
    expect(sim.peakEmf()).not.toBeNull();
    sim.setParams({ omega: 40 });
    expect(sim.readout().alpha).toBeCloseTo(before, 12);
    expect(sim.peakEmf()).toBeNull();
    sim.step();
    expect(sim.readout().alpha).toBeCloseTo(before + 40 * PHYSICS_DT, 10);
  });

  it('GATE: measured peak emf equals N·B·S·ω within 0,5 % for 5 seeded random parameter sets', () => {
    const rnd = mulberry32(20261027);
    for (let k = 0; k < 5; k++) {
      const p = randomParams(rnd);
      const sim = new FaradaySim(p);
      expect(sim.peakEmf()).toBeNull(); // no full period yet
      const T = (2 * Math.PI) / p.omega;
      run(sim, 1.5 * T + 0.37);
      const peak = sim.peakEmf();
      const expected = p.N * p.B * p.S * p.omega; // independent of the model
      expect(peak, JSON.stringify(p)).not.toBeNull();
      expect(Math.abs((peak as number) - expected) / expected, JSON.stringify(p)).toBeLessThan(
        0.005,
      );
      // The displayed strings (same scale/digits as the UI) agree too.
      const s = panelScales('rotating', p).emf;
      const shown = (v: number): number =>
        Number(
          formatIT(v * s.scale, s.digits)
            .replace(/\./g, '')
            .replace(',', '.'),
        );
      expect(Math.abs(shown(peak as number) - shown(expected))).toBeLessThanOrEqual(
        Math.max(10 ** -s.digits, 0.005 * shown(expected)) + 1e-12,
      );
    }
  });

  it('documents why zero-crossing samples are needed: dt-only sampling error ≈ (ω·dt)²/8', () => {
    const p = { ...defaultParams(), omega: 100 };
    const sim = new FaradaySim(p);
    run(sim, 1);
    const V0 = p.N * p.B * p.S * p.omega;
    const dtOnly = sim.peakEmfStepSamplesOnly() as number;
    const bound = (p.omega * PHYSICS_DT) ** 2 / 8;
    expect(1 - dtOnly / V0).toBeLessThanOrEqual(bound + 1e-12);
    expect(Math.abs((sim.peakEmf() as number) / V0 - 1)).toBeLessThan(1e-9);
  });

  it('trace covers ~2 periods, is chronological and decimated', () => {
    const sim = new FaradaySim({ ...defaultParams(), omega: 1 });
    run(sim, 30);
    const tr = sim.trace(sim.plotWindow(), 400);
    expect(tr.t.length).toBeLessThanOrEqual(400);
    expect(tr.t.length).toBeGreaterThan(200);
    for (let i = 1; i < tr.t.length; i++)
      expect(tr.t[i] as number).toBeGreaterThan(tr.t[i - 1] as number);
    expect(tr.t[tr.t.length - 1]).toBeCloseTo(sim.time, 12);
    expect(sim.time - (tr.t[0] as number)).toBeLessThanOrEqual(4 * Math.PI + 1e-9);
    expect(sim.time - (tr.t[0] as number)).toBeGreaterThan(4 * Math.PI - 0.1);
  });

  it('reset returns to t = 0', () => {
    const sim = new FaradaySim();
    run(sim, 3);
    sim.reset();
    expect(sim.time).toBe(0);
    expect(sim.readout().alpha).toBe(0);
    expect(sim.trace().t).toEqual([0]);
  });
});

describe('motional emf (moto traslatorio)', () => {
  it('|emf| = B·l·v, equals −ΔΦ/Δt away from the rail ends, Φ = B·l·x', () => {
    const p = { ...defaultParams(), B: 0.8, l: 0.4, v: 2 };
    const sim = new FaradaySim(p, 'motional');
    run(sim, 0.2);
    const r = sim.readout();
    expect(r.x).toBeCloseTo(X_MIN + 2 * 0.2, 9);
    expect(r.phi).toBeCloseTo(0.8 * 0.4 * r.x, 12);
    expect(r.emfMotional).toBeCloseTo(0.8 * 0.4 * 2, 12);
    expect(Math.abs(r.emf)).toBeCloseTo(0.64, 12);
    expect(r.emfFromFlux).toBeCloseTo(-0.64, 9); // flux grows ⇒ negative emf (Lenz)
    expect(r.emf).toBeCloseTo(r.emfFromFlux, 9);
  });

  it('bounces at the rail ends and reverses the emf sign; peak = B·l·v', () => {
    const p = { ...defaultParams(), B: 1, l: 0.5, v: 3 };
    const sim = new FaradaySim(p, 'motional');
    const signs = new Set<number>();
    for (let k = 0; k < 600; k++) {
      sim.step();
      const r = sim.readout();
      expect(r.x).toBeGreaterThanOrEqual(X_MIN - 1e-12);
      expect(r.x).toBeLessThanOrEqual(X_MAX + 1e-12);
      signs.add(Math.sign(r.emf));
    }
    expect(signs).toEqual(new Set([1, -1]));
    expect(sim.peakEmf()).toBeCloseTo(1.5, 12);
  });
});

describe('display helpers', () => {
  it('chooseScale picks an SI prefix with ≈ 3 significant digits', () => {
    expect(chooseScale(3.15, 'V')).toEqual({ scale: 1, unit: 'V', digits: 2 });
    expect(chooseScale(0.0123, 'V')).toEqual({ scale: 1000, unit: 'mV', digits: 1 });
    expect(chooseScale(5e-6, 'V')).toEqual({ scale: 1e6, unit: 'µV', digits: 2 });
    expect(chooseScale(7500, 'V')).toEqual({ scale: 1e-3, unit: 'kV', digits: 2 });
    expect(chooseScale(0, 'Wb').unit).toBe('Wb');
  });

  it('toDegrees360 wraps to [0, 360)', () => {
    expect(toDegrees360(0)).toBe(0);
    expect(toDegrees360(Math.PI)).toBeCloseTo(180, 12);
    expect(toDegrees360(-Math.PI / 2)).toBeCloseTo(270, 12);
    expect(toDegrees360(2 * Math.PI)).toBe(0);
  });

  it('formula items carry quantity colours and no slide refs', () => {
    const rot = formulaItems('rotating', panelScales('rotating', defaultParams()));
    expect(rot.find((i) => i.key === 'phi')).toMatchObject({ quantity: 'b' });
    expect(rot.find((i) => i.key === 'V0')).toMatchObject({ quantity: 'emf', unit: 'V' });
    expect(rot.map((i) => i.key)).toContain('peak');
    const mot = formulaItems('motional', panelScales('motional', defaultParams()));
    expect(mot.find((i) => i.key === 'emfMot')).toBeDefined();
    for (const i of [...rot, ...mot]) expect(i).not.toHaveProperty('slide');
  });
});
