import { describe, expect, it } from 'vitest';
import * as phys from '../../src/physics';
import { checkNumeric, formatAnswer, GENERATORS, instantiate } from '../../src/quiz/generators';
import { mulberry32 } from '../../src/quiz/prng';
import { renderTex } from '../../src/ui/math';
import { splitMath } from '../../src/quiz/richText';
import type { NumericGenerator } from '../../src/quiz/types';

type P = Record<string, number>;

/**
 * Independent recomputation of every generator's answer (SI units) with direct
 * `src/physics` calls, written separately from src/quiz/generators.ts.
 */
const RECOMPUTE: Record<string, (p: P) => number> = {
  'gen-flusso': (p) => phys.fluxUniform(p['B']!, p['S']!, phys.degToRad(p['alphaDeg']!)),
  'gen-faraday-bobina': (p) =>
    Math.abs(
      phys.emfFaraday(
        phys.fluxUniform(p['B2']!, p['S']!, 0) - phys.fluxUniform(p['B1']!, p['S']!, 0),
        p['dt']!,
        p['N']!,
      ),
    ),
  'gen-corrente-slide10': (p) =>
    Math.abs(
      phys.inducedCurrent(
        phys.emfFaraday(
          phys.fluxUniform(p['B2']!, p['S']!, 0) - phys.fluxUniform(p['B1']!, p['S']!, 0),
          p['dt']!,
          1,
        ),
        p['R']!,
      ),
    ),
  'gen-fem-movimento': (p) => phys.emfMotional(p['B']!, p['l']!, p['v']!),
  'gen-corrente-indotta': (p) =>
    phys.inducedCurrent(phys.emfMotional(p['B']!, p['l']!, p['v']!), p['R']!),
  'gen-lenz-potenza': (p) => phys.jouleLoss(p['R']!, phys.inducedCurrent(p['emf']!, p['R']!)),
  'gen-solenoide': (p) => phys.solenoidInductance(p['N']!, p['S']!, p['l']!, phys.MU_0),
  'gen-fem-autoindotta': (p) => Math.abs(phys.emfSelf(p['L']!, p['di']! / p['dt']!)),
  'gen-rl-tau': (p) => phys.rlTimeConstant(p['R']!, p['L']!),
  'gen-rl-corrente': (p) => phys.rlCurrent(p['emf']!, p['R']!, p['L']!, p['t']!),
  'gen-energia-magnetica': (p) => phys.magneticEnergy(p['L']!, p['I']!),
  'gen-alternatore-v0': (p) => phys.rotatingLoop(p['B']!, p['S']!, p['N']!, p['omega']!, 0.123).V0,
  'gen-trasformatore-v2': (p) => phys.transformerSecondary(p['V1']!, p['N1']!, p['N2']!),
  'gen-trasformatore-i2': (p) => phys.transformerCurrent(p['I1']!, p['N1']!, p['N2']!),
  'gen-perdita-linea': (p) => phys.lineLoss(p['P']!, p['V']!, p['R']!).loss,
  'gen-perdita-tensione-k': (p) =>
    phys.jouleLoss(p['R']!, phys.lineLoss(p['P']!, p['V']!, p['R']!).I) /
    phys.jouleLoss(p['R']!, phys.lineLoss(p['P']!, p['k']! * p['V']!, p['R']!).I),
  'gen-forza-lorentz': (p) =>
    phys.lorentzForce(p['B']!, p['I']!, p['L']!, phys.degToRad(p['thetaDeg']!)),
  'gen-energia-cinetica-frenata': (p) =>
    phys.kineticEnergyDelta(p['m']!, phys.kmhToMs(p['v1']!), phys.kmhToMs(p['v2']!)),
  'gen-kers-energia-recuperata': (p) =>
    phys.kersBrakingEvent({
      m: p['m']!,
      v1: phys.kmhToMs(p['v1']!),
      v2: phys.kmhToMs(p['v2']!),
      Pmax: p['PmaxKW']! * 1000,
      eta: p['eta']!,
      tBrake: p['tBrake']!,
    }).recovered,
  // D8: time = η·ΔE_k / P_max (P_max = electrical cap).
  'gen-kers-tempo-recupero': (p) =>
    (p['eta']! * phys.kineticEnergyDelta(p['m']!, phys.kmhToMs(p['v1']!), phys.kmhToMs(p['v2']!))) /
    (p['PmaxKW']! * 1000),
};

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);
const gens = GENERATORS as unknown as NumericGenerator<P>[];

