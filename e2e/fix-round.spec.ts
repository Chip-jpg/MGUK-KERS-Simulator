import { test, expect, type Page } from '@playwright/test';

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
test('F7: 30 FPS limit is enforced, persisted and the counter starts hidden', async ({ page }) => {
  await page.goto('./?quality=base#/sim/faraday');
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.locator('.fps-counter')).toBeHidden();
  await page.getByRole('combobox', { name: 'Limite FPS', exact: true }).selectOption('30');
  await page.waitForTimeout(1800);
  const stats = await debug(page, 'performance');
  expect(stats['samples']).toBeGreaterThan(10);
  expect(stats['fps']).toBeLessThanOrEqual(31);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Limite FPS', exact: true })).toHaveValue('30');
});
type Debug = Record<string, number | boolean | string | object>;
async function debug(page: Page, id: string): Promise<Debug> {
  return page.evaluate((key) => {
    const hooks = (window as unknown as { __kersDebug: Record<string, () => Debug> }).__kersDebug;
    return hooks?.[key]?.() ?? {};
  }, id);
}

for (const id of sims) {
  test(`${id}: fixed sensors over five seconds and fullscreen preserves state`, async ({
    page,
  }) => {
    test.setTimeout(45000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?quality=base#/sim/${id}`);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await page.waitForTimeout(700);
    // Use viewport-relative offsets with scroll fixed, and sample every sensor.
    const instability = await page.evaluate(async () => {
      const rect = (n: HTMLElement) => {
        const b = n.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height];
      };
      const nodes = () =>
        [...document.querySelectorAll<HTMLElement>('[data-readout]')].filter(
          (n) => n.getBoundingClientRect().width > 0,
        );
      const initial = nodes().map(rect);
      const failures: string[] = [];
      for (let i = 0; i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (i === 10) {
          const slider = document.querySelector<HTMLInputElement>(
            '.sim-controls input[type=range]:not(:disabled)',
          );
          if (slider) {
            slider.value = slider.max;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        nodes().forEach((n, j) => {
          if (JSON.stringify(rect(n)) !== JSON.stringify(initial[j])) failures.push(n.className);
        });
      }
      return { count: nodes().length, failures: [...new Set(failures)] };
    });
    expect(instability.count).toBeGreaterThan(0);
    expect(instability.failures).toEqual([]);
    const before = await debug(page, id);
    await page.locator('[data-fullscreen]').click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className))
      .toContain('sim-layout');
    await expect(page.locator('[data-fullscreen]')).toHaveAttribute('aria-pressed', 'true');
    const size = await page.locator('.sim-scene canvas').evaluate((c: HTMLCanvasElement) => ({
      w: c.width,
      h: c.height,
      cssW: c.clientWidth,
      cssH: c.clientHeight,
    }));
    expect(Math.abs(size.w / size.h - size.cssW / size.cssH)).toBeLessThan(0.05);
    await page.locator('[data-fullscreen]').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.locator('[data-fullscreen]')).toHaveAttribute('aria-pressed', 'false');
    const after = await debug(page, id);
    if (typeof before['t'] === 'number' && typeof after['t'] === 'number')
      expect(after['t']).toBeGreaterThanOrEqual(before['t']);
    expect(errors).toEqual([]);
  });
}

test('F6: Faraday axes stay labelled through every parameter and zero/extreme values', async ({
  page,
}) => {
  await page.goto('./?quality=base#/sim/faraday');
  for (const key of ['B', 'S', 'N', 'omega']) {
    const range = page.locator(`#faraday-${key}-range`);
    await range.focus();
    for (const end of ['Home', 'End']) {
      await range.press(end);
      for (const plot of await page.locator('figure.plot').all()) {
        await expect(plot).toHaveAttribute('data-y-ticks', /\d.*\|.*\d/);
        await expect(plot).toHaveAttribute('data-y-unit', /\S/);
        await expect(plot).not.toHaveAttribute('data-y-ticks', /NaN|Infinity/);
      }
    }
  }
  await expect(page.getByText('Moto traslatorio', { exact: true })).toHaveCount(0);
});

