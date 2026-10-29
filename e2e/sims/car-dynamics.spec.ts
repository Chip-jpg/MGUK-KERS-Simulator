import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Sim `car-dynamics` (Phase 4): load, displayed-value gates, keyboard, leak check, fps, axe. */

interface Dbg {
  liveMounts: number;
  canvases: number;
  renderer: {
    memory: { geometries: number; textures: number };
    programs: number;
    frames: number;
    post: boolean;
    shadows: boolean;
    ibl: boolean;
  } | null;
  tier: string | null;
  discs: { tFront: number; tRear: number; startC: number };
  foundation: Record<string, number>;
  car: Record<string, number>;
  frames: number;
  simT: number;
  aero: boolean;
  params: { Pmax: number; balance: number; v1: number; v2: number };
  tBrake: number;
  distance: number;
  dEk: number;
  eMguk: number;
  eStored: number;
  eMgukLoss: number;
  eBrakesFront: number;
  eBrakesRear: number;
  eAero: number;
  balanceError: number;
  compareRecovered: number | null;
  compareDistance: number | null;
}

const URL = './#/sim/car-dynamics';

async function debug(page: Page): Promise<Dbg> {
  return page.evaluate(
    () =>
      (window as unknown as { __kersDebug?: Record<string, () => unknown> }).__kersDebug?.[
        'car-dynamics'
      ]?.() as Dbg,
  );
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** "1.234,5 MJ" (Italian) → 1234.5 */
function parseIT(txt: string | null): number {
  const n =
    (txt ?? '')
      .replace(/\u00A0/g, ' ')
      .trim()
      .split(' ')[0] ?? '';
  return Number(n.replace(/\./g, '').replace(',', '.').replace('−', '-'));
}

async function out(page: Page, key: string): Promise<number> {
  return parseIT(await page.locator(`[data-out="${key}"]`).textContent());
}

test('loads without errors; displayed energies add up and match the physics', async ({ page }) => {
  const errors = collectErrors(page);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto(URL);
  await expect(
    page.getByRole('heading', { level: 1, name: /frenata combinata MGU-K \+ freni/ }),
  ).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.locator('.sim-note')).toContainText(
    'Modello semplificato: vettura puntiforme con trasferimento di carico longitudinale, pneumatici Pacejka semplificati al picco di aderenza (ABS ideale), MGU-K solo sull’asse posteriore, parametri illustrativi.',
  );
  await expect(page.locator('.cd-links a[href="#/teoria/15-dinamica-frenata"]')).toBeVisible();

  const d = await debug(page);
  expect(Math.abs(d.balanceError)).toBeLessThan(1e-6);
  expect(d.eStored).toBeLessThanOrEqual(120e3 * d.tBrake * (1 + 1e-9));
  expect(await out(page, 'dEk')).toBeCloseTo(d.dEk / 1e6, 2);
  expect(await out(page, 'dEk')).toBe(2.47);
  expect(await out(page, 'time')).toBe(1.83);
  expect(await out(page, 'distance')).toBeCloseTo(d.distance, 1);
  expect(await out(page, 'stored')).toBe(0.22);
  expect(await out(page, 'cStored')).toBe(0.22);
  const parts = await Promise.all(
    ['stored', 'loss', 'brakesFront', 'brakesRear', 'aero'].map((k) => out(page, k)),
  );
  expect(Math.abs(parts.reduce((a, b) => a + b, 0) - 2.47)).toBeLessThanOrEqual(0.03);

  // 2026 preset: rear-axle limit ⇒ less than the constant-deceleration model
  await page.locator('button[data-preset="2026"]').click();
  await expect(page.locator('[data-out="stored"]')).toHaveText('0,55 MJ');
  await expect(page.locator('[data-out="cStored"]')).toHaveText('0,64 MJ');
  const d26 = await debug(page);
  expect(d26.params.Pmax).toBe(350);
  expect(d26.eStored).toBeLessThan(d26.compareRecovered ?? 0);

  // the playback runs and the HUD shows the limits
  await page.waitForFunction(
    () =>
      ((
        window as unknown as { __kersDebug?: Record<string, () => { simT: number }> }
      ).__kersDebug?.['car-dynamics']?.().simT ?? 0) > 0.3,
  );
  await expect(page.locator('.cd-hud')).toContainText('MGU-K limitata da');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('sliders, toggle and buttons work by keyboard', async ({ page }) => {
  await page.goto(URL);
  const pmax = page.getByRole('slider', { name: 'Potenza massima MGU-K Pₘₐₓ (elettrica)' });
  await pmax.focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => (await debug(page)).params.Pmax).toBe(0);
  await expect(page.locator('[data-out="stored"]')).toHaveText('0,00 MJ');
  expect((await debug(page)).eMguk).toBe(0);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await debug(page)).params.Pmax).toBe(1);

  const aero = page.getByRole('switch', { name: /Aerodinamica/ });
  await aero.focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await debug(page)).aero).toBe(false);
  await expect(page.getByRole('slider', { name: 'Deportanza Cz·A' })).toBeDisabled();
  expect((await debug(page)).eAero).toBe(0);
  await expect(page.locator('[data-out="time"]')).toHaveText('3,56 s');

  const balance = page.getByRole('slider', { name: 'Ripartizione di frenata (quota anteriore)' });
  await balance.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await debug(page)).params.balance).toBe(80);
  await page.getByRole('button', { name: 'Ripartizione ideale' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await debug(page)).params.balance).toBe(58);

  // Italian number field: typed "250" + Enter
  const field = page
    .getByRole('slider', { name: 'Velocità iniziale v₁' })
    .locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " slider ")][1]')
    .locator('input[inputmode=decimal]');
  await field.fill('250');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await debug(page)).params.v1).toBe(250);

  const speed = page.getByRole('radio', { name: '×0,25' });
  await speed.focus();
  await page.keyboard.press('Space');
  await expect(speed).toBeChecked();
});