describe('numeric generators', () => {
  it('have unique ids and an independent recomputation each', () => {
    const ids = gens.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(RECOMPUTE).sort()).toEqual([...ids].sort());
  });

  for (const g of gens) {
    describe(g.id, () => {
      it('solve() equals the independent src/physics recomputation for 20 seeds', () => {
        for (const seed of SEEDS) {
          const p = g.sample(mulberry32(seed));
          const expected = RECOMPUTE[g.id]!(p);
          const got = g.solve(p);
          expect(Number.isFinite(got) && got > 0, `${g.id} seed ${seed}`).toBe(true);
          expect(Math.abs(got - expected) / Math.abs(expected)).toBeLessThan(1e-9);
        }
      });

      it('the checker accepts the formatted solution and rejects far answers', () => {
        for (const seed of SEEDS) {
          const q = instantiate(g as never, seed);
          expect(q.answerText).toBe(formatAnswer(q.expected));
          expect(checkNumeric(q, q.answerText), `${g.id} ${q.answerText}`).toBe(true);
          expect(checkNumeric(q, String(q.expected))).toBe(true);
          expect(checkNumeric(q, String(q.expected * 1.1))).toBe(false);
          expect(checkNumeric(q, String(q.expected * 1000))).toBe(false);
          expect(checkNumeric(q, 'abc')).toBeNull();
        }
      });

      it('is deterministic for a seed, and the seed changes the parameters', () => {
        const a = instantiate(g as never, 42);
        const b = instantiate(g as never, 42);
        expect(a).toEqual(b);
        const prompts = new Set(SEEDS.map((s) => instantiate(g as never, s).promptIT));
        expect(prompts.size).toBeGreaterThan(1);
      });

      it('prompt and worked solution render with KaTeX without errors', () => {
        for (const seed of SEEDS.slice(0, 5)) {
          const q = instantiate(g as never, seed);
          const texts = [q.promptIT, ...q.steps.map((s) => s.textIT ?? '')];
          for (const txt of texts)
            for (const part of splitMath(txt))
              if (part.math) expect(renderTex(part.text).error, part.text).toBeUndefined();
          for (const s of q.steps)
            if (s.tex) expect(renderTex(s.tex, true).error, s.tex).toBeUndefined();
          expect(q.steps.length).toBeGreaterThanOrEqual(2);
          expect(q.tolerance).toBeGreaterThan(0);
          expect(q.tolerance).toBeLessThanOrEqual(0.05);
        }
      });
    });
  }

  it('the slide-10 example reproduces I = 62,5 mA through the same physics chain', () => {
    const g = gens.find((x) => x.id === 'gen-corrente-slide10')!;
    const I = g.solve({ S: 5e-2, B1: 1.2e-3, B2: 3.5e-3, dt: 0.46, R: 4e-3 });
    expect(I * 1000).toBeCloseTo(62.5, 1);
  });

  it('KERS example (D8): 120 kW, 3 s, η = 0,9 → 0,36 MJ in batteria; ≈ 18,5 s to absorb everything', () => {
    const rec = gens.find((x) => x.id === 'gen-kers-energia-recuperata')!;
    const p = { m: 800, v1: 300, v2: 100, tBrake: 3, PmaxKW: 120, eta: 0.9 };
    expect(rec.solve(p) / 1e6).toBeCloseTo(0.36, 6);
    const time = gens.find((x) => x.id === 'gen-kers-tempo-recupero')!;
    expect(time.solve(p)).toBeCloseTo(18.5, 1);
  });

  it('KERS recovered-energy questions always have the MGU-K saturated (E_batt = P_max·t_f)', () => {
    const rec = gens.find((x) => x.id === 'gen-kers-energia-recuperata')!;
    for (const seed of SEEDS) {
      const p = rec.sample(mulberry32(seed));
      expect(rec.solve(p)).toBeCloseTo(p['PmaxKW']! * 1000 * p['tBrake']!, 3);
    }
  });
});
