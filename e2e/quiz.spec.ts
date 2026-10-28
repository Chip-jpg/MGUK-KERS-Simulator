import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { findGenerator, instantiate } from '../src/quiz/generators';

/**
 * Interrogazione (A9): answer one multiple-choice and one numeric question
 * (correct + wrong) with the keyboard only, check score, solution, persistence,
 * simulation mode, console errors and axe (0 serious/critical).
 */

interface McEntry {
  id: string;
  answer: number;
  options: string[];
}
const bank = JSON.parse(readFileSync('content/quiz/quiz.json', 'utf8')) as { questions: unknown[] };
const MC = new Map(
  (bank.questions as Array<McEntry & { type: string }>)
    .filter((q) => q.type === 'scelta-multipla')
    .map((q) => [q.id, q]),
);

const card = (page: Page) => page.locator('.quiz__card');

/** QA-002: the page must never scroll horizontally at 1280×720, in both themes. */
async function expectNoHScroll(page: Page, label: string): Promise<void> {
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((th) => (document.documentElement.dataset['theme'] = th), theme);
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(sw, `horizontal scroll (${label}, ${theme}): ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
  }
}

async function selectType(page: Page, name: string): Promise<void> {
  // Keyboard: focus the "Tipo di domanda" group, move with the arrow keys.
  const group = page.getByRole('group', { name: 'Tipo di domanda' });
  await group.getByRole('radio').first().focus();
  const labels = ['Tutti', 'Scelta multipla', 'Numerica', 'A voce'];
  const target = labels.indexOf(name);
  for (let i = 0; i < target; i++) await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name, exact: true })).toBeChecked();
}

async function answerMc(page: Page, correct: boolean): Promise<void> {
  const id = await card(page).getAttribute('data-question-id');
  const q = MC.get(id ?? '');
  expect(q, `unknown question ${id}`).toBeTruthy();
  const index = correct ? q!.answer : (q!.answer + 1) % q!.options.length;
  await card(page).locator('.quiz__options input').first().focus();
  if (index === 0) await page.keyboard.press('Space');
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
  await expect(card(page).locator('.quiz__options input').nth(index)).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Verifica' })).toBeFocused();
  await page.keyboard.press('Enter');
}

async function numericExpected(page: Page): Promise<{ answerText: string; expected: number }> {
  const id = (await card(page).getAttribute('data-question-id')) ?? '';
  const seed = Number(await card(page).getAttribute('data-seed'));
  const g = findGenerator(id);
  expect(g, `unknown generator ${id}`).toBeTruthy();
  return instantiate(g!, seed);
}

test('interrogazione: keyboard-only MC + numeric, score, persistence, simulation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('./#/interrogazione');
  await expect(page.getByRole('heading', { level: 1, name: 'Interrogazione' })).toBeVisible();
  await expect(
    page.getByText('Le domande numeriche sono generate con parametri casuali'),
  ).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-question-id', /.+/);
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  await expectNoHScroll(page, 'initial');

  // --- multiple choice: correct, then wrong ---------------------------------
  await selectType(page, 'Scelta multipla');
  await expect(card(page)).toHaveAttribute('data-question-type', 'scelta-multipla');
  await answerMc(page, true);
  await expect(card(page).locator('.quiz__feedback')).toContainText('Corretto');
  await expect(card(page).getByRole('heading', { name: 'Spiegazione' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prossima domanda' })).toBeFocused();
  await page.keyboard.press('Enter');
  await answerMc(page, false);
  await expect(card(page).locator('.quiz__feedback')).toContainText('Sbagliato');
  await expect(card(page).locator('.quiz__feedback')).toContainText('Risposta corretta:');

  // --- numeric: correct (Italian comma), then wrong -------------------------
  await selectType(page, 'Numerica');
  await expect(card(page)).toHaveAttribute('data-question-type', 'numerica');
  let q = await numericExpected(page);
  const input = card(page).getByRole('textbox');
  await input.focus();
  await page.keyboard.type(q.answerText); // canonical Italian form, e.g. "62,5" or "2,50·10⁻⁴"
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.quiz__feedback')).toContainText('Corretto');
  await expect(card(page).getByRole('heading', { name: 'Soluzione' })).toBeVisible();
  expect(await card(page).locator('.quiz__steps li').count()).toBeGreaterThanOrEqual(2);
  await expect(card(page).locator('.quiz__steps .math-error')).toHaveCount(0);
  await expectNoHScroll(page, 'worked solution');
  await expect(page.getByRole('button', { name: 'Prossima domanda' })).toBeFocused();
  await page.keyboard.press('Enter');

  q = await numericExpected(page);
  await expect(card(page).getByRole('textbox')).toBeFocused();
  // Not a number first: no answer recorded, a hint is shown.
  await page.keyboard.type('boh');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.quiz__feedback')).toContainText('Scrivi un numero');
  await page.keyboard.press('Control+A');
  await page.keyboard.type(String(q.expected * 3).replace('.', ','));
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.quiz__feedback')).toContainText('Sbagliato');
  await expect(card(page).locator('.quiz__feedback')).toContainText(q.answerText);

  // --- score ---------------------------------------------------------------
  const score = page.locator('.quiz__score');
  await expect(score).toContainText('2 corrette su 4');
  expect(await score.locator('tbody tr').count()).toBeGreaterThanOrEqual(1);

  // Progress persisted in localStorage (Leitner boxes).
  const stored = await page.evaluate(() => localStorage.getItem('kers-lab.quiz.v1'));
  expect(JSON.parse(stored ?? '{}').turn).toBe(4);

  // axe with feedback + KaTeX solution on screen, both themes.
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((th) => (document.documentElement.dataset['theme'] = th), theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    const summary = results.violations.map(
      (v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`,
    );
    if (summary.length) console.warn(`[axe quiz ${theme}]\n  ${summary.join('\n  ')}`);
    expect(blocking, summary.join('\n')).toEqual([]);
  }

  // --- reset ---------------------------------------------------------------
  await page.getByRole('button', { name: 'Azzera progressi' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.quiz__status')).toHaveText('Progressi azzerati.');
  expect(await page.evaluate(() => localStorage.getItem('kers-lab.quiz.v1'))).toBeNull();
  await expect(score).toContainText('Nessuna risposta');

  // --- simulation mode ------------------------------------------------------
  const modes = page.getByRole('group', { name: 'Modalità' });
  await modes.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Domanda 1 di 10');
  await expect(page.getByRole('group', { name: 'Tipo di domanda' })).toBeHidden();
  await expectNoHScroll(page, 'simulation mode');

  // Navigate away and back: no errors, fresh mount.
  await page.goto('./#/teoria');
  await page.goto('./#/interrogazione');
  await expect(card(page)).toHaveAttribute('data-question-id', /.+/);

  expect(errors).toEqual([]);
});

