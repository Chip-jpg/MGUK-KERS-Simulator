import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Sim `alternator-motor` (A6): load, gate values, keyboard, leak check, fps. */

interface Dbg {
  liveMounts: number;
  canvases: number;
  renderer: { tier: string; post: boolean; fieldLines: number } | null;
  tier?: string | null;
  scene?: { liveScenes: number; liveGeometries: number; liveMaterials: number };
  foundation?: Record<string, number>;
  mode?: string;
  t?: number;
  omega?: number;
  relError?: number;
  input?: number;
}

const URL = './#/sim/alternator-motor';

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

/** Render-foundation counters (module singleton, readable after an unmount). */
const foundation = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(
    () =>
      (
        window as unknown as { __kersDebug?: { render?: () => Record<string, number> } }
      ).__kersDebug?.render?.() ?? {},
  );

async function debug(page: Page): Promise<Dbg> {
  return page.evaluate(
    () =>
      (window as unknown as { __kersDebug?: Record<string, () => unknown> }).__kersDebug?.[
        'alternator-motor'
      ]?.() as Dbg,
  );
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** "1,9·10⁻⁹" → 1.9e-9 */
function parseBalance(txt: string): number {
  if (txt.trim() === '0') return 0;
  const m = /^([\d,]+)·10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/u.exec(txt.trim());
  if (!m) return Number.NaN;
  const exp = [...(m[2] as string)].map((c) => '-0123456789'['⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)]).join('');
  return Number((m[1] as string).replace(',', '.')) * 10 ** Number(exp);
}

test('loads without console errors, shows canvas, note, readouts and passes the energy gate', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: /Alternatore/ })).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(
    page.getByRole('note').filter({ hasText: 'trifase, generalmente descritta come sincrona' }),
  ).toBeVisible();
  // QA-006: theory 07 and 09 are linked from the panel, not only 10 from the header.
  for (const id of ['07-alternatore-corrente-alternata', '09-motore-elettrico-lorentz']) {
    await expect(page.locator(`.am-theory-links a[href="#/teoria/${id}"]`)).toBeVisible();
  }
  await expect(page.locator('.sim-note')).toContainText('Modello semplificato');
  await expect(page.getByRole('button', { name: /Ripristina vista/ })).toBeVisible();
  // SwiftShader → tier "base"; the gap field lines are traced.
  await expect.poll(async () => (await debug(page)).tier).toBe('base');
  await expect.poll(async () => (await debug(page)).renderer?.fieldLines ?? 0).toBeGreaterThan(8);
  await expect(page.getByTestId('am-energy-flow')).toContainText(
    'Energia cinetica → energia elettrica → batteria (+ calore Joule)',
  );

  // let the generator brake for a while, then check the displayed bookkeeping
  await page.waitForFunction(
    () =>
      ((window as unknown as { __kersDebug?: Record<string, () => { t: number }> }).__kersDebug?.[
        'alternator-motor'
      ]?.().t ?? 0) > 2,
  );
  const shown = parseBalance(
    (await page.locator('.am-readouts__value[data-key="balance"]').textContent()) ?? '',
  );
  expect(shown).toBeLessThan(1e-6);
  const d = await debug(page);
  expect(d.relError ?? 1).toBeLessThan(1e-6);
  expect(d.input ?? 0).toBeGreaterThan(1); // joules actually converted
  expect(d.omega ?? 99).toBeLessThan(30); // rotor slowed down (Lenz braking)

  // switch to motor mode
  await page.getByText('Motore (accelerazione)').click();
  await expect(page.getByTestId('am-energy-flow')).toContainText(
    'Batteria → energia elettrica → energia meccanica (+ calore Joule)',
  );
  await page.waitForFunction(
    () =>
      ((
        window as unknown as {
          __kersDebug?: Record<string, () => { t: number; mode: string }>;
        }
      ).__kersDebug?.['alternator-motor']?.().t ?? 0) > 2,
  );
  const dm = await debug(page);
  expect(dm.mode).toBe('motor');
  expect(dm.omega ?? 0).toBeGreaterThan(5); // the motor accelerated
  expect(dm.relError ?? 1).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});