test('F9: empty battery disables motor, survives mode switches and recharge restores it', async ({
  page,
}) => {
  await page.goto('./?quality=base#/sim/alternator-motor');
  await page.getByRole('radio', { name: 'Motore (accelerazione)' }).check();
  const initial = page.locator('#am-initial-soc-number');
  await initial.fill('1');
  await initial.press('Enter');
  await expect(page.locator('.battery-state')).toContainText('Batteria scarica', {
    timeout: 15000,
  });
  await expect.poll(async () => (await debug(page, 'alternator-motor'))['tau']).toBe(0);
  await page.getByRole('button', { name: 'Riavvia la prova' }).click();
  expect((await debug(page, 'alternator-motor'))['depleted']).toBe(true);
  await page.getByRole('button', { name: 'Ricarica', exact: true }).click();
  await expect
    .poll(async () => (await debug(page, 'alternator-motor'))['soc'])
    .toBeGreaterThan(0.05);
  await expect
    .poll(async () => (await debug(page, 'alternator-motor'))['omega'])
    .toBeGreaterThan(0);
});

test('F3: final drive pedals, gradual keys, brake priority, scenario energy', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('./?quality=base#/sim/drive-sim');
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await page.locator('h1').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await expect.poll(async () => (await debug(page, 'drive-sim'))['v']).toBeGreaterThan(0);
  await page.locator('#drive-sim-throttle-number').fill('100');
  await page.locator('#drive-sim-throttle-number').press('Enter');
  await page.waitForTimeout(700);
  await page.locator('#drive-sim-brake-number').fill('100');
  await page.locator('#drive-sim-brake-number').press('Enter');
  await expect.poll(async () => (await debug(page, 'drive-sim'))['a']).toBeLessThan(0);
  await page.getByRole('button', { name: /Scenario: accelera/ }).click();
  await expect
    .poll(async () => (await debug(page, 'drive-sim'))['phase'], { timeout: 45000 })
    .toBe('done');
  const d = await debug(page, 'drive-sim');
  expect(Number(d['v']) * 3.6).toBeCloseTo(100, 5);
  expect(Number(d['released']) / 1e6).toBeCloseTo(2.4691358, 5);
  expect(Math.abs(Number(d['residual']))).toBeLessThan(10);
});

test('F10: transmission operating values for three hand-derived sets', async ({ page }) => {
  await page.goto('./?quality=base#/sim/joule-transformer');
  for (const plot of await page
    .locator('.transmission-plots__grid')
    .first()
    .locator('figure.plot')
    .all()) {
    await expect(plot).toHaveAttribute('data-x-min', '1');
    await expect(plot).toHaveAttribute('data-x-max', '400');
  }
  for (const [power, resistance, turns, loss, current] of [
    [10000000, 5, 1000, 12500, 50],
    [20000000, 10, 500, 400000, 200],
    [1000000, 1, 2000, 6.25, 2.5],
  ]) {
    for (const [key, value] of [
      ['P', power],
      ['Rline', resistance],
      ['N2', turns],
    ]) {
      const input = page.locator(`#joule-transformer-${key}-number`);
      await input.fill(String(value));
      await input.press('Enter');
    }
    const root = page.locator('.transmission-plots');
    await expect
      .poll(async () => Number(await root.getAttribute('data-operating-loss')))
      .toBeCloseTo(loss!, 4);
    expect(Number(await root.getAttribute('data-operating-current'))).toBeCloseTo(current!, 4);
  }
});

test('legacy braking route redirects to the longitudinal model', async ({ page }) => {
  await page.goto('./#/sim/kers-braking');
  await expect(page).toHaveURL(/#\/sim\/kers-drive$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'MGU-K: accelerazione e frenata',
  );
});