test('interrogazione: a simulated exam ends with oral flashcards and a summary', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./#/interrogazione');
  await page.getByRole('group', { name: 'Modalità' }).getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');

  for (let n = 1; n <= 10; n++) {
    await expect(card(page).getByRole('heading', { level: 2 })).toHaveText(`Domanda ${n} di 10`);
    const type = await card(page).getAttribute('data-question-type');
    if (n > 8) expect(type).toBe('a-voce');
    if (type === 'a-voce') {
      await page.getByRole('button', { name: 'Mostra risposta' }).click();
      await expect(card(page).getByRole('heading', { name: 'Risposta modello' })).toBeVisible();
      await page.getByRole('button', { name: 'Sapevo', exact: true }).click();
    } else if (type === 'numerica') {
      await card(page).getByRole('textbox').fill('1');
      await card(page).getByRole('button', { name: 'Verifica' }).click();
    } else {
      await card(page).locator('.quiz__options label').first().click();
      await card(page).getByRole('button', { name: 'Verifica' }).click();
    }
    await page
      .getByRole('button', { name: n === 10 ? 'Vedi il risultato' : 'Prossima domanda' })
      .click();
  }
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Simulazione completata');
  await expect(page.locator('.quiz__score')).toContainText('su 10');
  expect(errors).toEqual([]);
});
