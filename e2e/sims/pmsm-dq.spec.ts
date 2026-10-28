import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Sim `pmsm-dq` (Phase 4): load, displayed-value gates, keyboard, leak check, fps, axe. */

interface Dbg {
  liveMounts: number;
  canvases: number;
  renderer: { geometries: number; textures: number; programs: number } | null;
  mode: string;
  auto: boolean;
  t: number;
  steps: number;
  id: number;
  iq: number;
  idRef: number;
  iqRef: number;
  torque: number;
  pMech: number;
  pElec: number;
  pCu: number;
  vRatio: number;
  region: string;
  envelopeTorque: number;
  baseRpm: number;
  slowMotion: number;
}

const URL = './#/sim/pmsm-dq';

async function debug(page: Page): Promise<Dbg> {
  return page.evaluate(
    () =>
      (window as unknown as { __kersDebug?: Record<string, () => unknown> }).__kersDebug?.[
        'pmsm-dq'
      ]?.() as Dbg,
  );
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** "−1.234,5 kW" (Italian) → -1234.5 */
function parseIT(txt: string | null): number {
  const n =
    (txt ?? '')
      .replace(/\u00A0/g, ' ')
      .trim()
      .split(' ')[0] ?? '';
  return Number(n.replace(/\./g, '').replace(',', '.').replace('−', '-'));
}

async function readout(page: Page, key: string): Promise<number> {
  return parseIT(await page.locator(`.pm-readouts__value[data-key="${key}"]`).textContent());
}

test('loads without errors and the displayed values satisfy torque formula and power balance', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: /modello d-q/ })).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await expect(
    page
      .getByRole('note')
      .filter({ hasText: 'il tipo e i dati reali dell’MGU-K non sono pubblici' }),
  ).toBeVisible();
  await expect(page.locator('.sim-note')).toContainText(
    'Modello semplificato: modello d-q lineare, nessuna saturazione, perdite nel ferro trascurate, inverter ideale',
  );
  for (const id of [
    '16-pmsm-dq',
    '07-alternatore-corrente-alternata',
    '09-motore-elettrico-lorentz',
    '10-kers-mguk',
  ]) {
    await expect(page.locator(`.pm-theory-links a[href="#/teoria/${id}"]`)).toBeVisible();
  }
  await expect(page.getByTestId('pm-dq-plane')).toBeVisible();
  await page.waitForFunction(
    () =>
      ((
        window as unknown as { __kersDebug?: Record<string, () => { steps: number }> }
      ).__kersDebug?.['pmsm-dq']?.().steps ?? 0) > 120,
  );

  // Pause so the readouts and the debug state describe the same instant.
  await page.getByRole('button', { name: /Pausa/ }).click();
  await page.waitForTimeout(100);
  const d = await debug(page);
  expect(d.region).toBe('mtpa');
  // T = (3/2)·p·[ψ i_q + (Ld − Lq) i_d i_q] with the illustrative preset (p = 4, ψ = 0,08 Wb, ΔL = −0,15 mH)
  const tFormula = 1.5 * 4 * (0.08 * d.iq + (0.2e-3 - 0.35e-3) * d.id * d.iq);
  expect(Math.abs(d.torque - tFormula)).toBeLessThan(1e-9 * Math.abs(tFormula));
  expect(await readout(page, 'torque')).toBeCloseTo(d.torque, 1);
  const pM = await readout(page, 'pMech');
  const pE = await readout(page, 'pElec');
  const pC = await readout(page, 'pCu');
  expect(Math.abs(pE - pM - pC)).toBeLessThanOrEqual(0.011); // kW, display rounding
  expect(Math.abs(d.pElec - d.pMech - d.pCu) / d.pElec).toBeLessThan(1e-6);
  expect(d.torque).toBeLessThanOrEqual(d.envelopeTorque + 1e-6);
  expect(await page.locator('.pm-readouts__value[data-key="baseRpm"]').textContent()).toMatch(
    /^6\.?128\u00A0giri\/min$/,
  );

  // Braking: negative torque and power, battery receives power.
  await page.getByRole('button', { name: /Riprendi/ }).click();
  await page.getByText('Generatore (frenata)').click();
  await page.waitForFunction(() => {
    const g = (window as unknown as { __kersDebug?: Record<string, () => Dbg> }).__kersDebug?.[
      'pmsm-dq'
    ]?.();
    return !!g && g.mode === 'generator' && Math.abs(g.iq - g.iqRef) < 0.5;
  });
  const g = await debug(page);
  expect(g.torque).toBeLessThan(0);
  expect(g.pMech).toBeLessThan(0);
  expect(g.pElec).toBeLessThan(0);
  expect(-g.pElec).toBeLessThan(-g.pMech);
  expect(errors).toEqual([]);
});

