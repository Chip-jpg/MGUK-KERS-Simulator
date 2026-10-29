import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sim `lenz` (A5). `?kersDebug` enables the read-only hook
 * `window.__kersDebug.lenz()` (live GPU-resource counters, mounts, frames).
 */
const URL = './?kersDebug#/sim/lenz';

interface LenzDebug {
  mounts: number;
  disposes: number;
  frames: number;
  live: { geometries: number; materials: number; textures: number; scenes: number };
  canvases: number;
  tier: string | null;
  render: {
    tier: string;
    post: boolean;
    fieldLines: number;
    inducedLines: number;
    threading: number;
  } | null;
}

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

const readDebug = (page: Page): Promise<LenzDebug> =>
  page.evaluate(
    () =>
      (window as unknown as { __kersDebug: Record<string, () => unknown> }).__kersDebug[
        'lenz'
      ]!() as LenzDebug,
  );

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** Sample the status data attributes for `ms` milliseconds. */
async function sampleStatus(page: Page, ms: number) {
  return page.evaluate(async (dur) => {
    const node = document.querySelector<HTMLElement>('[data-testid="lenz-status"]')!;
    const seen: Array<{ dir: string; face: string; force: string; motion: string; text: string }> =
      [];
    const t0 = performance.now();
    while (performance.now() - t0 < dur) {
      seen.push({
        dir: node.dataset['currentDir'] ?? '',
        face: node.dataset['facePole'] ?? '',
        force: node.dataset['force'] ?? '',
        motion: node.dataset['motion'] ?? '',
        text: node.textContent ?? '',
      });
      await new Promise((r) => setTimeout(r, 50));
    }
    return seen;
  }, ms);
}

test('loads without console errors, canvas present, default N approaching', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Legge di Lenz' })).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.locator('.sim-note')).toContainText('Modello semplificato');
  await expect(page.locator('.plot')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Ripristina vista/ })).toBeVisible();
  // SwiftShader → quality tier "base"; magnet and induced field lines are traced.
  const d = await readDebug(page);
  expect(d.tier).toBe('base');
  expect(d.render?.post).toBe(false);
  await expect.poll(async () => (await readDebug(page)).render?.fieldLines ?? 0).toBeGreaterThan(8);
  await expect
    .poll(async () => (await readDebug(page)).render?.inducedLines ?? 0)
    .toBeGreaterThan(8);
  await expect(page.locator('[data-testid="lenz-status"]')).toHaveAttribute(
    'data-current-dir',
    'antiorario',
    { timeout: 5000 },
  );
  expect(errors).toEqual([]);
});

const CASES = [
  { pole: 'Polo N', motion: 'Avvicina', dir: 'antiorario', face: 'N', force: 'repulsiva' },
  { pole: 'Polo N', motion: 'Allontana', dir: 'orario', face: 'S', force: 'attrattiva' },
  { pole: 'Polo S', motion: 'Avvicina', dir: 'orario', face: 'S', force: 'repulsiva' },
  { pole: 'Polo S', motion: 'Allontana', dir: 'antiorario', face: 'N', force: 'attrattiva' },
] as const;

test('gate: displayed current direction for the 4 cases matches slide 11', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(URL);
  // 0,2 m/s: a move phase of 0,9 s in a 1,9 s cycle, so each 3 s sample window
  // contains a whole move phase even when software GL is saturated.
  const v = page.locator('#lenz-v-number');
  await v.fill('0,2');
  await v.press('Enter');
  for (const c of CASES) {
    await page.locator('label.segmented__label', { hasText: c.pole }).click();
    await page.locator('label.segmented__label', { hasText: c.motion }).click();
    await expect(page.getByRole('radio', { name: c.pole, exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: c.motion, exact: true })).toBeChecked();
    const seen = await sampleStatus(page, 3000);
    const moving = seen.filter((s) => s.dir !== 'nessuna');
    expect(moving.length, `${c.pole} ${c.motion}`).toBeGreaterThan(3);
    for (const s of moving) {
      expect(s.dir, `${c.pole} ${c.motion}`).toBe(c.dir);
      expect(s.face).toBe(c.face);
      expect(s.force).toBe(c.force);
      expect(s.motion).toBe(c.motion === 'Avvicina' ? 'avvicina' : 'allontana');
      expect(s.text).toContain(
        `Il polo affacciato della bobina è ${c.face} → si oppone ${
          c.motion === 'Avvicina' ? 'all’avvicinamento' : 'all’allontanamento'
        }`,
      );
    }
  }
  expect(errors).toEqual([]);
});

