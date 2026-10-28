import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** E2E for the Phase 4 `field-biot-savart` simulator. */

interface Debug {
  mounted: number;
  workers: number;
  service: 'worker' | 'main-thread';
  renderers: number;
  geometries: number;
  materials: number;
  info: { geometries: number; textures: number; programs: number; lines: number } | null;
  geometry: string;
  busy: boolean;
  job: number;
  lineCount: number;
  linesDone: number;
  lastJobMs: number;
  maxMainThreadMs: number;
  bCentre: number | null;
  bRef: number;
}

const ID = 'field-biot-savart';
const debug = (page: Page): Promise<Debug> =>
  page.evaluate(
    (id) => (window as unknown as { __kersDebug: Record<string, () => Debug> }).__kersDebug[id]!(),
    ID,
  );
/** Waits until the sim is mounted (hook present) and the last field job has finished. */
const settled = async (page: Page): Promise<Debug> => {
  await expect
    .poll(
      async () => {
        const d = await page.evaluate(
          (id) =>
            (window as unknown as { __kersDebug?: Record<string, () => Debug> }).__kersDebug?.[
              id
            ]?.() ?? null,
          ID,
        );
        return d !== null && !d.busy && d.linesDone === d.lineCount && d.lineCount > 0;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return debug(page);
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test('loads with canvas; Web Worker traces the lines; readouts match the ideal solenoid', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) requests.push(r.url());
  });
  await page.goto(`./#/sim/${ID}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Campo magnetico di bobine reali (Biot-Savart)',
    }),
  ).toBeVisible();
  await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  const d = await settled(page);
  expect(d.service).toBe('worker');
  expect(d.workers).toBe(1);
  expect(d.info?.lines).toBe(12);
  // μ₀NI/l = 4π·10⁻⁷·40·5/0,3 T
  await expect(page.getByTestId('b-ref')).toHaveText(/^0,8378\smT$/);
  await expect(page.getByTestId('b-centre')).toHaveText(/^0,8[0-3]\d\d\smT$/);
  await expect(page.getByTestId('b-diff')).toHaveText(/^-[12],\d\d\s%$/);
  expect(Math.abs((d.bCentre ?? 0) - d.bRef) / d.bRef).toBeLessThan(0.025);
  await expect(page.getByTestId('field-status')).toContainText('Web Worker');
  await expect(page.locator('.sim-note')).toContainText(
    'Modello semplificato: conduttore filiforme, corrente stazionaria, nessun materiale ferromagnetico; linee di campo calcolate numericamente (RK4).',
  );
  await expect(page.locator('.formula-panel .chip--slide')).toHaveText(
    ['Slide 14', 'Slide 7', 'Slide 14'].map((s) => new RegExp(s)),
  );
  // The main thread only uploads finished buffers (no Biot-Savart sums there). Alone the
  // slowest handler takes ≈ 2–4 ms here; the bound is loose because wall-clock time also
  // counts preemption when several headless browsers share the CPU.
  expect(d.maxMainThreadMs).toBeLessThan(50);
  console.warn(
    `[${ID}] worker job ${d.lastJobMs.toFixed(0)} ms; max main-thread handler ${d.maxMainThreadMs.toFixed(2)} ms`,
  );

  // compare with the ideal solenoid
  await page.getByText('Confronta con il solenoide ideale', { exact: true }).click();
  await expect(page.getByTestId('plot-note')).toContainText('Agli estremi');
  await page.screenshot({ path: test.info().outputPath('field-biot-savart.png') });

  // no horizontal scroll at 1280×720
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('geometry switch and sliders by keyboard recompute the field', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`./#/sim/${ID}`);
  await settled(page);
  await page.getByText('Spira singola', { exact: true }).click();
  await expect(page.locator(`#${ID}-l-range`)).toBeDisabled();
  let d = await settled(page);
  expect(d.geometry).toBe('loop');
  // N = 40, I = 5 A, R = 3 cm ⇒ μ₀NI/(2R) = 4,1888 mT
  await expect(page.getByTestId('b-ref')).toHaveText(/^4,1888\smT$/);
  expect(Math.abs((d.bCentre ?? 0) - d.bRef) / d.bRef).toBeLessThan(0.005);

  const slider = page.locator(`#${ID}-I-range`);
  await slider.focus();
  await slider.press('ArrowRight'); // 5 → 5,5 A
  await expect(page.locator(`#${ID}-I-number`)).toHaveValue('5,5');
  await expect(page.getByTestId('b-ref')).toHaveText(/^4,6077\smT$/);
  d = await settled(page);
  expect(Math.abs((d.bCentre ?? 0) - d.bRef) / d.bRef).toBeLessThan(0.005);

  await page.getByText('Bobine di Helmholtz', { exact: true }).click();
  d = await settled(page);
  expect(d.geometry).toBe('helmholtz');
  expect(Math.abs((d.bCentre ?? 0) - d.bRef) / d.bRef).toBeLessThan(0.005);
  const lines = page.locator(`#${ID}-lines-range`);
  await lines.focus();
  await lines.press('End');
  d = await settled(page);
  expect(d.lineCount).toBe(24);
  expect(d.info?.lines).toBe(24);
  await page.getByText('Mostra frecce del campo').click();
  expect(errors).toEqual([]);
});

test('mount/unmount ×20 without leaks (worker terminated); fps measurement', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto(`./#/sim/${ID}`);
  const first = await settled(page);
  for (let k = 0; k < 20; k++) {
    await page.evaluate(() => (location.hash = '#/teoria'));
    await expect(page.locator('.sim-scene')).toHaveCount(0);
    await page.evaluate((id) => (location.hash = `#/sim/${id}`), ID);
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
  }
  const after = await settled(page);
  expect(after.mounted).toBe(1);
  expect(after.workers).toBe(1);
  expect(after.renderers).toBe(1);
  expect(after.geometries).toBe(first.geometries);
  expect(after.materials).toBe(first.materials);
  expect(after.info?.geometries).toBe(first.info?.geometries);
  expect(after.info?.textures).toBe(first.info?.textures);
  expect(await page.locator('canvas').count()).toBe(2); // scene + 1 uPlot canvas

  const fps = await page.evaluate(
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
  console.warn(`[${ID}] rAF rate over 3 s (headless, SwiftShader): ${fps.toFixed(1)} fps`);
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) });
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe: no WCAG 2.1 A/AA violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`./#/sim/${ID}`);
    await page.locator('.sim-scene canvas').waitFor();
    await settled(page);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
  });
}
