import { expect, test } from '@playwright/test';

const sims = [
  'faraday',
  'lenz',
  'rl-energy',
  'joule-transformer',
  'alternator-motor',
  'kers-braking',
  'car-dynamics',
  'drive-sim',
  'mguk-teardown',
] as const;

test.use({
  launchOptions: {
    ...(process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {}),
    ignoreDefaultArgs: ['--hide-scrollbars'],
  },
});

for (const width of [390, 375, 360]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const id of sims) {
      test(`${id}: panels, readouts and legends fit at ${width} px`, async ({ page }) => {
        await page.goto(`./?quality=base#/sim/${id}`);
        await expect(page.locator('.sim-scene canvas')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBe(
          15,
        );

        await expect
          .poll(async () =>
            page.evaluate(() => {
              const root = document.documentElement;
              const outside: string[] = [];
              const panels = '.formula-panel, .sim-layout__side, .rl-energy, .jt-bars, .cd-balance';
              for (const element of document.querySelectorAll<HTMLElement>('.sim-layout *')) {
                if (
                  element.closest('.katex-mathml') ||
                  !element.checkVisibility({ checkVisibilityCSS: true })
                )
                  continue;
                let scroller = false;
                for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                  if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) {
                    scroller = true;
                    break;
                  }
                }
                if (scroller) continue;
                const box = element.getBoundingClientRect();
                if (!box.width || !box.height) continue;
                if (box.right > root.clientWidth + 0.5)
                  outside.push(`${element.tagName}.${element.className}: ${box.right}`);
                if (element.matches('.value-readout, .text-readout, [data-scene-legend]')) {
                  const panel = element.parentElement?.closest(panels);
                  if (panel && box.right > panel.getBoundingClientRect().right + 0.5)
                    outside.push(`${element.className}: exceeds its panel`);
                }
              }
              return { overflow: root.scrollWidth - root.clientWidth, outside };
            }),
          )
          .toEqual({ overflow: 0, outside: [] });
      });
    }
  });
}
