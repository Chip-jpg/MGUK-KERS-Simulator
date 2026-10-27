import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility gate (proxy for "Lighthouse accessibility ≥ 95", which cannot run
 * offline in CI/sandbox): axe-core WCAG 2.0/2.1 A+AA rules on every shell page,
 * both themes. Zero serious/critical violations allowed.
 */

const PAGES = [
  '#/teoria',
  '#/teoria/03-faraday-neumann',
  '#/teoria/14-glossario',
  '#/sim',
  '#/sim/faraday',
  '#/interrogazione',
];

for (const theme of ['dark', 'light'] as const) {
  for (const hash of PAGES) {
    test(`axe ${theme} ${hash}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`./${hash}`);
      await expect(page.locator('main h1')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      const summary = results.violations.map(
        (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
      );
      if (summary.length) console.warn(`[axe ${theme} ${hash}]\n  ${summary.join('\n  ')}`);
      expect(blocking, summary.join('\n')).toEqual([]);
    });
  }
}