test('sliders and toggles work by keyboard; high speed enters field weakening', async ({
  page,
}) => {
  await page.goto(URL);
  const speed = page.getByRole('slider', { name: 'Velocità del rotore n' });
  await speed.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await speed.inputValue())).toBe(4100);
  await page.keyboard.press('End');
  await expect.poll(async () => Number(await speed.inputValue())).toBe(20000);
  await expect(page.locator('.pm-readouts__region')).toContainText('Deflussaggio');
  const d = await debug(page);
  expect(d.region).toBe('field-weakening');
  expect(d.idRef).toBeLessThan(-200);
  // the numeric field shows Italian grouping and Enter keeps the value (QA-001)
  const field = speed
    .locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " slider ")][1]')
    .locator('input[inputmode=decimal]');
  await expect(field).toHaveValue('20.000');
  await field.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => Number(await speed.inputValue())).toBe(20000);

  const auto = page.getByRole('switch', { name: /MTPA automatico/ });
  await auto.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('slider', { name: 'Corrente asse d richiesta' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Corrente richiesta |I| (MTPA)' })).toBeHidden();

  const motor = page.getByRole('radio', { name: 'Motore (accelerazione)' });
  await motor.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Generatore (frenata)' })).toBeChecked();
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
  await page.goto(URL);
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  await page.waitForTimeout(300);
  const first = await debug(page);
  for (let k = 0; k < 20; k++) {
    await page.goto('./#/teoria');
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.goto(URL);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  await page.waitForTimeout(300);
  const last = await debug(page);
  expect(last.liveMounts).toBe(1);
  expect(last.canvases).toBe(1);
  expect(first.renderer).not.toBeNull();
  expect(last.renderer?.geometries).toBe(first.renderer?.geometries);
  expect(last.renderer?.textures).toBe(first.renderer?.textures);
  expect(last.renderer?.programs).toBe(first.renderer?.programs);
  // whole page: 1 WebGL canvas + the 4 uPlot canvases of this mount only
  expect(await page.locator('canvas').count()).toBe(5);
  expect(await page.locator('.pm-label').count()).toBe(10);
  expect(errors).toEqual([]);
  console.warn(
    `pmsm-dq leak check: first=${JSON.stringify(first.renderer)} last=${JSON.stringify(last.renderer)}`,
  );
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
  const stepRate = await page.evaluate(async () => {
    const get = (): number =>
      (
        window as unknown as { __kersDebug?: Record<string, () => { steps: number }> }
      ).__kersDebug?.['pmsm-dq']?.().steps ?? 0;
    const s0 = get();
    const w0 = performance.now();
    await new Promise((r) => setTimeout(r, 2000));
    return (get() - s0) / ((performance.now() - w0) / 1000);
  });
  console.warn(
    `pmsm-dq: rAF ${fps.toFixed(1)} fps, physics steps/s ${stepRate.toFixed(1)} (target 240)`,
  );
  expect(fps).toBeGreaterThan(5);
});

for (const theme of ['dark', 'light'] as const) {
  for (const mode of ['Motore (accelerazione)', 'Generatore (frenata)']) {
    test(`axe ${theme} ${mode}: no WCAG A/AA violations`, async ({ page }) => {
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
      // D9: zero violations of any impact (QA-021).
      expect(results.violations, summary.join('\n')).toEqual([]);
    });
  }
}
