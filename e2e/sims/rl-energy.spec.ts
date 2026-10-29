import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** E2E for the `rl-energy` simulator (A8; render foundation since V3). */

interface Debug {
  mounted: number;
  mountsTotal: number;
  tier: string | null;
  scene: {
    post: boolean;
    shadows: boolean;
    ibl: boolean;
    memory: { geometries: number; textures: number };
    fieldLines: number;
    linesShown: number;
    blade: number;
    cells: number;
    frames: number;
  } | null;
  sceneStats: Record<string, number>;
  foundation: Record<string, number>;
  t: number;
  tau: number;
  i: number;
  T: number;
  closed: boolean;
  tauRatio: number;
  balance: { gen: number; joule: number; field: number; relError: number };
}

const ID = 'rl-energy';
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
const debug = (page: Page): Promise<Debug> =>
  page.evaluate(
    (id) => (window as unknown as { __kersDebug: Record<string, () => Debug> }).__kersDebug[id]!(),
    ID,
  );
const seek = (page: Page, t: number): Promise<void> =>
  page.evaluate(
    ([id, tt]) =>
      (window as unknown as { __kersDebug: Record<string, () => { seek(t: number): void }> })
        .__kersDebug[id as string]!().seek(tt as number),
    [ID, t] as const,
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
  // the field lines are traced once on mount (main thread or worker)
  await expect.poll(async () => (await debug(page)).scene?.fieldLines ?? 0).toBeGreaterThan(0);
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

test('loads with canvas, shows i(τ) = 63,2 %, transient + energy balance', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Autoinduzione, circuito RL, energia' }),
  ).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.getByTestId('tau-ratio')).toHaveText(/^63,2\s%$/);
  await expect(page.locator('.rl-tau')).toHaveText(/i\(τ\) = 63,2\s% di I₀/);
  expect(Math.abs((await debug(page)).tauRatio - 0.632)).toBeLessThan(1e-3);
  await expect(page.locator('.plot')).toHaveCount(3);
  // QA-017: before the switch closes the energy plot shows a hint, not empty axes.
  await expect(page.getByTestId('energy-hint')).toHaveText(
    'Chiudi l’interruttore per avviare il transitorio',
  );
  const d0 = await settled(page);
  expect(d0.tier).toBe('base');
  expect(d0.scene?.linesShown).toBe(0); // i = 0: no field lines
  expect(d0.scene?.cells).toBe(8); // 12 V = 8 × 1,5 V

  await page.getByRole('button', { name: 'Chiudi interruttore' }).click();
  await expect(page.getByRole('button', { name: 'Apri e azzera' })).toBeVisible();
  await expect(page.getByTestId('energy-hint')).toBeHidden();
  // The transient (6τ) is played in ≈ 7 s; wait until t > τ.
  await expect.poll(async () => (await debug(page)).t, { timeout: 10_000 }).toBeGreaterThan(0.05);
  const d = await debug(page);
  expect(d.i).toBeGreaterThan(0);
  expect(d.balance.relError).toBeLessThan(1e-6);
  await expect(page.getByTestId('balance')).toContainText('✓');
  await expect.poll(async () => (await debug(page)).scene?.blade ?? 1).toBe(0); // blade closed
  expect(errors).toEqual([]);
});

test('GATE: field lines grow with i(t) — none at 0, 63,2 % of steady state at τ', async ({
  page,
}) => {
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const d0 = await settled(page);
  const n = d0.scene?.fieldLines ?? 0;
  await seek(page, d0.tau);
  const a = await debug(page);
  expect(a.t).toBeCloseTo(a.tau, 9);
  expect(a.i / 3).toBeCloseTo(1 - Math.exp(-1), 6); // E/R = 3 A
  await expect(page.locator('.r-label', { hasText: 'f.e.m. autoindotta' })).toBeVisible();
  const atTau = (await debug(page)).scene?.linesShown ?? 0;
  await seek(page, 5 * d0.tau);
  const b = await debug(page);
  expect(b.balance.relError).toBeLessThan(1e-6);
  const at5 = b.scene?.linesShown ?? 0;
  // lines ∝ i / I_ref (I_ref = 5 A): ⌈0,379·n⌉ at τ, ⌈0,596·n⌉ at 5τ
  expect(atTau).toBe(Math.ceil((a.i / 5) * n - 1e-9));
  expect(at5).toBe(Math.ceil((b.i / 5) * n - 1e-9));
  expect(at5).toBeGreaterThan(atTau);
  expect(b.T).toBeGreaterThan(a.T); // the resistor wire warms up with R·i²
});

test('sliders work by keyboard; solenoid toggle computes L; thermal overlay', async ({ page }) => {
  await page.goto(URL);
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
  const toggle = page.getByRole('switch', { name: 'Mostra temperatura del resistore' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('thermal-legend')).toBeVisible();
  // switch by keyboard
  const sw = page.getByRole('button', { name: 'Chiudi interruttore' });
  await sw.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Apri e azzera' })).toBeVisible();
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
  await seek(page, 0.05);
  await page.waitForTimeout(300);
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
    await page.goto(URL);
    await page.locator('.sim-scene canvas').waitFor();
    await settled(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}
