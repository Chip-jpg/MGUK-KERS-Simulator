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
  it('cites only the slides the sim shows (QA-013)', async () => {
    const sim = (await import('../../../src/sims/lenz/index')).default;
    // magnet toward coil (s4), flux (s7), Faraday-Neumann (s8–9), Lenz (s11)
    expect(sim.slideRefs).toEqual([4, 7, 8, 9, 11]);
    expect(sim.theoryId).toBe('04-lenz');
  });
});
