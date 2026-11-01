import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * F5 — fullscreen from every simulator (the layout provides it, no sim wiring):
 * enter with the "Schermo intero (F)" button and with the F key; the layout root is the
 * fullscreen element with `.sim-layout--fullscreen`; the 3D canvas fills the scene and
 * its drawing buffer equals the scene size × pixel ratio; the simulation state is kept
 * (same DOM, same slider value); exit restores the original size.
 *
 * `?quality=base` + deviceScaleFactor 2: the base tier caps the pixel ratio at 1,25
 * (docs/ARCHITECTURE.md §10.1), so the expected buffer is floor(css × 1,25).
 */

const SIM_IDS: string[] = [
  ...(
    /SIM_IDS = \[([\s\S]*?)\]/.exec(
      readFileSync(new URL('../src/core/registry.ts', import.meta.url), 'utf8'),
    )?.[1] ?? ''
  ).matchAll(/'([a-z0-9-]+)'/g),
].map((m) => m[1] as string);

const PIXEL_RATIO = Math.min(2, 1.25); // DPR 2, base tier cap 1,25

test.use({ deviceScaleFactor: 2 });

interface Sizes {
  fsIsRoot: boolean;
  cls: boolean;
  sceneW: number;
  sceneH: number;
  cssW: number;
  cssH: number;
  bufW: number;
  bufH: number;
  marked: boolean;
}

const sizes = (page: Page): Promise<Sizes> =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.sim-layout')!;
    const scene = document.querySelector<HTMLElement>('.sim-scene')!;
    const canvas = scene.querySelector('canvas');
    return {
      fsIsRoot: document.fullscreenElement === root,
      cls: root.classList.contains('sim-layout--fullscreen'),
      sceneW: scene.clientWidth,
      sceneH: scene.clientHeight,
      cssW: canvas?.clientWidth ?? 0,
      cssH: canvas?.clientHeight ?? 0,
      bufW: canvas?.width ?? 0,
      bufH: canvas?.height ?? 0,
      marked: root.dataset['e2eMark'] === 'kept',
    };
  });

/** Canvas fills the scene and its buffer is scene × pixel ratio (±1 px rounding). */
async function expectCanvasMatchesScene(page: Page): Promise<Sizes> {
  await expect
    .poll(async () => {
      const s = await sizes(page);
      return (
        s.cssW === s.sceneW &&
        s.cssH === s.sceneH &&
        Math.abs(s.bufW - Math.floor(s.sceneW * PIXEL_RATIO)) <= 1 &&
        Math.abs(s.bufH - Math.floor(s.sceneH * PIXEL_RATIO)) <= 1
      );
    })
    .toBe(true);
  return sizes(page);
}

const sliderValue = (page: Page): Promise<string | null> =>
  page.evaluate(
    () =>
      document.querySelector<HTMLInputElement>('.sim-controls input[type=range]')?.value ?? null,
  );

test.describe('F5 fullscreen', () => {
  for (const id of SIM_IDS) {
    test(`${id}: button and F key, canvas resized, state kept`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(`/?quality=base#/sim/${id}`);
      await expect(page.locator('.sim-scene canvas')).toBeVisible();
      const button = page.locator('.sim-toolbar .fs-button');
      await expect(button).toHaveAttribute('title', 'Schermo intero (F)');
      await expect(button).toHaveAttribute('aria-pressed', 'false');

      // non-default state + DOM marker: both must survive fullscreen
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('.sim-layout')!.dataset['e2eMark'] = 'kept';
        const s = document.querySelector<HTMLInputElement>('.sim-controls input[type=range]');
        if (s) {
          s.value = s.max;
          s.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      const value = await sliderValue(page);
      const before = await expectCanvasMatchesScene(page);

      // 1) the button
      await button.click();
      await expect.poll(async () => (await sizes(page)).fsIsRoot).toBe(true);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      let s = await expectCanvasMatchesScene(page);
      expect(s.cls).toBe(true);
      expect(s.sceneW * s.sceneH).toBeGreaterThan(before.sceneW * before.sceneH);
      expect(s.marked).toBe(true);
      expect(await sliderValue(page)).toBe(value);

      // exit with F (toggle) restores the layout
      await page.keyboard.press('f');
      await expect.poll(async () => (await sizes(page)).fsIsRoot).toBe(false);
      s = await expectCanvasMatchesScene(page);
      expect(s.cls).toBe(false);
      expect(s.sceneW).toBe(before.sceneW);
      expect(s.sceneH).toBe(before.sceneH);

      // 2) the F key from the page (not from a text field)
      await page
        .locator('.sim-note, .page')
        .first()
        .click({ position: { x: 2, y: 2 } });
      await page.keyboard.press('F');
      await expect.poll(async () => (await sizes(page)).fsIsRoot).toBe(true);
      await expectCanvasMatchesScene(page);
      expect((await sizes(page)).marked).toBe(true);
      expect(await sliderValue(page)).toBe(value);
      await button.click();
      await expect.poll(async () => (await sizes(page)).cls).toBe(false);

      // typing F in a number field does nothing
      const field = page.locator('.sim-controls input[type=text], .sim-controls input[inputmode]');
      if ((await field.count()) > 0) {
        await field.first().focus();
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
        expect((await sizes(page)).fsIsRoot).toBe(false);
      }
    });
  }
});