test('sliders and mode toggle work by keyboard', async ({ page }) => {
  await page.goto(URL);
  const b = page.getByRole('slider', { name: 'Campo magnetico B' });
  await b.focus();
  const before = Number(await b.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await b.inputValue())).toBeCloseTo(before + 0.05, 6);
  await page.keyboard.press('Home');
  await expect.poll(async () => Number(await b.inputValue())).toBeCloseTo(0.2, 6);

  const gen = page.getByRole('radio', { name: 'Generatore (frenata)' });
  await gen.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Motore (accelerazione)' })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Tensione di picco batteria Vₛ' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Velocità iniziale ω₀' })).toBeHidden();
});

test('mount/unmount ×20 does not leak canvases, mounts or GPU objects', async ({ page }) => {
  test.setTimeout(180_000); // 20 navigations under software GL
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect.poll(async () => (await debug(page))?.renderer).not.toBeNull();
  const first = await debug(page);
  for (let k = 0; k < 20; k++) {
    await page.evaluate(() => (location.hash = '#/teoria'));
    await expect(page.locator('canvas')).toHaveCount(0);
    // every foundation resource (stage, composer, kit materials, ribbons, flows…) released
    const fu = await foundation(page);
    for (const key of FOUNDATION_KEYS) expect(fu[key], key).toBe(0);
    await page.evaluate(() => (location.hash = '#/sim/alternator-motor'));
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await expect.poll(async () => (await debug(page))?.renderer).not.toBeNull();
  }
  await page.waitForTimeout(300);
  const last = await debug(page);
  expect(last.liveMounts).toBe(1);
  expect(last.canvases).toBe(1);
  // the scene's own geometries/materials do not grow from mount to mount
  expect(last.scene).toEqual(first.scene);
  expect(last.scene?.liveScenes).toBe(1);
  expect(last.foundation?.['liveStages']).toBe(1);
  expect(last.foundation?.['liveMaterials']).toBe(first.foundation?.['liveMaterials']);
  expect(last.foundation?.['liveGeometries']).toBe(first.foundation?.['liveGeometries']);
  // whole page: 1 WebGL canvas + the 2 uPlot canvases of this mount only
  expect(await page.locator('canvas').count()).toBe(3);
  expect(errors).toEqual([]);
});

test('quality "alta" via ?quality=: post-processing on, both modes, no console errors', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('./?quality=alta#/sim/alternator-motor');
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(async () => (await debug(page))?.tier, { timeout: 30_000 }).toBe('alta');
  expect((await debug(page)).renderer?.post).toBe(true);
  await page.getByText('Motore (accelerazione)').click();
  await page.waitForTimeout(800);
  expect((await debug(page)).mode).toBe('motor');
  expect(errors).toEqual([]);
});

test('fps measurement (headless SwiftShader: informative only)', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await page.waitForTimeout(500);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (): void => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else resolve((n * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      }),
  );
  const simRate = await page.evaluate(async () => {
    const get = (): number =>
      (window as unknown as { __kersDebug?: Record<string, () => { t: number }> }).__kersDebug?.[
        'alternator-motor'
      ]?.().t ?? 0;
    const t0 = get();
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, 2000));
    return (get() - t0) / ((performance.now() - w0) / 1000);
  });
  console.warn(
    `alternator-motor: rAF ${fps.toFixed(1)} fps, simulated/real time ${simRate.toFixed(3)}`,
  );
  expect(fps).toBeGreaterThan(5);
});

for (const theme of ['dark', 'light'] as const) {
  for (const mode of ['Generatore (frenata)', 'Motore (accelerazione)']) {
    test(`axe ${theme} ${mode}: no serious/critical WCAG A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(URL);
      await page.getByRole('radio', { name: mode }).check();
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map(
        (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
      );
      if (summary.length) console.warn(`[axe ${theme} ${mode}]\n  ${summary.join('\n  ')}`);
      expect(results.violations, summary.join('\n')).toEqual([]);
    });
  }
}
