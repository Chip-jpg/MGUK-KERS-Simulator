import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** E2E for the `joule-transformer` simulator (A8). */

interface Debug {
  mounted: number;
  renderers: number;
  geometries: number;
  materials: number;
  info: { geometries: number; textures: number; objects: number } | null;
  lossFactor: number;
}

const ID = 'joule-transformer';
const norm = (s: string | null): string => (s ?? '').replace(/\u00A0/g, ' ').trim();
const debug = (page: Page): Promise<Debug> =>
  page.evaluate(
    (id) => (window as unknown as { __kersDebug: Record<string, () => Debug> }).__kersDebug[id]!(),
    ID,
  );

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test('loads with canvas, shows the computed ÷100 gate, no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`./#/sim/${ID}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Trasformatore e perdite Joule' }),
  ).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const factor = page.getByTestId('loss-factor');
  await expect(factor).toHaveText('100,0');
  await expect(page.locator('.jt-factor')).toContainText(
    'Con tensione ×10 le perdite si riducono di un fattore 100,0',
  );
  await expect(page.getByTestId('power-badge')).toContainText('✓ Potenza conservata');
  expect(norm(await page.getByTestId('loss').textContent())).toBe('12,5 kW');
  expect(Math.abs((await debug(page)).lossFactor - 100)).toBeLessThan(1e-9);
  await expect(page.locator('.sim-note')).toContainText('Modello semplificato');
  expect(errors).toEqual([]);
});

test('sliders work by keyboard', async ({ page }) => {
  await page.goto(`./#/sim/${ID}`);
  const n2 = page.locator(`#${ID}-N2-range`);
  await n2.focus();
  await n2.press('ArrowRight'); // +50 turns: 1000 → 1050
  await expect(page.getByTestId('V2')).toHaveText(/210\s?kV/);
  await n2.press('Home'); // 50 turns → line at 10 kV
  await page.locator(`#${ID}-P-range`).press('End'); // 100 MW at 10 kV ⇒ loss > P
  await expect(page.locator('.jt-warning')).toBeVisible();
  await expect(page.getByTestId('loss-factor')).toHaveText('100,0');
  const v1Number = page.locator(`#${ID}-V1-number`);
  await v1Number.fill('10000');
  await v1Number.press('Enter');
  await n2.press('End');
  await expect(page.locator('.jt-warning')).toBeHidden();
  await expect(page.getByTestId('loss-factor')).toHaveText('100,0');
});

test('mount/unmount ×20 without leaks; fps measurement', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(`./#/sim/${ID}`);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const first = await debug(page);
  for (let k = 0; k < 20; k++) {
    await page.evaluate(() => (location.hash = '#/teoria'));
    await expect(page.locator('.sim-scene')).toHaveCount(0);
    await page.evaluate((id) => (location.hash = `#/sim/${id}`), ID);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  const after = await debug(page);
  expect(after.mounted).toBe(1);
  expect(after.renderers).toBe(1);
  expect(after.geometries).toBe(first.geometries);
  expect(after.materials).toBe(first.materials);
  expect(after.info?.geometries).toBe(first.info?.geometries);
  expect(after.info?.textures).toBe(first.info?.textures);
  expect(await page.locator('canvas').count()).toBe(1);

  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (): void => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else resolve(n / ((performance.now() - t0) / 1000));
        };
        requestAnimationFrame(tick);
      }),
  );
  console.warn(`[${ID}] rAF rate over 3 s (headless, SwiftShader): ${frames.toFixed(1)} fps`);
  test.info().annotations.push({ type: 'fps', description: frames.toFixed(1) });
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe: no WCAG 2.1 A/AA violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`./#/sim/${ID}`);
    await page.locator('.sim-scene canvas').waitFor();
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
}
