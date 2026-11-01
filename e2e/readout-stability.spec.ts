import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * F4 — readouts never move. For every simulator in the sidebar: sample the bounding
 * boxes of every `.readout__value` and `.formula-row__number` every 250 ms for 5 s while
 * the sliders are moved (min, max, middle), and require 0 px change in x, y, width and
 * height. Sliders are driven through their `input` event, so nothing scrolls.
 *
 * Sims that have not migrated to the fixed-width readouts yet are `test.fixme` below
 * (FIXME_SIMS); each sim agent removes its entry when its readouts are fixed.
 */

/** Simulator ids in sidebar order (`SIM_IDS` in src/core/registry.ts). */
const SIM_IDS: string[] = [
  ...(
    /SIM_IDS = \[([\s\S]*?)\]/.exec(
      readFileSync(new URL('../src/core/registry.ts', import.meta.url), 'utf8'),
    )?.[1] ?? ''
  ).matchAll(/'([a-z0-9-]+)'/g),
].map((m) => m[1] as string);

/** Not migrated yet (F4 baseline in docs/FIX_ROUND_1.md §3); remove when fixed. */
const FIXME_SIMS: Record<string, string> = {
  // S1: Φ / f.e.m. rows change width (~1ch) when the display prefix/digits change.
  faraday: 'S1: formula items need fixed maxAbs/digits/unit (no per-prefix rebuild)',
  // S4: every readout shifts ~115 px vertically (content above them changes height).
  'joule-transformer': 'S4: content above the readouts changes height on slider changes',
};

type Box = { key: string; x: number; y: number; w: number; h: number };

const boxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.readout__value, .formula-row__number')].map(
      (e, i) => {
        const r = e.getBoundingClientRect();
        const row = e.closest<HTMLElement>('[data-key]');
        return {
          key: `${i}:${row?.dataset['key'] ?? e.className}`,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      },
    ),
  );

/** Set slider `index` to a fraction of its range through the `input` event. */
const setSlider = (page: Page, index: number, fraction: number): Promise<void> =>
  page.evaluate(
    ([i, f]) => {
      const sliders = [
        ...document.querySelectorAll<HTMLInputElement>('.sim-controls input[type=range]'),
      ];
      const s = sliders[i as number];
      if (!s || s.disabled) return;
      const min = Number(s.min);
      const max = Number(s.max);
      s.value = String(min + (max - min) * (f as number));
      s.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [index, fraction],
  );

test.describe('F4 readout stability', () => {
  for (const id of SIM_IDS) {
    test(`${id}: readouts keep a fixed box while values change`, async ({ page }) => {
      test.fixme(id in FIXME_SIMS, FIXME_SIMS[id]);
      test.setTimeout(60_000);
      await page.goto(`/#/sim/${id}`);
      await expect(page.locator(`nav a[href="#/sim/${id}"]`)).toBeVisible();
      await expect(page.locator('.sim-layout')).toBeVisible();
      await page.waitForTimeout(1500); // intro flight, first values
      const sliderCount = await page.locator('.sim-controls input[type=range]').count();
      const base = await boxes(page);
      test.skip(base.length === 0, 'no live readouts');
      const moved: string[] = [];
      const fractions = [1, 0, 0.5];
      for (let k = 0; k < 20; k++) {
        if (sliderCount > 0) await setSlider(page, k % sliderCount, fractions[k % 3] as number);
        await page.waitForTimeout(250);
        const now = await boxes(page);
        expect(now.length).toBe(base.length);
        now.forEach((b, i) => {
          const a = base[i] as Box;
          const d = Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.w - b.w),
            Math.abs(a.h - b.h),
          );
          if (d > 0) moved.push(`${b.key} moved ${d.toFixed(1)} px at sample ${k}`);
        });
      }
      expect(moved, moved.slice(0, 10).join('\n')).toEqual([]);
    });
  }
});
