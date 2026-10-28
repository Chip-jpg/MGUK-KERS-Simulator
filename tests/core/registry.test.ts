import { describe, expect, it } from 'vitest';
import {
  availableSimIds,
  createRegistry,
  loadSim,
  loadSimModules,
  SIM_IDS,
  type SimLoader,
} from '../../src/core/registry';
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
  it('lists the six phase-1 simulator ids, then the Phase 4 modules', () => {
    expect(SIM_IDS).toEqual([
      'faraday',
      'lenz',
      'alternator-motor',
      'kers-braking',
      'joule-transformer',
      'rl-energy',
      'field-biot-savart',
      'pmsm-dq',
      'car-dynamics',
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

  it('loadSimModules discovers src/sims/*/index.ts lazily', async () => {
    const r = createRegistry();
    const loaded = await loadSimModules(r);
    expect(loaded.map((m) => m.id).every((id) => r.has(id))).toBe(true);
    expect(availableSimIds()).toEqual(loaded.map((m) => m.id));
  });

  it('loadSim loads once, registers, and validates the folder id', async () => {
    const r = createRegistry();
    let calls = 0;
    const loaders = new Map<string, SimLoader>([
      ['lenz', async () => (calls++, { default: fake('lenz') })],
      ['faraday', async () => ({ default: fake('lenz') })],
    ]);
    expect(availableSimIds(loaders)).toEqual(['faraday', 'lenz']);
    expect((await loadSim('lenz', r, loaders))?.id).toBe('lenz');
    await loadSim('lenz', r, loaders);
    expect(calls).toBe(1);
    expect(await loadSim('rl-energy', r, loaders)).toBeUndefined();
    await expect(loadSim('faraday', r, loaders)).rejects.toThrow(/id 'faraday'/);
  });
});
