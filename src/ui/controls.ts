import type { Disposable } from '../core/types';
import { el, listen, uniqueId } from './dom';

/** Small accessible controls used by simulators. All labels are Italian. */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonOptions {
  labelIT: string;
  onClick: () => void;
  variant?: ButtonVariant;
  /** Decorative glyph before the label (hidden from screen readers). */
  icon?: string;
  /** Accessible name when it differs from the visible label. */
  ariaLabel?: string;
  title?: string;
}

export interface ButtonHandle extends Disposable {
  readonly element: HTMLButtonElement;
  setLabel(labelIT: string, icon?: string): void;
  setDisabled(disabled: boolean): void;
}

export function createButton(o: ButtonOptions): ButtonHandle {
  const element = el('button', {
    class: `btn btn--${o.variant ?? 'secondary'}`,
    attrs: { type: 'button', 'aria-label': o.ariaLabel, title: o.title },
  });
  const setLabel = (labelIT: string, icon?: string): void => {
    element.replaceChildren(
      ...(icon
        ? [el('span', { class: 'btn__icon', text: icon, attrs: { 'aria-hidden': 'true' } })]
        : []),
      el('span', { class: 'btn__label', text: labelIT }),
    );
  };
  setLabel(o.labelIT, o.icon);
  const off = listen(element, 'click', () => o.onClick());
  return {
    element,
    setLabel,
    setDisabled: (d) => void (element.disabled = d),
    dispose() {
      off();
      element.remove();
    },
  };
}

export interface ToggleOptions {
  labelIT: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export interface ToggleHandle extends Disposable {
  readonly element: HTMLElement;
  readonly checked: boolean;
  set(checked: boolean, emit?: boolean): void;
}

/** On/off switch: a native checkbox with `role="switch"` (Space toggles). */
export function createToggle(o: ToggleOptions): ToggleHandle {
  const id = uniqueId('toggle');
  const input = el('input', {
    class: 'toggle__input',
    attrs: { id, type: 'checkbox', role: 'switch' },
  });
  input.checked = !!o.checked;
  const element = el('div', { class: 'toggle' }, [
    input,
    el('label', { class: 'toggle__label', attrs: { for: id } }, [
      el('span', { class: 'toggle__track', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { class: 'toggle__thumb' }),
      ]),
      o.labelIT,
    ]),
  ]);
  const off = listen(input, 'change', () => o.onChange?.(input.checked));
  return {
    element,
    get checked() {
      return input.checked;
    },
    set(checked, emit = false) {
      if (input.checked === checked) return;
      input.checked = checked;
      if (emit) o.onChange?.(checked);
    },
    dispose() {
      off();
      element.remove();
    },
  };
}

export interface SegmentedOption<V extends string> {
  value: V;
  labelIT: string;
}

export interface SegmentedOptions<V extends string> {
  /** Group label (visible legend). */
  labelIT: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange?: (value: V) => void;
}

export interface SegmentedHandle<V extends string> extends Disposable {
  readonly element: HTMLFieldSetElement;
  readonly value: V;
  set(value: V, emit?: boolean): void;
}

/** Mutually exclusive choice (e.g. "Generatore / Motore"): native radio group, arrows switch. */
export function createSegmented<V extends string>(o: SegmentedOptions<V>): SegmentedHandle<V> {
  const name = uniqueId('segmented');
  let value = o.value;
  const inputs: HTMLInputElement[] = [];
  const element = el('fieldset', { class: 'segmented' }, [
    el('legend', { class: 'segmented__legend', text: o.labelIT }),
  ]);
  const row = el('div', { class: 'segmented__options' });
  element.append(row);
  for (const opt of o.options) {
    const id = `${name}-${opt.value}`;
    const input = el('input', {
      class: 'segmented__input',
      attrs: { type: 'radio', name, id, value: opt.value },
    });
    input.checked = opt.value === value;
    inputs.push(input);
    row.append(
      input,
      el('label', { class: 'segmented__label', text: opt.labelIT, attrs: { for: id } }),
    );
  }
  const off = listen(element, 'change', (e) => {
    const target = e.target as HTMLInputElement;
    value = target.value as V;
    o.onChange?.(value);
  });
  return {
    element,
    get value() {
      return value;
    },
    set(v, emit = false) {
      if (v === value) return;
      value = v;
      for (const i of inputs) i.checked = i.value === v;
      if (emit) o.onChange?.(v);
    },
    dispose() {
      off();
      element.remove();
    },
  };
}
