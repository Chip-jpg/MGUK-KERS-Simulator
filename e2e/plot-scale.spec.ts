import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * F6 — plot scales stay valid. For every simulator with plots: move each slider to its
 * max, its min and back to the middle; after each change every live plot (read through
 * `window.__kersDebug.plots()`, installed by src/ui/plot.ts under automation) must have
 * a finite, non-degenerate y scale and labelled y ticks (≥ 2 non-empty labels).
 *
 * Sims whose plots still misbehave are `test.fixme` in FIXME_SIMS (remove when fixed).
 */

const SIM_IDS: string[] = [
  ...(
    /SIM_IDS = \[([\s\S]*?)\]/.exec(
      readFileSync(new URL('../src/core/registry.ts', import.meta.url), 'utf8'),
    )?.[1] ?? ''
  ).matchAll(/'([a-z0-9-]+)'/g),
].map((m) => m[1] as string);

/** Not migrated yet; remove when fixed. */
const FIXME_SIMS: Record<string, string> = {};

interface PlotInfo {
  title: string;
  yMin: number | null;
  yMax: number | null;
  ticks: string[];
}

const plots = (page: Page): Promise<PlotInfo[]> =>
  page.evaluate(() => {
    const dbg = (window as unknown as { __kersDebug?: { plots?: () => PlotInfo[] } }).__kersDebug;
    return dbg?.plots?.() ?? [];
  });

const setSlider = (page: Page, index: number, fraction: number): Promise<string> =>
  page.evaluate(
    ([i, f]) => {
      const s = [...document.querySelectorAll<HTMLInputElement>('.sim-controls input[type=range]')][
        i as number
      ];
      if (!s || s.disabled) return '';
      const min = Number(s.min);
      const max = Number(s.max);
      s.value = String(min + (max - min) * (f as number));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return s.id || s.getAttribute('aria-label') || `slider ${i as number}`;
    },
    [index, fraction],
  );

function problems(list: PlotInfo[], when: string): string[] {
  const out: string[] = [];
  for (const p of list) {
    const { yMin, yMax } = p;
    if (yMin === null || yMax === null || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      out.push(`${when} · ${p.title}: y scale not finite (${yMin}, ${yMax})`);
    } else if (!(yMax > yMin)) {
      out.push(`${when} · ${p.title}: degenerate y scale [${yMin}, ${yMax}]`);
    }
    const labelled = p.ticks.filter((t) => t.trim() !== '');
    if (labelled.length < 2) out.push(`${when} · ${p.title}: ${labelled.length} y tick labels`);
  }
  return out;
}

test.describe('F6 plot scale', () => {
  for (const id of SIM_IDS) {
    test(`${id}: y scales finite, non-degenerate, labelled after every slider change`, async ({
      page,
    }) => {
      test.fixme(id in FIXME_SIMS, FIXME_SIMS[id]);
      test.setTimeout(120_000);
      await page.goto(`/#/sim/${id}`);
      await expect(page.locator('.sim-layout')).toBeVisible();
      await page.waitForTimeout(1000);
      const initial = await plots(page);
      test.skip(initial.length === 0, 'no plots in this simulator');
      const issues = problems(initial, 'start');
      const n = await page.locator('.sim-controls input[type=range]').count();
      for (let i = 0; i < n; i++) {
        for (const f of [1, 0, 0.5]) {
          const name = await setSlider(page, i, f);
          if (!name) continue;
          await page.waitForTimeout(700); // range easing settles in ≈ 300 ms
          issues.push(...problems(await plots(page), `${name}=${f}`));
        }
      }
      expect(issues, issues.slice(0, 12).join('\n')).toEqual([]);
    });
  }
});
