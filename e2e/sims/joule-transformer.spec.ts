import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** E2E for the `joule-transformer` simulator (A8; render foundation since V3). */

interface Debug {
  mounted: number;
  mountsTotal: number;
  tier: string | null;
  scene: {
    post: boolean;
    shadows: boolean;
    ibl: boolean;
    memory: { geometries: number; textures: number };
    fluxLoops: number;
    lit: number;
    sagDrawn: number;
    frames: number;
    labels: { labels: number };
  } | null;
  sceneStats: Record<string, number>;
  foundation: Record<string, number>;
  lossFactor: number;
  lineT: number;
  sag: number;
  thermal: boolean;
  tank: boolean;
}

const ID = 'joule-transformer';
const URL = `./#/sim/${ID}`;
const FOUNDATION_KEYS = [
  'liveStages',
  'liveRenderers',
  'liveComposers',
  'liveRenderTargets',
  'livePmrem',
  'liveMaterials',
  'liveTextures',
  'liveGeometries',
  'liveWorkers',
];
const norm = (s: string | null): string => (s ?? '').replace(/\u00A0/g, ' ').trim();
const debug = (page: Page): Promise<Debug> =>
  page.evaluate(
    (id) => (window as unknown as { __kersDebug: Record<string, () => Debug> }).__kersDebug[id]!(),
    ID,
  );
const foundation = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(
    () =>
      (
        window as unknown as { __kersDebug?: { render?: () => Record<string, number> } }
      ).__kersDebug?.render?.() ?? {},
  );
/** Sample only after a few drawn frames (scene created, prewarmed, first renders done). */
async function settled(page: Page): Promise<Debug> {
  await expect.poll(async () => (await debug(page)).scene?.frames ?? 0).toBeGreaterThan(3);
  return debug(page);
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

test('loads with canvas, shows the computed ÷100 gate, no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
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
  await expect(page.locator('.sim-note')).toContainText('catenaria');
  const d = await settled(page);
  expect(d.tier).toBe('base'); // SwiftShader → base by auto-detection
  expect(d.scene?.fluxLoops).toBeGreaterThan(0);
  expect(d.scene?.lit).toBe(20); // 9,99 MW delivered, 1 window per 0,5 MW
  await expect(page.locator('.r-label', { hasText: 'Linea AT' })).toContainText('50,0 A');
  await expect(page.locator('.r-label', { hasText: 'Centrale' })).toContainText('500 A');
  await expect(page.getByRole('button', { name: /Ripristina vista/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('sliders and toggles work by keyboard; a hot line sags more', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(URL);
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

  // thermal false colour: keyboard toggle shows the °C legend
  const toggle = page.getByRole('switch', { name: 'Mostra temperatura del conduttore' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('thermal-legend')).toBeVisible();
  await expect.poll(async () => (await debug(page)).thermal).toBe(true);
  // a low-voltage line (N₂ = 100 ⇒ V₂ = 20 kV, 10 MW ⇒ 500 A, 12,5 W/m) heats and sags
  await page.getByRole('button', { name: 'Reimposta' }).click();
  const n2Number = page.locator(`#${ID}-N2-number`);
  await n2Number.fill('100');
  await n2Number.press('Enter');
  await expect(page.getByTestId('V2')).toHaveText(/^20,0\s?kV$/);
  const sag0 = (await debug(page)).sag;
  await expect
    .poll(async () => (await debug(page)).lineT - 293.15, { timeout: 15_000 })
    .toBeGreaterThan(5);
  expect((await debug(page)).sag).toBeGreaterThan(sag0);
  const tank = page.getByRole('switch', { name: /cassa dell’olio/ });
  await tank.focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await debug(page)).tank).toBe(false);
});

test('quality "alta" via ?quality=: post-processing, shadows, IBL; no errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(`./?quality=alta#/sim/${ID}`);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1, { timeout: 30_000 });
  const d = await settled(page);
  expect(d.tier).toBe('alta');
  expect(d.scene?.post).toBe(true);
  expect(d.scene?.shadows).toBe(true);
  expect(d.scene?.ibl).toBe(true);
  expect(errors).toEqual([]);
});

test('no horizontal scroll at 1280 and 1920', async ({ page }) => {
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
  }
});

test('mount/unmount ×20 without leaks; fps measurement', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const first = await settled(page);
  for (let k = 0; k < 20; k++) {
    await page.evaluate(() => (location.hash = '#/teoria'));
    await expect(page.locator('.sim-scene')).toHaveCount(0);
    const fu = await foundation(page);
    for (const key of FOUNDATION_KEYS) expect(fu[key], key).toBe(0);
    await page.evaluate((id) => (location.hash = `#/sim/${id}`), ID);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  const last = await settled(page);
  process.stdout.write(
    `[${ID}] leak check first=${JSON.stringify(first.sceneStats)} ${JSON.stringify(first.scene?.memory)} last=${JSON.stringify(last.sceneStats)} ${JSON.stringify(last.scene?.memory)}\n`,
  );
  expect(last.mounted).toBe(1);
  expect(last.mountsTotal).toBe(first.mountsTotal + 20);
  expect(last.sceneStats).toEqual(first.sceneStats);
  for (const key of FOUNDATION_KEYS) expect(last.foundation[key], key).toBe(first.foundation[key]);
  expect(last.scene?.memory.geometries).toBe(first.scene?.memory.geometries);
  expect(last.scene?.memory.textures).toBe(first.scene?.memory.textures);
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
    await page.goto(URL);
    await page.locator('.sim-scene canvas').waitFor();
    await settled(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}
