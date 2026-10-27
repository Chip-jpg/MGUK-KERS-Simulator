import { describe, expect, it } from 'vitest';
import { createRegistry, loadSimModules, SIM_IDS } from '../../src/core/registry';
import type { SimModule } from '../../src/core/types';

const fake = (id: string): SimModule => ({
  id,
  titleIT: id,
  summaryIT: '',
  slideRefs: [],
  theoryId: '',
  mount: () => ({ dispose() {} }),
});

describe('registry', () => {
  it('lists the six phase-1 simulator ids', () => {
    expect(SIM_IDS).toEqual([
      'faraday',
      'lenz',
      'alternator-motor',
      'kers-braking',
      'joule-transformer',
      'rl-energy',
    ]);
  });

  it('registers, gets and lists modules in SIM_IDS order', () => {
    const r = createRegistry();
    r.register(fake('rl-energy'));
    r.register(fake('faraday'));
    expect(r.get('faraday')?.id).toBe('faraday');
    expect(r.has('lenz')).toBe(false);
    expect(r.list().map((m) => m.id)).toEqual(['faraday', 'rl-energy']);
  });

  it('rejects duplicate and unknown ids', () => {
    const r = createRegistry();
    r.register(fake('lenz'));
    expect(() => r.register(fake('lenz'))).toThrow(/already registered/);
    expect(() => r.register(fake('warp-drive'))).toThrow(/Unknown simulator id/);
  });

  it('loadSimModules discovers src/sims/*/index.ts (none yet in the scaffold)', () => {
    const r = createRegistry();
    const loaded = loadSimModules(r);
    expect(loaded.map((m) => m.id).every((id) => r.has(id))).toBe(true);
  });
});
