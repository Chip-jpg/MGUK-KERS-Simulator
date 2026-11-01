import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const sims = [
  'faraday',
  'lenz',
  'alternator-motor',
  'kers-drive',
  'joule-transformer',
  'rl-energy',
  'car-dynamics',
  'drive-sim',
];

for (const id of sims) {
  test(`${id}: every plot survives each slider and twenty mount cycles release resources`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?quality=base#/sim/${id}`);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    const ranges = page.locator('.sim-controls input[type=range]:not(:disabled)');
    for (const slider of await ranges.all()) {
      await slider.evaluate((input: HTMLInputElement) => {
        input.value = input.max;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // Each plot includes a canvas; inspect its actual label formatter output.
      for (const plot of await page.locator('figure.plot[data-y-unit]').all()) {
        if (!(await plot.isVisible())) continue;
        await expect(plot).toHaveAttribute('data-y-ticks', /\d/);
        await expect(plot).not.toHaveAttribute('data-y-ticks', /NaN|Infinity/);
      }
    }
    const cdp = await page.context().newCDPSession(page);
    let warmHeap = 0,
      finalHeap = 0;
    for (let i = 0; i < 20; i++) {
      await page.goto(`./?quality=base#/sim/${id}`);
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
      await page.waitForTimeout(100);
      await page.goto('./?quality=base#/teoria');
      await expect(page.locator('.theory-index')).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      const leaked = await page.evaluate(() => {
        const hooks = (
          window as unknown as { __kersDebug?: Record<string, () => Record<string, number>> }
        ).__kersDebug;
        return Object.entries(hooks?.['render']?.() ?? {}).filter(
          ([key, value]) => key.startsWith('live') && value !== 0,
        );
      });
      expect(leaked).toEqual([]);
      if (i === 4 || i === 19) {
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = await cdp.send('Runtime.getHeapUsage');
        if (i === 4) warmHeap = heap.usedSize;
        else finalHeap = heap.usedSize;
      }
    }
    // Bounded cache/VM variation, no linear retained per-mount growth.
    expect(finalHeap - warmHeap).toBeLessThan(2 * 1024 * 1024);
    console.warn(`[round heap] ${id}: ${warmHeap} → ${finalHeap} bytes after GC`);
    await cdp.detach();
    expect(errors).toEqual([]);
  });
}

test('new drive and transformer: keyboard fullscreen, presentation, both themes and accessibility', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const id of ['drive-sim', 'kers-drive', 'joule-transformer']) {
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('./?quality=base#/teoria');
      await page.goto(`./?quality=base#/sim/${id}`);
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.locator('.theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
      await page.locator('h1').focus();
      await page.keyboard.press('f');
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await page.locator('.sim-scene canvas').focus();
      await page.keyboard.press('p');
      await expect(page.locator('.sim-layout')).toHaveClass(/sim-presentation/);
      await page.keyboard.press('f');
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});

test('measured FPS/frame-time per simulator and cap; informative hardware-dependent sample', async ({
  page,
}) => {
  test.skip(
    process.env['RUN_PERFORMANCE'] !== '1',
    'Opt-in measurement: run one worker with RUN_PERFORMANCE=1.',
  );
  test.setTimeout(180000);
  const rows: object[] = [];
  for (const id of sims) {
    await page.goto(`./?quality=base#/sim/${id}`);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await page.waitForTimeout(1000);
    for (const cap of ['auto', '60', '30']) {
      await page.getByRole('combobox', { name: 'Limite FPS', exact: true }).selectOption(cap);
      await page.waitForTimeout(3000);
      const stats = await page.evaluate(() => {
        const hooks = (window as unknown as { __kersDebug: Record<string, () => object> })
          .__kersDebug;
        return hooks['performance']?.() ?? {};
      });
      rows.push({ id, cap, ...stats });
    }
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/round-performance.json', JSON.stringify(rows, null, 2));
  console.warn(`[round performance] ${JSON.stringify(rows)}`);
});
