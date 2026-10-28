// @vitest-environment jsdom
/**
 * Every quiz form control must have an accessible name (WCAG 4.1.2, axe rule
 * `label`). Regression for the flaky `axe … #/interrogazione` failure: a
 * multiple-choice option made only of a formula (e.g. "$BS/2$") rendered a radio
 * whose `<label>` holds only KaTeX, which axe-core treats as empty — so the page
 * failed only when such a question happened to be drawn first.
 */
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { formatIT } from '../../src/core/format';
import type { AppContext } from '../../src/core/types';
import { STATIC_QUESTIONS } from '../../src/quiz/bank';
import { mountQuiz } from '../../src/quiz/index';
import { buildMcOptions } from '../../src/quiz/options';
import { plainText, setRich } from '../../src/quiz/richText';
import type { MultipleChoiceQuestion } from '../../src/quiz/types';

const ctx: AppContext = { theme: 'dark', reducedMotion: true, formatIT };

/** axe rules about names of form controls and buttons. */
const NAME_RULES = [
  'label',
  'select-name',
  'button-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
];

async function nameProblems(root: Element): Promise<string[]> {
  const r = await axe.run(root, { runOnly: { type: 'rule', values: NAME_RULES } });
  return [...r.violations, ...r.incomplete].flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.html}`),
  );
}

/** Name of a radio as screen readers get it: aria-label, else its label text. */
function radioName(input: HTMLInputElement): string {
  return input.getAttribute('aria-label') ?? plainText(input.labels?.[0] ?? input);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('plainText', () => {
  it('reads KaTeX as MathML tokens, without the TeX source or the visual copy', () => {
    const p = setRich(document.createElement('p'), 'Vale $L = R\\,i$ in henry');
    expect(plainText(p)).toBe('Vale L = R i in henry');
    expect(plainText(setRich(document.createElement('p'), '$BS/2$'))).toBe('B S / 2');
  });
});

const MC = STATIC_QUESTIONS.filter(
  (q): q is MultipleChoiceQuestion => q.type === 'scelta-multipla',
);

describe('multiple-choice options have an accessible name', () => {
  it('the bank contains formula-only options (the case that used to fail)', () => {
    expect(MC.some((q) => q.options.some((o) => /^\$[^$]+\$$/.test(o.trim())))).toBe(true);
  });

  it.each(MC.map((q) => [q.id, q] as const))('%s', async (_id, q) => {
    const { fieldset, inputs } = buildMcOptions(q.options, 'opt');
    document.body.append(fieldset);
    expect(inputs).toHaveLength(q.options.length);
    for (const input of inputs) {
      const name = radioName(input);
      expect(name.length, input.id).toBeGreaterThan(0);
      expect(name, input.id).not.toMatch(/[$\\]/);
    }
    expect(await nameProblems(fieldset)).toEqual([]);
  });
});

describe('mounted quiz: every control has an accessible name for each question type', () => {
  it.each(['scelta-multipla', 'numerica', 'a-voce'] as const)('%s', async (type) => {
    const host = document.createElement('main');
    document.body.append(host);
    const quiz = mountQuiz(host, ctx);
    const radio = host.querySelector<HTMLInputElement>(
      `.quiz__filters input[type="radio"][value="${type}"]`,
    );
    expect(radio).not.toBeNull();
    radio!.click();
    radio!.dispatchEvent(new Event('change', { bubbles: true }));
    const card = host.querySelector<HTMLElement>('.quiz__card');
    expect(card?.dataset['questionType']).toBe(type);
    expect(await nameProblems(host)).toEqual([]);
    if (type === 'a-voce') {
      // Flashcard: reveal the answer, then the self-assessment buttons appear.
      host.querySelector<HTMLButtonElement>('.quiz__actions button')!.click();
      expect(host.querySelectorAll('.quiz__selfassess button')).toHaveLength(2);
      expect(await nameProblems(host)).toEqual([]);
    }
    quiz.dispose();
  });
});
