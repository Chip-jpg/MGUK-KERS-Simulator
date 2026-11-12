import { expect, test, type Page } from '@playwright/test';

/** E2E for `mguk-teardown`: part focus buttons, home reset and the automatic tour. */

const URL = './#/sim/mguk-teardown';
const PARTS: Array<[string, string]> = [
  ['Ruota', 'wheel'],
  ['Riduzione (ipotesi 18:60)', 'gears'],
  ['Statore', 'stator'],
  ['Rotore', 'rotor'],
  ['Inverter', 'inverter'],
  ['Batteria', 'battery'],
];

const panel = (page: Page) => page.locator('.mgt-panel');
const partBtn = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Parti da inquadrare' })
    .getByRole('button', { name, exact: true });
const tourBtn = (page: Page) => page.getByRole('button', { name: 'Tour automatico' });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await expect(panel(page)).toBeVisible();
  return errors;
}

test.describe('mguk-teardown: parti e tour', () => {
  for (const [name, id] of PARTS) {
    test(`«${name}» imposta il focus e aria-pressed; il secondo clic torna all’insieme`, async ({
      page,
    }) => {
      const errors = await open(page);
      await expect(panel(page)).not.toHaveAttribute('data-focus-part', /.+/);
      const b = partBtn(page, name);
      await b.click();
      await expect(panel(page)).toHaveAttribute('data-focus-part', id);
      await expect(b).toHaveAttribute('aria-pressed', 'true');
      for (const [other] of PARTS.filter(([n]) => n !== name)) {
        await expect(partBtn(page, other)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(page.locator('[data-out="partCaption"]')).toBeVisible();
      await b.click();
      await expect(panel(page)).not.toHaveAttribute('data-focus-part', /.+/);
      await expect(b).toHaveAttribute('aria-pressed', 'false');
      expect(errors).toEqual([]);
    });
  }

  test('«Insieme» riporta la vista d’insieme e azzera il focus', async ({ page }) => {
    await open(page);
    await partBtn(page, 'Statore').click();
    await expect(panel(page)).toHaveAttribute('data-focus-part', 'stator');
    await page.getByText('Insieme', { exact: true }).click();
    await expect(panel(page)).not.toHaveAttribute('data-focus-part', /.+/);
    await expect(partBtn(page, 'Statore')).toHaveAttribute('aria-pressed', 'false');
  });

  test('il tour parte, avanza di parte e si ferma con un’interazione', async ({ page }) => {
    const errors = await open(page);
    await expect(panel(page)).toHaveAttribute('data-tour', 'off');
    await tourBtn(page).click();
    await expect(panel(page)).toHaveAttribute('data-tour', 'on');
    await expect(tourBtn(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page)).toHaveAttribute('data-focus-part', 'wheel');
    await expect(panel(page)).toHaveAttribute('data-focus-part', 'gears', { timeout: 8000 });
    await expect(page.locator('[data-out="partCaption"]')).toContainText(
      'Riduzione ipotizzata 18:60',
    );
    // a drag on the 3D scene stops it and keeps the current part
    const box = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10);
    await page.mouse.up();
    await expect(panel(page)).toHaveAttribute('data-tour', 'off');
    await expect(tourBtn(page)).toHaveAttribute('aria-pressed', 'false');
    const kept = await panel(page).getAttribute('data-focus-part');
    await page.waitForTimeout(4500);
    await expect(panel(page)).toHaveAttribute('data-focus-part', kept ?? '');
    expect(errors).toEqual([]);
  });

  test('scegliere una parte durante il tour lo ferma', async ({ page }) => {
    await open(page);
    await tourBtn(page).click();
    await expect(panel(page)).toHaveAttribute('data-tour', 'on');
    await partBtn(page, 'Batteria').click();
    await expect(panel(page)).toHaveAttribute('data-tour', 'off');
    await expect(panel(page)).toHaveAttribute('data-focus-part', 'battery');
  });
});
