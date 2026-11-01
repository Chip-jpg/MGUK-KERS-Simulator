import { test, expect } from '@playwright/test';

test('v0.7.1 visual evidence: primary controls and expanded transformer plots', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const out = process.env['UPDATE_ROUND_SCREENSHOTS'] === '1' ? 'docs/media' : 'test-results';
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const id of ['kers-drive', 'drive-sim', 'joule-transformer']) {
      await page.goto(`./?quality=base#/sim/${id}`);
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.locator('.theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Pausa', exact: true }).click();
      await page.screenshot({ path: `${out}/v0.7.1-${id}-${theme}.png` });
      if (id === 'drive-sim') {
        await expect(
          page.getByRole('button', { name: 'Acceleratore', exact: true }),
        ).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Freno', exact: true })).toBeInViewport();
      } else if (id === 'joule-transformer') {
        await page
          .locator('.transmission-plots')
          .screenshot({ path: `${out}/v0.7.1-transformer-plots-${theme}.png` });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
    }
  }
});
