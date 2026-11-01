import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import type { Quantity } from './colors';
import { el } from './dom';
import { renderTexInto } from './math';
import {
  DEFAULT_READOUT_MAX_ABS,
  formatReadout,
  readoutChars,
  readoutPlaceholder,
  writeReadout,
  type ReadoutFormat,
} from './valueReadout';

/**
 * Live formula list: each row shows a KaTeX formula (rendered once) and,
 * optionally, a live numeric value formatted with `formatIT`. `update(values)`
 * can be called every physics step; the DOM is written at most once per
 * animation frame and only for values whose text changed.
 *
 * F4: the value sits in a fixed-width box (`.formula-row__number`, width reserved
 * from `maxAbs` / `digits` / `signed` via `--readout-chars`, see `valueReadout.ts`),
 * the unit in the sibling `.formula-row__unit`, so a changing value never moves the
 * panel. Placeholder `-,--` until the first value.
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
  /** TeX symbol shown before the live value (default: none → "= value"). */
  symbolTex?: string;
  /**
   * Largest |value| to reserve room for, in display units (after `scale`). Default
   * {@link DEFAULT_READOUT_MAX_ABS} (99.999). Larger values show `>99.999,00`.
   */
  maxAbs?: number;
  /** Reserve a sign column. Default true (unknown sign). */
  signed?: boolean;
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
  update(values: Record<string, number | null>): void;
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

  const outputs = new Map<
    string,
    { node: HTMLElement; wrap: HTMLElement; item: FormulaItem; fmt: ReadoutFormat; text: string }
  >();
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
      const fmt: ReadoutFormat = {
        digits: item.digits ?? 2,
        maxAbs: item.maxAbs ?? DEFAULT_READOUT_MAX_ABS,
        signed: item.signed ?? true,
      };
      const out = el('span', {
        class: 'formula-row__number formula-row__number--na',
        text: readoutPlaceholder(fmt.digits),
      });
      out.style.setProperty('--readout-chars', String(readoutChars(fmt)));
      dd.append(out);
      if (item.unit) dd.append(el('span', { class: 'formula-row__unit', text: item.unit }));
      outputs.set(item.key, { node: out, wrap: out, item, fmt, text: out.textContent ?? '' });
    }
    row.append(dd);
    list.append(row);
  }
  container.append(element);

  let pending: Record<string, number | null> = {};
  let frame: number | null = null;
  let disposed = false;

  const flush = (): void => {
    frame = null;
    for (const [key, v] of Object.entries(pending)) {
      const o = outputs.get(key);
      if (!o) continue;
      const shown = v === null ? null : v * (o.item.scale ?? 1);
      const r = formatReadout(shown, o.fmt);
      if (r.text !== o.text) {
        o.text = r.text;
        writeReadout(
          o.node,
          o.wrap,
          'formula-row__number',
          r,
          shown,
          o.item.unit ?? '',
          o.fmt.digits,
        );
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
