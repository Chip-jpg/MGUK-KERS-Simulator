import { expect, test, type Page } from '@playwright/test';

/**
 * Scene readability (QA-031, QA-039): at the minimum (1280×720) and the reference
 * (1920×1080) resolution, for every simulator,
 * - no two visible scene labels intersect,
 * - no label intersects a box drawn over the canvas (legend, HUD, status badge),
 * - the in-canvas legends cover at most 15 % of the canvas (at 1280×720 they are docked
 *   below the scene, in the collapsible "Legenda" block),
 * - the scene is at least 360 px tall; at 1920×1080 the plots sit directly under it.
 */

const SIMS = [
  'faraday',
  'lenz',
  'alternator-motor',
  'rl-energy',
  'joule-transformer',
  'kers-braking',
  'car-dynamics',
] as const;

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

interface Layout {
  sceneH: number;
  sceneBottom: number;
  plotsTop: number | null;
  docked: boolean;
  labels: number;
  overlaps: string[];
  legendFrac: number;
}

/** Measure the scene overlay in one synchronous pass (one rendered frame). */
const measure = (page: Page): Promise<Layout> =>
  page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('.sim-scene')!;
    const overlay = scene.querySelector<HTMLElement>('.sim-scene__overlay')!;
    const canvas = scene.querySelector('canvas')!;
    const cr = canvas.getBoundingClientRect();
    const visible = (e: Element): boolean => {
      const s = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        Number(s.opacity) > 0.05 &&
        b.width > 0 &&
        b.height > 0
      );
    };
    const labels = [...overlay.querySelectorAll('.r-label')]
      .filter(visible)
      .map((e) => ({ t: e.textContent ?? '', b: e.getBoundingClientRect() }));
    const boxes = [...overlay.children, ...scene.children]
      .filter(
        (c) =>
          c !== overlay &&
          c.tagName !== 'CANVAS' &&
          !c.classList.contains('r-label') &&
          !c.classList.contains('sim-placeholder') &&
          !c.hasAttribute('data-label-pass') &&
          visible(c),
      )
      .map((e) => ({
        t: e.className,
        legend: e.hasAttribute('data-scene-legend'),
        b: e.getBoundingClientRect(),
      }));
    const area = (a: DOMRect, c: DOMRect): number =>
      Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) *
      Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
    const overlaps: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!;
        const c = labels[j]!;
        if (area(a.b, c.b) > 0.5) overlaps.push(`${a.t} ⟷ ${c.t}`);
      }
      for (const o of boxes) {
        const a = labels[i]!;
        if (area(a.b, o.b) > 0.5) overlaps.push(`${a.t} ⟷ [${o.t}]`);
      }
    }
    const legendArea = boxes.filter((o) => o.legend).reduce((s, o) => s + area(o.b, cr), 0);
    const plots = document.querySelector('.sim-plots')?.getBoundingClientRect();
    const dock = document.querySelector<HTMLElement>('.sim-legend-dock');
    return {
      sceneH: cr.height,
      sceneBottom: scene.getBoundingClientRect().bottom,
      plotsTop: plots && plots.height > 0 ? plots.top : null,
      docked: !!dock && !dock.hidden,
      labels: labels.length,
      overlaps,
      legendFrac: legendArea / (cr.width * cr.height),
    };
  });

for (const vp of VIEWPORTS) {
  for (const sim of SIMS) {
    test(`${sim} @ ${vp.width}×${vp.height}: labels clear of each other and of legend/HUD`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto(`/#/sim/${sim}`);
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1, { timeout: 30_000 });
      await expect
        .poll(async () => (await measure(page)).labels, { timeout: 20_000 })
        .toBeGreaterThan(2);
      // Labels move with the animation: every sample must be clean.
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(400);
        const m = await measure(page);
        expect(m.overlaps, `overlaps in sample ${k}`).toEqual([]);
        expect(m.legendFrac).toBeLessThanOrEqual(0.15);
        expect(m.sceneH).toBeGreaterThanOrEqual(355);
        if (vp.width === 1280) {
          // compact scene: every legend / HUD is docked below the canvas
          expect(m.legendFrac).toBe(0);
          if (sim !== 'faraday') expect(m.docked).toBe(true); // faraday has no legend box
        } else {
          expect(m.docked).toBe(false);
          // plots directly under the scene and on screen
          expect(m.plotsTop).not.toBeNull();
          expect((m.plotsTop ?? 0) - m.sceneBottom).toBeLessThan(40);
          expect(m.plotsTop ?? 1e9).toBeLessThan(vp.height);
        }
      }
    });
  }
}

test('legend dock is a keyboard-collapsible "Legenda" block', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/sim/lenz');
  const dock = page.getByTestId('legend-dock');
  await expect(dock).toBeVisible();
  await expect(dock).toContainText('Legenda');
  await expect(dock.locator('[data-scene-legend]')).toContainText('B magnete');
  const summary = dock.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(dock).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(dock).toHaveAttribute('open', '');
  // A larger window moves the legend back into the scene.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(dock).toBeHidden();
  await expect(page.locator('.sim-scene__overlay [data-scene-legend]')).toHaveCount(1);
});
