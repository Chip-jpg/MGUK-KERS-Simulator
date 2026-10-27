import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Simulator `kers-braking` (A7): gates, keyboard, leak check, fps. */

const URL = './#/sim/kers-braking';

interface KersDebug {
  liveMounts: number;
  mountsTotal: number;
  scene: () => { geometries: number; textures: number; programs: number; calls: number } | null;
}

const parseMJ = (s: string): number =>
  Number(
    s
      .replace(/\u00A0?MJ$/, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  );

async function out(page: Page, key: string): Promise<string> {
  return (await page.locator(`[data-out="${key}"]`).textContent()) ?? '';
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (/too many active webgl contexts/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test('loads with canvas, shows ΔE_k = 2,47 MJ and a consistent energy balance', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.locator('[data-out="dEk"]')).toHaveText('2,47\u00A0MJ');

  for (const id of ['2025', '2026']) {
    await page.locator(`[data-preset="${id}"]`).click();
    await expect(page.locator('[data-out="dEk"]')).toHaveText('2,47\u00A0MJ');
    const dEk = parseMJ(await out(page, 'dEk'));
    const rec = parseMJ(await out(page, 'recovered'));
    const diss = parseMJ(await out(page, 'dissipated'));
    expect(Math.abs(rec + diss - dEk)).toBeLessThanOrEqual(0.0100001);
    if (id === '2025') expect(rec).toBeCloseTo(0.36, 2);
    else expect(rec).toBeGreaterThan(0.36);
  }
  await expect(page.locator('.sim-note')).toContainText('decelerazione costante');
  await expect(page.locator('.formula-panel .katex').first()).toBeVisible();
  await expect(page.locator('.plot canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('sliders work by keyboard; v₂ > v₁ shows "Non è una frenata"', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  const v2 = page.locator('#kers-v2-range');
  await v2.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#kers-v2-number')).toHaveValue('360');
  await expect(page.locator('.kers-message')).toBeVisible();
  await expect(page.locator('.kers-message')).toContainText('Non è una frenata');
  await expect(page.locator('[data-out="dEk"]')).toHaveText('—');

  await page.keyboard.press('Home');
  await expect(page.locator('.kers-message')).toBeHidden();
  // 300 → 0 km/h, 800 kg: ½·800·83,33² = 2,78 MJ
  await expect(page.locator('[data-out="dEk"]')).toHaveText('2,78\u00A0MJ');

  const mass = page.locator('#kers-m-number');
  await mass.fill('1000');
  await mass.press('Enter');
  await expect(page.locator('[data-out="dEk"]')).toHaveText('3,47\u00A0MJ');

  await page.getByRole('button', { name: 'Reimposta' }).click();
  await expect(page.locator('[data-out="dEk"]')).toHaveText('2,47\u00A0MJ');
  expect(errors).toEqual([]);
});

test('Pausa / Passo advance the playback by one physics step', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Pausa' }).click();
  const t0 = await page.evaluate(() =>
    (window as unknown as { __kersDebug: Record<string, { simTime(): number }> }).__kersDebug[
      'kers-braking'
    ]!.simTime(),
  );
  await page.getByRole('button', { name: /passo/i }).click();
  const t1 = await page.evaluate(() =>
    (window as unknown as { __kersDebug: Record<string, { simTime(): number }> }).__kersDebug[
      'kers-braking'
    ]!.simTime(),
  );
  // One step = 1/240 s at ×1 (or a restart of the playback at the end of the hold).
  expect(Math.abs(t1 - t0 - 1 / 240) < 1e-9 || t1 === 0).toBe(true);
});

test('mount/unmount ×20 without leaks', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const read = () =>
    page.evaluate(() => {
      const d = (window as unknown as { __kersDebug?: Record<string, KersDebug> }).__kersDebug?.[
        'kers-braking'
      ];
      return {
        live: d?.liveMounts ?? -1,
        total: d?.mountsTotal ?? -1,
        scene: d?.scene() ?? null,
        canvases: document.querySelectorAll('canvas').length,
      };
    });
  await page.waitForTimeout(300);
  const first = await read();
  expect(first.live).toBe(1);

  for (let k = 0; k < 20; k++) {
    await page.goto('./#/teoria');
    await expect(page.locator('.sim-scene')).toHaveCount(0);
    const away = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      debug: (window as unknown as { __kersDebug?: Record<string, unknown> }).__kersDebug?.[
        'kers-braking'
      ],
    }));
    expect(away.canvases).toBe(0);
    expect(away.debug).toBeUndefined();
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  await page.waitForTimeout(300);
  const last = await read();
  process.stdout.write(
    `[kers-braking] leak check first=${JSON.stringify(first)} last=${JSON.stringify(last)}\n`,
  );
  expect(last.live).toBe(1);
  expect(last.total).toBe(first.total + 20);
  expect(last.canvases).toBe(first.canvases);
  expect(last.scene?.geometries).toBe(first.scene?.geometries);
  expect(last.scene?.textures).toBe(first.scene?.textures);
  expect(errors).toEqual([]);
});

test('fps measurement (headless, software GL)', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await page.waitForTimeout(500);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number): void => {
          frames += 1;
          if (now - start < 3000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  process.stdout.write(
    `[kers-braking] rAF rate over 3 s: ${fps.toFixed(1)} fps (headless SwiftShader)\n`,
  );
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) });
  expect(fps).toBeGreaterThan(5);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe ${theme}: no serious/critical WCAG A/AA violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(URL);
    await expect(page.locator('[data-out="dEk"]')).toHaveText('2,47 MJ');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
    );
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(blocking, summary.join('\n')).toEqual([]);
  });
}
