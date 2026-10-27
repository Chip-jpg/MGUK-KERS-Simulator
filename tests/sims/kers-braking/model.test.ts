import { describe, expect, it } from 'vitest';
import { formatIT } from '../../../src/core/format';
import { kersBrakingEvent, kmhToMs } from '../../../src/physics';
import {
  LAP_LIMIT_2025,
  LAP_RANGE_2026,
  MIN_MASS_2026,
  PARAM_KEYS,
  PRESETS,
  defaultParams,
  params,
  roundTo,
  stateAt,
  summarize,
  toSI,
  type KersUiParams,
} from '../../../src/sims/kers-braking/model';

const preset = (id: '2025' | '2026'): KersUiParams => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`preset ${id} missing`);
  return p.values;
};

describe('kers-braking params', () => {
  it('has a valid spec for every field and defaults inside the range', () => {
    for (const k of PARAM_KEYS) {
      const s = params[k];
      expect(s.min).toBeLessThan(s.max);
      expect(s.default).toBeGreaterThanOrEqual(s.min);
      expect(s.default).toBeLessThanOrEqual(s.max);
      expect(s.step).toBeGreaterThan(0);
      expect(s.labelIT.length).toBeGreaterThan(0);
    }
  });

  it('defaults match the theory example (10-kers-mguk): 800 kg, 300→100 km/h, 3 s, 120 kW, η 0,9', () => {
    expect(defaultParams()).toEqual({ m: 800, v1: 300, v2: 100, Pmax: 120, eta: 0.9, tBrake: 3 });
  });

  it('converts display units to SI at the boundary', () => {
    const si = toSI(defaultParams());
    expect(si.v1).toBeCloseTo(kmhToMs(300), 12);
    expect(si.v1).toBeCloseTo(83.333, 3);
    expect(si.Pmax).toBe(120_000);
  });
});

describe('kers-braking gates', () => {
  for (const id of ['2025', '2026'] as const) {
    it(`preset ${id}: 800 kg, 300→100 km/h ⇒ ΔE_k displayed "2,47 MJ"`, () => {
      const s = summarize(preset(id));
      expect(s.result.dEk / 1e6).toBeCloseTo(2.469, 3);
      expect(formatIT(s.result.dEk / 1e6, 2, 'MJ')).toBe('2,47 MJ');
    });

    it(`preset ${id}: recovered + dissipated = ΔE_k (exact and after display rounding)`, () => {
      const s = summarize(preset(id));
      const r = s.result;
      expect(r.recovered + r.dissipated).toBeCloseTo(r.dEk, 6);
      expect(s.brakes + s.mgukLoss).toBeCloseTo(r.dissipated, 6);
      const shown = roundTo(r.recovered / 1e6, 2) + roundTo(r.dissipated / 1e6, 2);
      expect(Math.abs(shown - roundTo(r.dEk / 1e6, 2))).toBeLessThanOrEqual(0.01 + 1e-12);
    });
  }

  it('2025 preset numbers (Pmax electrical cap, D8): 0,36 MJ stored, 18,5 s at P_max', () => {
    const s = summarize(preset('2025'));
    expect(s.result.recovered).toBeCloseTo(120e3 * 3, 3);
    expect(s.result.timeToRecoverAtPmax).toBeCloseTo((0.9 * s.result.dEk) / 120e3, 9);
    expect(s.meanPower / 1e3).toBeCloseTo(823, 0);
  });

  it('2026 preset recovers more than 2025', () => {
    expect(summarize(preset('2026')).result.recovered).toBeGreaterThan(
      summarize(preset('2025')).result.recovered,
    );
    expect(preset('2026').Pmax).toBe(350);
    expect(preset('2025').Pmax).toBe(120);
  });

  it('presets reflect OPEN_FACTS status', () => {
    expect(PRESETS.every((p) => p.verified && p.sources.length > 0)).toBe(true);
    expect(MIN_MASS_2026.kg).toBe(768);
    expect(LAP_LIMIT_2025.joules).toBe(2e6);
    expect(LAP_RANGE_2026.verified).toBe(false);
  });

  it('random parameter sets keep the energy balance', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < 50; k++) {
      const p: KersUiParams = {
        m: 500 + 700 * rnd(),
        v1: 360 * rnd(),
        v2: 360 * rnd(),
        Pmax: 500 * rnd(),
        eta: rnd(),
        tBrake: 0.5 + 9.5 * rnd(),
      };
      const s = summarize(p);
      if (p.v2 > p.v1) {
        expect(s.notBraking).toBe(true);
        expect(s.result.recovered).toBe(0);
        continue;
      }
      expect(s.result.recovered + s.brakes + s.mgukLoss).toBeCloseTo(s.result.dEk, 3);
    }
  });
});

describe('kers-braking stateAt (playback)', () => {
  const p = defaultParams();
  const full = summarize(p).result;

  it('t = 0: v₁, nothing stored, instantaneous power = trace[0]', () => {
    const st = stateAt(p, 0);
    expect(st.v).toBeCloseTo(kmhToMs(300), 9);
    expect(st.stored).toBe(0);
    expect(st.pKers).toBeCloseTo(full.powerTrace[0]?.pKers ?? Number.NaN, 6);
  });

  it('t = t_f: v₂ and the energies equal the full event', () => {
    const st = stateAt(p, p.tBrake);
    expect(st.v).toBeCloseTo(kmhToMs(100), 9);
    expect(st.stored).toBeCloseTo(full.recovered, 3);
    expect(st.released).toBeCloseTo(full.dEk, 3);
    expect(st.stored + st.brakesHeat + st.mgukLoss).toBeCloseTo(st.released, 3);
  });

  it('energy stored grows monotonically and powers match the trace mid-event', () => {
    let prev = -1;
    for (let k = 0; k <= 30; k++) {
      const st = stateAt(p, (p.tBrake * k) / 30);
      expect(st.stored).toBeGreaterThanOrEqual(prev);
      prev = st.stored;
    }
    // A case where the MGU-K leaves saturation during the event.
    const q: KersUiParams = { ...p, v2: 20, tBrake: 6, Pmax: 350 };
    const ev = kersBrakingEvent(toSI(q));
    const sample = ev.powerTrace[150];
    if (!sample) throw new Error('trace too short');
    const st = stateAt(q, sample.t);
    expect(st.pKers).toBeCloseTo(sample.pKers, 3);
    expect(st.pBrakes).toBeCloseTo(sample.pBrakes, 3);
  });

  it('distance follows constant deceleration and t is clamped', () => {
    const st = stateAt(p, 99);
    expect(st.t).toBe(p.tBrake);
    const si = toSI(p);
    expect(st.x).toBeCloseTo(((si.v1 + si.v2) / 2) * p.tBrake, 6);
  });

  it('v₂ > v₁: not a braking event, everything zero ("Non è una frenata")', () => {
    const q: KersUiParams = { ...p, v1: 100, v2: 200 };
    const s = summarize(q);
    expect(s.notBraking).toBe(true);
    expect(s.result.recovered).toBe(0);
    expect(s.result.dissipated).toBe(0);
    const st = stateAt(q, 1);
    expect(st.pKers).toBe(0);
    expect(st.stored).toBe(0);
    expect(st.v).toBeGreaterThan(kmhToMs(100));
  });

  it('P_max = 0: all to the discs, infinite time to recover', () => {
    const s = summarize({ ...p, Pmax: 0 });
    expect(s.result.recovered).toBe(0);
    expect(s.brakes).toBeCloseTo(s.result.dEk, 6);
    expect(s.result.timeToRecoverAtPmax).toBe(Infinity);
  });
});
