import { formatIT } from '../core/format';
import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import type { Quantity } from './colors';
import { el } from './dom';
import { renderTexInto } from './math';

/**
 * Live formula list: each row shows a KaTeX formula (rendered once) and,
 * optionally, a live numeric value formatted with `formatIT`. `update(values)`
 * can be called every physics step; the DOM is written at most once per
 * animation frame and only for values whose text changed.
 */
export interface FormulaItem {
  /** Key used in `update({ [key]: value })`. */
  key: string;
  /** TeX source, e.g. `\varepsilon = -N\,\dfrac{\Delta\Phi}{\Delta t}`. */
  tex: string;
  /** Short Italian description shown under the formula. */
  labelIT?: string;
  /** Unit of the live value (display unit, e.g. 'V', 'mA'). */
  unit?: string;
  /** Fraction digits of the live value (default 2). */
  digits?: number;
  /** Multiply the SI value before display (e.g. 1000 for A → mA). Default 1. */
  scale?: number;
  /** Colour-code the row with a physical-quantity colour. */
  quantity?: Quantity;
  /** Slide reference shown as a chip, e.g. 8. */
  slide?: number;
  /** TeX symbol shown before the live value (default: none → "= value"). */
  symbolTex?: string;
}

export interface FormulaPanelOptions {
  /** Section heading (default "Formule"). Pass '' to omit. */
  titleIT?: string;
  /** Injectable frame scheduler (tests). Default `requestAnimationFrame`. */
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
}

export interface FormulaPanel extends Disposable {
  readonly element: HTMLElement;
  /** Queue new live values (SI units, before `scale`). Unknown keys are ignored. */
  update(values: Record<string, number>): void;
  /** Write pending values now (normally done on the next animation frame). */
  flush(): void;
}

export function createFormulaPanel(
  container: HTMLElement,
  items: readonly FormulaItem[],
  options: FormulaPanelOptions = {},
): FormulaPanel {
  const schedule = options.schedule ?? ((cb: () => void) => requestAnimationFrame(() => cb()));
  const cancel = options.cancel ?? ((id: number) => cancelAnimationFrame(id));
  const title = options.titleIT ?? t.sim.formulas;

  const list = el('dl', { class: 'formula-list' });
  const element = el(
    'section',
    { class: 'formula-panel', attrs: { 'aria-label': title || t.sim.formulas } },
    [title ? el('h2', { class: 'panel-title', text: title }) : null, list],
  );

  const outputs = new Map<string, { node: HTMLElement; item: FormulaItem; text: string }>();
  for (const item of items) {
    const formula = el('div', { class: 'formula-row__tex' });
    renderTexInto(formula, item.tex, false);
    const row = el(
      'div',
      {
        class: `formula-row${item.quantity ? ` q-${item.quantity}` : ''}`,
        dataset: { key: item.key },
      },
      [
        el('dt', {}, [
          formula,
          item.labelIT ? el('span', { class: 'formula-row__label', text: item.labelIT }) : null,
        ]),
      ],
    );
    const dd = el('dd', { class: 'formula-row__value' });
    if (item.symbolTex) {
      const sym = el('span', { class: 'formula-row__symbol' });
      renderTexInto(sym, item.symbolTex, false);
      dd.append(sym, ' = ');
    }
    if (item.unit !== undefined || item.digits !== undefined || item.symbolTex) {
      const out = el('span', { class: 'formula-row__number', text: '—' });
      dd.append(out);
      outputs.set(item.key, { node: out, item, text: '—' });
    }
    if (item.slide !== undefined) {
      dd.append(
        ' ',
        el('span', { class: 'chip chip--slide', text: `${t.theory.slides} ${item.slide}` }),
      );
    }
    row.append(dd);
    list.append(row);
  }
  container.append(element);

  let pending: Record<string, number> = {};
  let frame: number | null = null;
  let disposed = false;

  const flush = (): void => {
    frame = null;
    for (const [key, v] of Object.entries(pending)) {
      const o = outputs.get(key);
      if (!o) continue;
      const text = formatIT(v * (o.item.scale ?? 1), o.item.digits ?? 2, o.item.unit || undefined);
      if (text !== o.text) {
        o.text = text;
        o.node.textContent = text;
      }
    }
    pending = {};
  };

  return {
    element,
    update(values) {
      if (disposed) return;
      Object.assign(pending, values);
      if (frame === null) frame = schedule(flush);
    },
    flush() {
      if (frame !== null) cancel(frame);
      flush();
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancel(frame);
      frame = null;
      element.remove();
    },
  };
}