test('no horizontal scroll at 1280×720 in both themes', async ({ page }) => {
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBe(0);
  }
});

test('mount/unmount ×20 does not leak canvases, mounts or GPU objects', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  // Sample only once the scene has drawn a few frames (lazy chunk + first renders done).
  const settled = async (): Promise<Dbg> => {
    await expect.poll(async () => (await debug(page))?.renderer?.frames ?? 0).toBeGreaterThan(3);
    return debug(page);
  };
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const first = await settled();
  for (let k = 0; k < 20; k++) {
    await page.goto('./#/teoria');
    await expect(page.locator('canvas')).toHaveCount(0);
    const fu = await page.evaluate(
      () =>
        (
          window as unknown as { __kersDebug?: { render?: () => Record<string, number> } }
        ).__kersDebug?.render?.() ?? {},
    );
    for (const key of [
      'liveStages',
      'liveRenderers',
      'liveComposers',
      'liveRenderTargets',
      'livePmrem',
      'liveMaterials',
      'liveTextures',
      'liveGeometries',
      'liveWorkers',
    ])
      expect(fu[key], key).toBe(0);
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  const last = await settled();
  expect(last.liveMounts).toBe(1);
  expect(last.canvases).toBe(1);
  expect(first.renderer).not.toBeNull();
  expect(last.renderer?.memory.geometries).toBe(first.renderer?.memory.geometries);
  expect(last.renderer?.memory.textures).toBe(first.renderer?.memory.textures);
  expect(last.renderer?.programs).toBe(first.renderer?.programs);
  for (const key of ['liveCars', 'liveGeometries', 'liveMaterials', 'liveTextures'])
    expect(last.car[key], key).toBe(first.car[key]);
  expect(last.car['liveCars']).toBe(1);
  expect(last.foundation['liveStages']).toBe(1);
  // whole page: 1 WebGL canvas + the 3 uPlot canvases of this mount only
  expect(await page.locator('canvas').count()).toBe(4);
  expect(await page.locator('.cd-balance').count()).toBe(1);
  expect(errors).toEqual([]);
  console.warn(
    `car-dynamics leak check: first=${JSON.stringify(first.renderer)} last=${JSON.stringify(last.renderer)}`,
  );
});

test('GATE: per-axle disc temperatures follow the friction-brake energy (≈ E/C)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Ripristina vista/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pausa' }).click();
  // mid-zone: the limiting axle and the force arrows are labelled
  await page.evaluate(() =>
    (
      window as unknown as { __kersDebug: Record<string, () => { seek(t: number): void }> }
    ).__kersDebug['car-dynamics']?.().seek(0.6),
  );
  await expect(page.locator('.r-label', { hasText: 'al limite' })).toBeVisible();
  await expect(page.locator('.r-label', { hasText: /^Fx ant\. / })).toBeVisible();
  const d = await page.evaluate(() => {
    const f = (
      window as unknown as { __kersDebug: Record<string, () => Dbg & { seek(t: number): void }> }
    ).__kersDebug['car-dynamics'];
    const x = f?.();
    x?.seek(x.tBrake);
    return f?.();
  });
  expect(d?.tier).toBe('base');
  const T0 = 300 + 273.15;
  // one disc per side: half of the axle's friction-brake energy; C = m·c (1,2 / 0,9 kg · 1400)
  for (const [T, E, C] of [
    [d!.discs.tFront, d!.eBrakesFront / 2, 1.2 * 1400],
    [d!.discs.tRear, d!.eBrakesRear / 2, 0.9 * 1400],
  ] as const) {
    const rise = E / C;
    expect(T - T0).toBeLessThan(rise);
    expect((T - T0) / rise).toBeGreaterThan(0.93);
  }
  await expect(page.locator('.cd-legend-scene')).toContainText('scala logaritmica');
  expect(errors).toEqual([]);
});

test('quality "alta" via ?quality=: post-processing, shadows, IBL; no errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('./?quality=alta#/sim/car-dynamics');
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(async () => (await debug(page)).tier, { timeout: 30_000 }).toBe('alta');
  const r = (await debug(page)).renderer;
  expect(r?.post).toBe(true);
  expect(r?.shadows).toBe(true);
  expect(r?.ibl).toBe(true);
  await page.waitForTimeout(500);
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
  const drawRate = await page.evaluate(async () => {
    const get = (): number =>
      (
        window as unknown as { __kersDebug?: Record<string, () => { frames: number }> }
      ).__kersDebug?.['car-dynamics']?.().frames ?? 0;
    const f0 = get();
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, 2000));
    return (get() - f0) / ((performance.now() - w0) / 1000);
  });
  console.warn(
    `car-dynamics: rAF ${fps.toFixed(1)} fps, scene draws/s ${drawRate.toFixed(1)} (cap 60)`,
  );
  expect(fps).toBeGreaterThan(5);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe ${theme}: no WCAG A/AA violations`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await page.locator('.cd-fixed summary').click();
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
    );
    if (summary.length) console.warn(`[axe ${theme}]\n  ${summary.join('\n  ')}`);
    // D9: zero violations of any impact (QA-021).
    expect(results.violations, summary.join('\n')).toEqual([]);
  });
}