test('sliders and scene work by keyboard', async ({ page }) => {
  await page.goto(URL);
  const range = page.locator('#lenz-N-range');
  await range.focus();
  const before = Number(await range.inputValue());
  await page.keyboard.press('ArrowRight');
  expect(Number(await range.inputValue())).toBe(before + 1);
  // Slow magnet (0,1 m/s): the keyboard move below lasts ≈ 1,8 s, well inside the
  // sample window even when software GL is saturated by parallel workers.
  const v = page.locator('#lenz-v-number');
  await v.fill('0,1');
  await v.press('Enter');

  // Pause, then move the magnet with the keyboard (switches to manual mode).
  await page.getByRole('button', { name: 'Pausa' }).click();
  const canvas = page.locator('.sim-scene canvas');
  await canvas.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('radio', { name: 'Manuale (trascina)' })).toBeChecked();
  await page.getByRole('button', { name: 'Riprendi' }).click();
  await expect(canvas).toHaveAttribute('aria-valuenow', '25.0', { timeout: 15_000 });
  // At rest: no current.
  await expect(page.locator('[data-testid="lenz-status"]')).toHaveAttribute(
    'data-current-dir',
    'nessuna',
  );
  // Move toward the coil with ← (N facing ⇒ counter-clockwise while moving).
  await canvas.focus();
  const seenP = sampleStatus(page, 3000);
  for (let k = 0; k < 4; k++) await page.keyboard.press('Shift+ArrowLeft');
  const seen = await seenP;
  expect(seen.some((s) => s.dir === 'antiorario')).toBe(true);
  expect(seen.every((s) => s.dir !== 'orario')).toBe(true);
});

test('mount/unmount ×20 without leaking GPU resources; fps sample', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const first = await readDebug(page);

  for (let k = 0; k < 20; k++) {
    await page.evaluate(() => (location.hash = '#/teoria'));
    await expect(page.locator('.sim-scene canvas')).toHaveCount(0);
    // Render-foundation counters (stage, kit materials, field lines, workers…) back to 0.
    const fu = await foundation(page);
    for (const key of FOUNDATION_KEYS) expect(fu[key], key).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __kersDebug?: Record<string, unknown> }).__kersDebug?.['lenz'],
      ),
    ).toBeUndefined();
    await page.evaluate(() => (location.hash = '#/sim/lenz'));
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  const after = await readDebug(page);
  expect(after.mounts - after.disposes).toBe(1);
  expect(after.mounts).toBe(first.mounts + 20);
  expect(after.live).toEqual(first.live);
  expect(after.live.scenes).toBe(1);
  expect((await foundation(page))['liveStages']).toBe(1);
  expect(after.canvases).toBe(1);

  // fps: render calls of the sim loop over 3 s (capped at 60 by createLoop).
  const f0 = (await readDebug(page)).frames;
  await page.waitForTimeout(3000);
  const f1 = (await readDebug(page)).frames;
  const fps = (f1 - f0) / 3;
  test.info().annotations.push({ type: 'fps (headless SwiftShader)', description: fps.toFixed(1) });
  process.stdout.write(`lenz fps (headless, software GL): ${fps.toFixed(1)}\n`);
  expect(fps).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('physics gate: more magnet field lines thread the coil when the magnet is near (Φ grows)', async ({
  page,
}) => {
  await page.goto(URL);
  const canvas = page.locator('.sim-scene canvas');
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => (await readDebug(page)).render?.fieldLines ?? 0).toBeGreaterThan(8);
  await canvas.focus();
  await page.keyboard.press('End'); // farthest position (manual mode)
  await expect(canvas).toHaveAttribute('aria-valuenow', '25.0', { timeout: 10_000 });
  const far = (await readDebug(page)).render?.threading ?? -1;
  await page.keyboard.press('Home'); // nearest position
  await expect(canvas).toHaveAttribute('aria-valuenow', '7.0', { timeout: 10_000 });
  const near = (await readDebug(page)).render?.threading ?? -1;
  expect(near).toBeGreaterThan(far + 2);
});

test('quality "alta" via ?quality=: post-processing on, no console errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('./?quality=alta&kersDebug#/sim/lenz');
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(async () => (await readDebug(page)).tier, { timeout: 30_000 }).toBe('alta');
  expect((await readDebug(page)).render?.post).toBe(true);
  await page.locator('label.segmented__label', { hasText: 'Polo S' }).click();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe ${theme}: zero WCAG 2.1 A/AA violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Pausa' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
    );
    expect(results.violations, summary.join('\n')).toEqual([]);
  });
}
