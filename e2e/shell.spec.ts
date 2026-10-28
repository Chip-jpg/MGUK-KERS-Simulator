import { expect, test } from '@playwright/test';

/** App shell: navigation smoke + keyboard navigation (A3). */

test.describe('navigation smoke', () => {
  test('sidebar reaches every area without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto('./');
    await expect(page).toHaveURL(/#\/teoria$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Teoria' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
    const theoryLinks = nav.getByRole('list', { name: 'Sezioni di teoria' }).getByRole('link');
    expect(await theoryLinks.count()).toBeGreaterThan(0);

    // First theory section: TOC, math, next link.
    await theoryLinks.first().click();
    await expect(page).toHaveURL(/#\/teoria\/[a-z0-9-]+$/);
    await expect(page.locator('.prose')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Indice' })).toBeVisible();
    await expect(page.locator('.math-error')).toHaveCount(0);
    await expect(theoryLinks.first()).toHaveAttribute('aria-current', 'page');
    const next = page.locator('.pager__link--next');
    if (await next.count()) {
      const href = await next.getAttribute('href');
      await next.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    }

    await nav.getByRole('link', { name: 'Simulatori', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Simulatori' })).toBeVisible();
    await expect(page.locator('.sim-index > li')).toHaveCount(7);

    await page.goto('./#/sim/faraday');
    await expect(page.locator('.sim-scene')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Comandi della simulazione' })).toBeVisible();

    // Only Teoria and Simulatori: the Interrogazione mode was removed (v0.5.0).
    await expect(nav.locator('.nav__section')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Interrogazione', exact: true })).toHaveCount(0);
    await expect(page.locator('.chip')).toHaveCount(0);

    // Removed and unknown routes redirect to the theory index.
    for (const hash of ['#/interrogazione', '#/qualcosa/che/non/esiste']) {
      await page.goto(`./${hash}`);
      await expect(page).toHaveURL(/#\/teoria$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Teoria' })).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('theory page: relative links resolve to hash routes; no math errors on any section', async ({
    page,
  }) => {
    await page.goto('./#/teoria');
    const hrefs = await page
      .locator('.theory-index a.card__link')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs) {
      await page.goto(`./${href}`);
      await expect(page.locator('.prose')).toBeVisible();
      await expect(page.locator('.math-error, .katex-error'), href).toHaveCount(0);
      for (const a of await page.locator('.prose a[href^="#"]').all()) {
        expect(await a.getAttribute('href')).toMatch(/^#\/teoria\/[a-z0-9-]+$/);
      }
    }
  });
});

test.describe('keyboard navigation', () => {
  test('skip link is the first Tab stop and moves focus to the page heading', async ({ page }) => {
    await page.goto('./#/teoria');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'Vai al contenuto' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main h1')).toBeFocused();
  });

  test('sidebar is reachable with Tab and links open with Enter; focus lands on the new h1', async ({
    page,
  }) => {
    await page.goto('./#/teoria');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // brand
    await expect(page.getByRole('link', { name: 'KERS Lab' })).toBeFocused();
    await page.keyboard.press('Tab'); // theme toggle
    await expect(page.locator('.theme-toggle')).toBeFocused();
    await page.keyboard.press('Tab'); // "Qualità grafica" radio group (one tab stop, D14)
    await expect(
      page.getByRole('group', { name: 'Qualità grafica' }).locator('input:checked'),
    ).toBeFocused();
    await page.keyboard.press('Tab'); // "Teoria"
    await expect(page.getByRole('link', { name: 'Teoria', exact: true })).toBeFocused();
    // Tab until the "Simulatori" section link.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const text = await page.evaluate(() => document.activeElement?.textContent ?? '');
      if (text === 'Simulatori') break;
    }
    await expect(page.getByRole('link', { name: 'Simulatori', exact: true })).toBeFocused();
    // Focus ring is visible (outline from :focus-visible).
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(outline).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/sim$/);
    await expect(page.locator('main h1')).toBeFocused();
  });

  test('theme toggle works from the keyboard and persists', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./#/teoria');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const toggle = page.getByRole('button', { name: 'Passa al tema chiaro' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Passa al tema scuro' })).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('TOC entries are buttons that move focus to the section heading', async ({ page }) => {
    await page.goto('./#/teoria');
    await page.locator('.theory-index a.card__link').first().click();
    const toc = page.getByRole('navigation', { name: 'Indice' });
    const second = toc.getByRole('button').nth(1);
    const target = await second.getAttribute('data-target');
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.prose [id="${target}"]`)).toBeFocused();
    await expect(page).toHaveURL(/#\/teoria\/[a-z0-9-]+$/); // hash route unchanged
  });

  test('simulator toolbar and sliders are keyboard operable when a sim is available', async ({
    page,
  }) => {
    await page.goto('./#/sim/faraday');
    await expect(page.locator('.sim-scene')).toBeVisible();
    const formulas = page.getByRole('button', { name: 'Mostra formule' });
    await formulas.focus();
    await page.keyboard.press('Space');
    await expect(formulas).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(formulas).toHaveAttribute('aria-pressed', 'false');

    const range = page.locator('.slider input[type=range]').first();
    test.skip(
      (await range.count()) === 0,
      'no simulator with sliders merged yet (covered by tests/ui/slider.test.ts)',
    );
    const before = Number(await range.inputValue());
    await range.focus();
    await page.keyboard.press('ArrowRight');
    expect(Number(await range.inputValue())).toBeGreaterThan(before);
  });
});

test.describe('slider numeric field', () => {
  test('Enter on an unchanged grouped value keeps it (QA-001)', async ({ page }) => {
    await page.goto('./#/sim/joule-transformer');
    const v1 = page.locator('#joule-transformer-V1-number');
    await expect(v1).toHaveValue('20.000');
    await v1.press('Enter');
    await expect(v1).toHaveValue('20.000');
    await expect(v1).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#joule-transformer-V1-range')).toHaveValue('20000');

    await v1.fill('25.000');
    await v1.press('Enter');
    await expect(v1).toHaveValue('25.000');

    const p = page.locator('#joule-transformer-P-number');
    await expect(p).toHaveValue('10.000.000');
    await p.press('Enter');
    await expect(p).toHaveValue('10.000.000');
    await expect(p).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('large values fit in the numeric field (QA-004)', async ({ page }) => {
    await page.goto('./#/sim/joule-transformer');
    const p = page.locator('#joule-transformer-P-number');
    await page.locator('#joule-transformer-P-range').press('End');
    await expect(p).toHaveValue('100.000.000');
    const [scroll, client] = await p.evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  });
});
