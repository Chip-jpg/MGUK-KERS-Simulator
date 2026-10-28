import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility gate (proxy for "Lighthouse accessibility ≥ 95", which cannot run
 * offline in CI/sandbox): axe-core WCAG 2.0/2.1 A+AA rules on every shell page and
 * on EVERY theory section (QA-021: long formulas can create scroll regions), both
 * themes, at the 1280×720 minimum resolution. Zero violations of any impact (D9).
 */

const theoryDir = fileURLToPath(new URL('../content/theory/', import.meta.url));
const THEORY = readdirSync(theoryDir)
  .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
  .sort()
  .map((f) => `#/teoria/${f.slice(0, -3)}`);

const PAGES = ['#/teoria', ...THEORY, '#/sim', '#/sim/faraday'];

test('the sweep covers all theory sections', () => {
  expect(THEORY.length).toBeGreaterThanOrEqual(15);
});

test('overflowing display formulas are focusable scroll regions (QA-020)', async ({ page }) => {
  // On a phone-width viewport several formulas of theory 15 are wider than the column.
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto('./#/teoria/15-dinamica-frenata');
  await expect(page.locator('main h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const states = await page.locator('.math-display').evaluateAll((els) =>
    els.map((e) => ({
      overflow: e.scrollWidth > e.clientWidth,
      tab: e.getAttribute('tabindex'),
    })),
  );
  expect(states.some((s) => s.overflow)).toBe(true);
  for (const s of states) expect(s.tab).toBe(s.overflow ? '0' : null);
  const results = await new AxeBuilder({ page })
    .withRules(['scrollable-region-focusable'])
    .analyze();
  expect(results.violations).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  for (const hash of PAGES) {
    test(`axe ${theme} ${hash}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`./${hash}`);
      await expect(page.locator('main h1')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map(
        (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
      );
      if (summary.length) console.warn(`[axe ${theme} ${hash}]\n  ${summary.join('\n  ')}`);
      expect(results.violations, summary.join('\n')).toEqual([]);
    });
  }
}
