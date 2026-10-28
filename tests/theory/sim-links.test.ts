// @vitest-environment jsdom
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadSimModules } from '../../src/core/registry';
import { createTheoryLinks as alternatorLinks } from '../../src/sims/alternator-motor/panel';
import { createTheoryLinks as carDynamicsLinks } from '../../src/sims/car-dynamics/panel';

// uPlot needs matchMedia at import time (not available in jsdom).
vi.mock('uplot', () => ({ default: class {} }));

/**
 * Every theory id a simulator points to (header `theoryId` and in-panel links)
 * must exist in `content/theory/`. Reads the real content (owned by the content
 * agent): fails until the v0.5.0 renames (e.g. `15-dinamica-frenata`) land.
 */
const THEORY_IDS = new Set(
  readdirSync(resolve(process.cwd(), 'content/theory')) // jsdom's URL is not file:
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3)),
);

const hrefIds = (p: HTMLElement): string[] =>
  [...p.querySelectorAll('a')].map((a) =>
    (a.getAttribute('href') ?? '').replace(/^#\/teoria\//, ''),
  );

describe('simulator → theory links', () => {
  it('every SimModule.theoryId exists', async () => {
    const sims = await loadSimModules();
    expect(sims.length).toBe(7);
    for (const sim of sims) expect(THEORY_IDS.has(sim.theoryId), sim.id).toBe(true);
  });

  it('every in-panel theory link exists (car-dynamics, alternator-motor)', () => {
    for (const id of [...hrefIds(carDynamicsLinks()), ...hrefIds(alternatorLinks())]) {
      expect(THEORY_IDS.has(id), id).toBe(true);
    }
  });
});
