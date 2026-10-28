// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatIT } from '../../src/core/format';
import type { ParamSpec } from '../../src/core/types';
import { createSlider, parseNumberIT, snapToSpec, stepDigits } from '../../src/ui/slider';
import { params as alternatorMotor } from '../../src/sims/alternator-motor/model';
import { params as faraday } from '../../src/sims/faraday/model';
import { params as jouleTransformer } from '../../src/sims/joule-transformer/params';
import { params as kersBraking } from '../../src/sims/kers-braking/model';
import { params as lenz } from '../../src/sims/lenz/params';
import { params as rlEnergy } from '../../src/sims/rl-energy/params';

/**
 * QA-001: whatever the slider's numeric field displays must parse back to the
 * same value (pressing Enter on an unchanged field is a no-op), for every
 * parameter of every simulator.
 */
const SIMS: Record<string, Record<string, ParamSpec>> = {
  'alternator-motor': alternatorMotor,
  faraday,
  'joule-transformer': jouleTransformer,
  'kers-braking': kersBraking,
  lenz,
  'rl-energy': rlEnergy,
};

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samples(spec: ParamSpec, rand: () => number): number[] {
  const steps = Math.round((spec.max - spec.min) / spec.step);
  const out = [spec.min, spec.max, spec.default];
  for (let i = 0; i < 40; i++) out.push(spec.min + Math.floor(rand() * (steps + 1)) * spec.step);
  return out.map((v) => snapToSpec(v, spec));
}

describe('slider numeric field round-trips every sim parameter (QA-001)', () => {
  const rand = rng(20261027);
  for (const [sim, schema] of Object.entries(SIMS)) {
    for (const [key, spec] of Object.entries(schema)) {
      it(`${sim}.${key}`, () => {
        const digits = stepDigits(spec.step);
        for (const v of samples(spec, rand)) {
          const shown = formatIT(v, digits);
          expect(parseNumberIT(shown), `${sim}.${key}: "${shown}"`).toBe(v);
        }
      });
    }
  }

  it('sizes the numeric field for the widest formatted value (QA-004)', () => {
    const s = createSlider({ spec: jouleTransformer.P });
    const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
    expect(number.style.getPropertyValue('--slider-chars')).toBe(String('100.000.000'.length));
    s.dispose();
  });

  it('Enter on the unchanged joule-transformer fields keeps the value', () => {
    for (const key of ['V1', 'P'] as const) {
      const s = createSlider({ spec: jouleTransformer[key] });
      document.body.append(s.element);
      const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
      const before = number.value;
      number.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(number.value).toBe(before);
      expect(s.value).toBe(jouleTransformer[key].default);
      expect(number.getAttribute('aria-invalid')).toBeNull();
      s.dispose();
    }
  });
});
