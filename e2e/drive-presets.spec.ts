import { test, expect, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => {
    const hooks = (
      window as unknown as {
        __kersDebug: Record<
          string,
          () => {
            v: number;
            t: number;
            soc: number;
            pKers: number;
            phase: string;
          }
        >;
      }
    ).__kersDebug;
    return hooks['drive-sim']!();
  });
}

test('drive presets apply 2025/2026 power in both directions and restart a fair comparison', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('./?quality=base#/sim/drive-sim');
  const p2025 = page.getByRole('button', { name: '2025 (120 kW)', exact: true });
  const p2026 = page.getByRole('button', { name: '2026 (350 kW)', exact: true });
  const power = page.locator('#drive-sim-power-number');
  const gas = page.getByRole('button', { name: 'Acceleratore', exact: true });
  const brake = page.getByRole('button', { name: 'Freno', exact: true });
  await expect(p2025).toHaveAttribute('aria-pressed', 'true');
  await p2026.click();
  await expect(p2026).toHaveAttribute('aria-pressed', 'true');
  await expect(p2025).toHaveAttribute('aria-pressed', 'false');
  await expect(power).toHaveValue('350');
  expect(await state(page)).toMatchObject({ v: 0, soc: 0.5, phase: 'manual' });
  await gas.focus();
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await state(page)).pKers, { timeout: 12000 })
    .toBeGreaterThan(120000);
  await page.keyboard.up('Space');
  await brake.focus();
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state(page)).pKers, { timeout: 5000 }).toBeLessThan(-134000);
  await page.keyboard.up('Space');
  await p2025.focus();
  await p2025.press('Enter');
  await expect(power).toHaveValue('120');
  expect(await state(page)).toMatchObject({ v: 0, soc: 0.5, pKers: 0, phase: 'manual' });
  await gas.focus();
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await state(page)).pKers, { timeout: 12000 })
    .toBeGreaterThan(100000);
  expect((await state(page)).pKers).toBeLessThanOrEqual(109000);
  await page.keyboard.up('Space');
  await power.fill('200');
  await power.press('Enter');
  await expect(p2025).toHaveAttribute('aria-pressed', 'false');
  await expect(p2026).toHaveAttribute('aria-pressed', 'false');
  await page.getByText('Differenza tra gli assetti e fonti', { exact: true }).click();
  await expect(page.locator('.drive-presets details')).toContainText('MGU-H non è simulata');
  await expect(page.locator('.drive-presets a')).toHaveCount(3);
});
