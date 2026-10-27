import { expect, test, type Page } from '@playwright/test';

/**
 * Sim `faraday` (A4): load without console errors, peak-emf gate via the DOM,
 * keyboard sliders, motional mode, fps sample and a mount/unmount ×20 leak check.
 */

type Debug = Record<string, number | null | object>;

const debug = (page: Page): Promise<Debug> =>
  page.evaluate(() => {
    const w = window as unknown as { __kersDebug?: { faraday?: () => Debug } };
    return w.__kersDebug?.faraday?.() ?? {};
  });

/** "1.234,5 V" → { value: 1234.5, unit: 'V' }. */
function parseIT(text: string): { value: number; unit: string } {
  // \s also matches the NBSP that formatIT puts before the unit.
  const m = /^\s*(-?[\d.]+(?:,\d+)?)\s*(.*)$/u.exec(text);
  if (!m) return { value: Number.NaN, unit: '' };
  return {
    value: Number((m[1] ?? '').replace(/\./g, '').replace(',', '.')),
    unit: (m[2] ?? '').trim(),
  };
}

const PREFIX: Record<string, number> = { k: 1e3, '': 1, m: 1e-3, µ: 1e-6 };
function toSI(text: string, base: string): number {
  const { value, unit } = parseIT(text);
  const prefix = unit.slice(0, unit.length - base.length);
  return value * (PREFIX[prefix] ?? Number.NaN);
}

const row = (page: Page, key: string) =>
  page.locator(`.formula-row[data-key="${key}"] .formula-row__number`);

async function setParam(page: Page, key: string, value: string): Promise<void> {
  const input = page.locator(`#faraday-${key}-number`);
  await input.fill(value);
  await input.press('Enter');
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' ||
      (m.type() === 'warning' && /Too many active WebGL contexts/i.test(m.text()))
    )
      errors.push(m.text());
  });
  return errors;
}

