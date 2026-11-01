import { formatIT, UNIT_SEPARATOR } from '../core/format';
import { el } from './dom';

export interface ValueReadout {
  element: HTMLElement;
  update(value: number): void;
  setText(text: string): void;
}
/** Reserve geometry for existing compound sensor text (state + value + unit). */
export function reserveTextReadout(element: HTMLElement, width = '20rem', height = '2rem'): void {
  element.dataset['readout'] = '';
  element.classList.add('text-readout');
  element.style.width = width;
  element.style.height = height;
  element.style.minWidth = width;
}
/** Fixed geometry, independent numeric and unit columns, no per-frame aria-live. */
export function createValueReadout(
  options: { digits?: number; unit?: string; scale?: number; className?: string } = {},
): ValueReadout {
  const number = el('span', { class: 'value-readout__number', text: '-,--' });
  const unit = el('span', {
    class: 'value-readout__unit',
    text: options.unit ? UNIT_SEPARATOR + options.unit : '',
  });
  const element = el(
    'span',
    { class: `value-readout ${options.className ?? ''}`, attrs: { 'data-readout': '' } },
    [number, unit],
  );
  return {
    element,
    update(value) {
      const n = value * (options.scale ?? 1);
      let text = Number.isFinite(n) ? formatIT(n, options.digits ?? 2) : '-,--';
      if (text.length > 14)
        text = n
          .toExponential(options.digits ?? 2)
          .replace('.', ',')
          .replace('-', '−');
      if (number.textContent !== text) number.textContent = text;
    },
    setText(text) {
      number.textContent = text;
    },
  };
}

export interface ReadoutDefinition {
  key: string;
  labelIT: string;
  unit?: string;
  digits?: number;
  scale?: number;
}
export function createReadoutGrid(container: HTMLElement, defs: readonly ReadoutDefinition[]) {
  const nodes = new Map<string, ValueReadout>();
  const element = el('dl', { class: 'readout-grid' });
  for (const d of defs) {
    const value = createValueReadout(d);
    nodes.set(d.key, value);
    element.append(
      el('div', { class: 'readout-grid__row' }, [
        el('dt', { text: d.labelIT }),
        el('dd', {}, [value.element]),
      ]),
    );
  }
  container.append(element);
  return {
    element,
    update(values: Record<string, number>) {
      for (const [key, value] of Object.entries(values)) nodes.get(key)?.update(value);
    },
    dispose() {
      element.remove();
      nodes.clear();
    },
  };
}
