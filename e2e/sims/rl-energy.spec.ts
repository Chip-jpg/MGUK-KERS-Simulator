import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** E2E for the `rl-energy` simulator (A8). */

interface Debug {
  mounted: number;
  renderers: number;
  geometries: number;
  materials: number;
  info: { geometries: number; textures: number; objects: number } | null;
  t: number;
  i: number;
  tauRatio: number;
  balance: { gen: number; joule: number; field: number; relError: number };
}

const ID = 'rl-energy';
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

test('loads with canvas, shows i(τ) = 63,2 %, transient + energy balance', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`./#/sim/${ID}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Autoinduzione, circuito RL, energia' }),
  ).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.getByTestId('tau-ratio')).toHaveText(/^63,2\s%$/);
  await expect(page.locator('.rl-tau')).toHaveText(/i\(τ\) = 63,2\s% di I₀/);
  expect(Math.abs((await debug(page)).tauRatio - 0.632)).toBeLessThan(1e-3);
  await expect(page.locator('.plot')).toHaveCount(3);

  await page.getByRole('button', { name: 'Chiudi interruttore' }).click();
  await expect(page.getByRole('button', { name: 'Apri e azzera' })).toBeVisible();
  // The transient (6τ) is played in ≈ 7 s; wait until t > τ.
  await expect.poll(async () => (await debug(page)).t, { timeout: 10_000 }).toBeGreaterThan(0.05);
  const d = await debug(page);
  expect(d.i).toBeGreaterThan(0);
  expect(d.balance.relError).toBeLessThan(1e-6);
  await expect(page.getByTestId('balance')).toContainText('✓');
  expect(errors).toEqual([]);
});

test('sliders work by keyboard; solenoid toggle computes L', async ({ page }) => {
  await page.goto(`./#/sim/${ID}`);
  const r = page.locator(`#${ID}-R-range`);
  await r.focus();
  await r.press('ArrowRight'); // 4 → 4,5 Ω
  await expect(page.locator(`#${ID}-R-number`)).toHaveValue('4,5');
  await expect(page.getByTestId('tau-ratio')).toHaveText(/^63,2\s%$/);
  await page.getByText('L da solenoide').click();
  await expect(page.locator(`#${ID}-N-range`)).toBeVisible();
  await expect(page.locator(`#${ID}-L-range`)).toBeDisabled();
  await page.locator(`#${ID}-N-range`).press('End');
  await expect(page.getByTestId('tau-ratio')).toHaveText(/^63,2\s%$/);
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
  expect(await page.locator('canvas').count()).toBe(3); // scene + 2 uPlot canvases

  await page.getByRole('button', { name: 'Chiudi interruttore' }).click();
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
