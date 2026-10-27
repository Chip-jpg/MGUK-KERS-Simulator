import { expect, test } from '@playwright/test';

/**
 * A3 "done" gate: screenshots of a theory page and an (empty) simulator page,
 * dark + light, at 1280×720 and 1920×1080, written to e2e/screenshots/.
 * Viewport-only PNGs keep the committed files small.
 */

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
          path: `e2e/screenshots/${p.name}-${theme}-${vp.width}x${vp.height}.png`,
          animations: 'disabled',
        });
      });
    }
  }
}
