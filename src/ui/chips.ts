import { t } from '../core/i18n/it';
import { el } from './dom';

/** "Slide 7" chips for slide references (the deck itself is never embedded, §9). */
export function createSlideChips(
  refs: readonly number[],
  labelIT: string = t.sim.slideRefs,
): HTMLElement {
  const list = el('ul', { class: 'chips', attrs: { 'aria-label': labelIT } });
  for (const n of [...refs].sort((a, b) => a - b)) {
    list.append(el('li', { class: 'chip chip--slide', text: `${t.theory.slides} ${n}` }));
  }
  return list;
}