test.describe('sim faraday', () => {
  test('loads with canvas, formulas, plots and no console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./#/sim/faraday');
    await expect(page.getByRole('heading', { level: 1, name: /Faraday-Neumann/ })).toBeVisible();
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await expect(page.locator('.formula-row[data-key="V0"]')).toBeVisible();
    await expect(page.locator('.sim-plots figure.plot')).toHaveCount(2);
    await expect(page.locator('.sim-note')).toContainText('trifase');
    const d = await debug(page);
    expect(d['liveScenes']).toBe(1);
    expect(d['liveRenderers']).toBe(1);
    // default V0 = 50·0,5·0,02·6,3 = 3,15 V
    await expect(row(page, 'V0')).toHaveText(/^3,15\sV$/);
    expect(errors).toEqual([]);
  });

  test('GATE: displayed peak emf equals N·B·S·ω (B=1,2 T, S=0,05 m², N=200, ω=50 rad/s)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./#/sim/faraday');
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await setParam(page, 'B', '1,2');
    await setParam(page, 'S', '0,05');
    await setParam(page, 'N', '200');
    await setParam(page, 'omega', '50');
    const expected = 200 * 1.2 * 0.05 * 50; // 600 V
    await expect(row(page, 'V0')).toHaveText(/^600\sV$/);
    // One full period (T = 2π/50 ≈ 0,126 s) after the last change the peak appears.
    await expect(row(page, 'peak')).toHaveText(/\d/, { timeout: 10_000 });
    const peakText = (await row(page, 'peak').textContent()) ?? '';
    const peak = toSI(peakText, 'V');
    expect(Math.abs(peak - expected) / expected).toBeLessThan(0.005);
    expect(peakText).toBe((await row(page, 'V0').textContent()) ?? '');
    // f = ω/2π
    expect(toSI((await row(page, 'f').textContent()) ?? '', 'Hz')).toBeCloseTo(
      50 / (2 * Math.PI),
      2,
    );
    expect(errors).toEqual([]);
  });

  test('sliders work by keyboard; mode switch shows f.e.m. = B·l·v', async ({ page }) => {
    await page.goto('./#/sim/faraday');
    const range = page.locator('#faraday-N-range');
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#faraday-N-number')).toHaveValue('51');
    await page.keyboard.press('End');
    await expect(page.locator('#faraday-N-number')).toHaveValue('500');

    await page.getByText('Moto traslatorio', { exact: true }).click();
    await expect(page.locator('#faraday-l-range')).toBeVisible();
    await expect(page.locator('#faraday-S-range')).toBeHidden();
    // default B = 0,5 T, l = 0,5 m, v = 1 m/s ⇒ 0,25 V
    await expect(row(page, 'emfMot')).toHaveText(/^250\smV$/);
    await page.locator('#faraday-v-range').focus();
    await page.keyboard.press('ArrowRight'); // v = 1,1 m/s
    await expect(row(page, 'emfMot')).toHaveText(/^275\smV$/);
    // −ΔΦ/Δt computed from the simulated flux has magnitude B·l·v (except a bounce step).
    await expect
      .poll(async () => Math.abs(toSI((await row(page, 'emfFlux').textContent()) ?? '', 'V')))
      .toBeCloseTo(0.275, 3);
  });

  test('fps sample (headless, software GL)', async ({ page }) => {
    await page.goto('./#/sim/faraday');
    await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
    await page.waitForTimeout(500);
    const f0 = (await debug(page))['frames'] as number;
    const raf = await page.evaluate(
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
    const f1 = (await debug(page))['frames'] as number;
    const sceneFps = (f1 - f0) / 3;
    // eslint-disable-next-line no-console -- report the measured value in the test log
    console.log(`[faraday fps] rAF ${raf.toFixed(1)} /s, scene renders ${sceneFps.toFixed(1)} /s`);
    test.info().annotations.push({
      type: 'fps',
      description: `rAF ${raf.toFixed(1)}, scene ${sceneFps.toFixed(1)}`,
    });
    expect(sceneFps).toBeGreaterThan(0);
    expect(sceneFps).toBeLessThanOrEqual(62); // 60 fps cap respected
  });

  test('mount/unmount ×20 without leaks', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const cdp = await page.context().newCDPSession(page);
    const heapAfterGc = async (): Promise<number> => {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
      return usedSize;
    };
    const heaps: number[] = [];
    await page.goto('./#/teoria');
    for (let k = 0; k < 20; k++) {
      await page.evaluate(() => (location.hash = '#/sim/faraday'));
      await expect(page.locator('.sim-scene canvas')).toHaveCount(1);
      await page.waitForTimeout(150);
      const d = await debug(page);
      expect(d['liveScenes']).toBe(1);
      expect(d['liveMounts']).toBe(1);
      await page.evaluate(() => (location.hash = '#/teoria'));
      await expect(page.locator('.prose, .theory-index').first()).toBeVisible();
      const after = await debug(page);
      expect(after['liveScenes']).toBe(0);
      expect(after['liveRenderers']).toBe(0);
      expect(after['liveGeometries']).toBe(0);
      expect(after['liveMaterials']).toBe(0);
      expect(after['liveMounts']).toBe(0);
      expect(after['canvases']).toBe(0);
      heaps.push(await heapAfterGc());
    }
    const d = await debug(page);
    expect(d['totalMounts']).toBe(20);
    // Heap after forced GC at every unmount. The first ~10 mounts warm up JIT/code
    // caches (KaTeX, uPlot, Three.js); a real leak grows linearly with the number of
    // mounts, so the gate compares the heap after mount #10 with the one after #20.
    const series = heaps.map((h) => (h / 1e6).toFixed(2)).join(' ');
    const h10 = heaps[9] as number;
    const h20 = heaps[19] as number;
    const growth = h20 - h10;
    // eslint-disable-next-line no-console -- report the measured value in the test log
    console.log(
      `[faraday leak] heap after GC per unmount (MB): ${series}; Δ(#10→#20) ${(growth / 1e6).toFixed(2)} MB`,
    );
    expect(growth).toBeLessThan(1e6);
    expect(errors).toEqual([]);
  });
});
