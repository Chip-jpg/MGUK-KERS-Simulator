// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// uPlot (pulled in by the UI barrel) reads matchMedia at import time; jsdom lacks it.
vi.hoisted(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

describe('lenz module metadata', () => {
  it('links its theory section and cites no slides (v0.5.0: no slide refs in the UI)', async () => {
    const sim = (await import('../../../src/sims/lenz/index')).default;
    expect(sim).not.toHaveProperty('slideRefs');
    expect(sim.theoryId).toBe('04-lenz');
  });
});
