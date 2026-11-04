import { test, expect, type Page } from '@playwright/test';

async function indicators(page: Page) {
  return page.locator('.am-indicator').evaluateAll((nodes) =>
    nodes.map((node) => {
      const el = node as HTMLElement;
      const box = el.getBoundingClientRect();
      return {
        key: el.dataset['indicator'],
        text: el.textContent,
        box: [box.x, box.y, box.width, box.height],
        visible: getComputedStyle(el).display !== 'none' && box.width > 0,
        clipped: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
      };
    }),
  );
}

for (const width of [1280, 1920]) {
  test(`machine indicators: stationary, readable and complete at ${width}px in both modes/themes`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    await page.goto('./?quality=base#/sim/alternator-motor');
    await expect(page.locator('.am-indicator')).toHaveCount(7);
    const styles = await page.locator('.sim-scene').evaluate((scene) => {
      const base = getComputedStyle(scene.querySelector('.r-label--lg')!);
      return [...scene.querySelectorAll('.am-indicator')].every((node) => {
        const s = getComputedStyle(node);
        return (
          s.fontFamily === base.fontFamily &&
          s.fontWeight === base.fontWeight &&
          s.borderRadius === base.borderRadius &&
          s.padding === base.padding
        );
      });
    });
    expect(styles).toBe(true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const theme of ['dark', 'light']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.locator('.theme-toggle').click();
      for (const mode of ['Generatore (frenata)', 'Motore (accelerazione)']) {
        await page.locator('.am-mode label').filter({ hasText: mode }).click();
        // The shared stage has an introductory camera flight; measure with a fixed camera.
        await page.getByRole('button', { name: 'Ripristina vista', exact: true }).click();
        await page.waitForTimeout(500);
        const initial = await indicators(page);
        expect(
          initial.every((n) => n.visible && !n.clipped),
          JSON.stringify(initial),
        ).toBe(true);
        // Sample within the browser while the rotor and force arrows keep moving.
        const movement = await page.locator('.am-indicator').evaluateAll(async (nodes) => {
          const rects = () =>
            nodes.map((node) => {
              const b = node.getBoundingClientRect();
              return [b.x, b.y, b.width, b.height];
            });
          const first = JSON.stringify(rects());
          let moved = false;
          for (let i = 0; i < 25; i++) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (JSON.stringify(rects()) !== first) moved = true;
          }
          return moved;
        });
        expect(movement).toBe(false);
        const final = await indicators(page);
        expect(final.some((n, i) => n.text !== initial[i]?.text)).toBe(true);
        expect(
          final.every((n) => n.visible && !n.clipped),
          JSON.stringify(final),
        ).toBe(true);
        const text = final.map((n) => n.text).join(' ');
        expect(text).toContain('P Joule');
        expect(text).toContain('P batt.');
        expect(text).toContain('P mecc.');
        expect(final.find((n) => n.key === 'rotor')?.text).toContain('τₑₘ');
      }
    }
    await page.getByRole('button', { name: 'Presentazione', exact: true }).click();
    await page.waitForTimeout(500);
    const presentationIndicators = await indicators(page);
    expect(
      presentationIndicators.every((n) => n.visible && !n.clipped),
      JSON.stringify(presentationIndicators),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('machine indicators stay fully readable through parameter extremes and camera changes', async ({
  page,
}) => {
  // long input loops on a software-GL CI runner
  test.setTimeout(120_000);
  await page.goto('./?quality=base#/sim/alternator-motor');
  await expect(page.locator('.am-indicator')).toHaveCount(7);
  for (const input of await page.locator('.sim-controls input[type=range]').all()) {
    for (const key of ['Home', 'End']) {
      await input.focus();
      await input.press(key);
      await page.waitForTimeout(80);
      const values = await indicators(page);
      expect(
        values.every((n) => n.visible && !n.clipped),
        JSON.stringify(values),
      ).toBe(true);
    }
  }
  await page.getByRole('button', { name: 'Ripristina vista', exact: true }).click();
  await page.locator('[data-fullscreen]').click();
  await page.waitForTimeout(600);
  const values = await indicators(page);
  expect(
    values.every((n) => n.visible && !n.clipped),
    JSON.stringify(values),
  ).toBe(true);
});
