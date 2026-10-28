import { el } from '../ui/dom';
import { plainText, setRich } from './richText';
import { TEXT } from './text';

/**
 * Radio group for a multiple-choice question. Each radio has a visible `<label>`
 * (rich text, KaTeX allowed); when the option contains a formula the radio also
 * gets an explicit `aria-label` with the plain-text reading, because axe-core
 * ignores KaTeX/MathML content and would otherwise report a formula-only option
 * (e.g. "$BS/2$") as a form control without a name (WCAG 4.1.2, rule `label`).
 */
export function buildMcOptions(
  options: readonly string[],
  name: string,
): { fieldset: HTMLFieldSetElement; inputs: HTMLInputElement[] } {
  const fieldset = el('fieldset', { class: 'quiz__options' }, [
    el('legend', { class: 'visually-hidden', text: TEXT.options }),
  ]);
  const inputs: HTMLInputElement[] = [];
  options.forEach((opt, i) => {
    const id = `${name}-${i}`;
    const input = el('input', { attrs: { type: 'radio', name, id, value: String(i) } });
    const label = setRich(el('label', { attrs: { for: id } }), opt);
    if (opt.includes('$')) input.setAttribute('aria-label', plainText(label));
    inputs.push(input);
    fieldset.append(el('div', { class: 'quiz__option' }, [input, label]));
  });
  return { fieldset, inputs };
}
