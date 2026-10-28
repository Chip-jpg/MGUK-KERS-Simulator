import { expect, test } from '@playwright/test';

/**
 * A3 "done" gate: a theory page and a simulator page, dark + light,
 * at 1280×720 and 1920×1080, with no horizontal page scroll.
 *
 * Screenshots (viewport-only PNGs, small files):
 * - by default they go to `test-results/screenshots/` (gitignored), so a plain
 *   `npm run e2e` never dirties the tree (QA-010);
 * - `UPDATE_SCREENSHOTS=1 npm run e2e -- e2e/screenshots.spec.ts` refreshes the
 *   committed set in `e2e/screenshots/` (theory + sim pages only). Commit the
 *   result deliberately.
 */

const OUT_DIR =
  process.env['UPDATE_SCREENSHOTS'] === '1' ? 'e2e/screenshots' : 'test-results/screenshots';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;
const THEMES = ['dark', 'light'] as const;
const PAGES = [
  { name: 'theory', hash: '#/teoria/03-faraday-neumann', ready: '.prose .katex' },
  { name: 'sim-empty', hash: '#/sim/faraday', ready: '.sim-scene' },
] as const;

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const p of PAGES) {
      test(`${p.name} ${theme} ${vp.width}x${vp.height}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto(`./${p.hash}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(p.ready).first()).toBeVisible();
        // No horizontal page scroll at either size.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${OUT_DIR}/${p.name}-${theme}-${vp.width}x${vp.height}.png`,
          animations: 'disabled',
        });
      });
    }
  }
}
