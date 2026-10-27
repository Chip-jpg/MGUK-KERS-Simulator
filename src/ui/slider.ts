import { formatIT } from '../core/format';
import { t } from '../core/i18n/it';
import type { Disposable, ParamSpec } from '../core/types';
import { el, listen, uniqueId } from './dom';

/**
 * Accessible slider for one {@link ParamSpec}: a native range input (arrows,
 * PageUp/PageDown, Home/End) plus a numeric text field that accepts Italian
 * ("0,5") or dot ("0.5") decimals. Label in Italian, unit always shown.
 */
export interface SliderOptions {
  spec: ParamSpec;
  /** Initial value (default `spec.default`). */
  value?: number;
  /** Fraction digits shown (default: derived from `spec.step`). */
  digits?: number;
  /** Called on every change (drag, keys, typed value) with the clamped value. */
  onInput?: (value: number) => void;
  /** Optional DOM id prefix (stable ids for tests). */
  id?: string;
  /** Extra help text under the slider (wired with `aria-describedby`). */
  hintIT?: string;
}

export interface Slider extends Disposable {
  readonly element: HTMLElement;
  /** Current value (SI, clamped to [min,max] and snapped to step). */
  readonly value: number;
  /** Set the value programmatically; `emit` (default false) calls `onInput`. */
  set(value: number, emit?: boolean): void;
  /** Back to `spec.default` (emits). */
  reset(): void;
  setDisabled(disabled: boolean): void;
}

/** Number of fraction digits implied by a step (0.01 → 2, 5 → 0, 1e-4 → 4). */
export function stepDigits(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const s = step.toString();
  const exp = /e-(\d+)$/.exec(s);
  if (exp?.[1]) return Number.parseInt(exp[1], 10) + (s.split('e')[0]?.split('.')[1]?.length ?? 0);
  return s.split('.')[1]?.length ?? 0;
}

/**
 * Parse a user-typed number, Italian or dot decimals: "1.234,5" → 1234.5,
 * "0,5" → 0.5, "0.5" → 0.5, "-3" → -3. Returns NaN when not a number.
 */
export function parseNumberIT(input: string): number {
  let s = input
    .trim()
    .replace(/\s|\u00A0/g, '')
    .replace(/^\u2212/, '-');
  if (s === '') return Number.NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number.NaN;
  return Number(s);
}

/** Clamp to [min,max] and snap to the step grid anchored at `min`. */
export function snapToSpec(value: number, spec: ParamSpec): number {
  if (!Number.isFinite(value)) return spec.default;
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  if (!(spec.step > 0)) return clamped;
  const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  const digits = stepDigits(spec.step);
  return Math.min(spec.max, Number(snapped.toFixed(Math.min(digits + 2, 20))));
}

export function createSlider(options: SliderOptions): Slider {
  const { spec } = options;
  const digits = options.digits ?? stepDigits(spec.step);
  const base = options.id ?? uniqueId('slider');
  const rangeId = `${base}-range`;
  const numberId = `${base}-number`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  let value = snapToSpec(options.value ?? spec.default, spec);

  const fmt = (v: number): string => formatIT(v, digits);
  const fmtUnit = (v: number): string => formatIT(v, digits, spec.unit || undefined);

  const unit = spec.unit ? el('span', { class: 'slider__unit', text: spec.unit }) : null;
  const label = el('label', { class: 'slider__label', attrs: { for: rangeId } }, [spec.labelIT]);
  const range = el('input', {
    class: 'slider__range',
    attrs: {
      id: rangeId,
      type: 'range',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      'aria-describedby': options.hintIT ? hintId : undefined,
    },
  });
  const number = el('input', {
    class: 'slider__number',
    attrs: {
      id: numberId,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': `${spec.labelIT}${spec.unit ? ` (${spec.unit})` : ''}`,
      'aria-describedby': errorId,
    },
  });
  const error = el('p', {
    class: 'slider__error',
    attrs: { id: errorId, 'aria-live': 'polite' },
  });
  const element = el('div', { class: 'slider', dataset: { param: base } }, [
    el('div', { class: 'slider__head' }, [
      label,
      el('span', { class: 'slider__field' }, [number, unit]),
    ]),
    range,
    el('div', { class: 'slider__scale', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: fmtUnit(spec.min) }),
      el('span', { text: fmtUnit(spec.max) }),
    ]),
    options.hintIT
      ? el('p', { class: 'slider__hint', text: options.hintIT, attrs: { id: hintId } })
      : null,
    error,
  ]);

  const sync = (): void => {
    range.value = String(value);
    range.setAttribute('aria-valuetext', fmtUnit(value));
    number.value = fmt(value);
    number.removeAttribute('aria-invalid');
    error.textContent = '';
  };

  const apply = (next: number, emit: boolean): void => {
    const v = snapToSpec(next, spec);
    const changed = v !== value;
    value = v;
    sync();
    if (emit && changed) options.onInput?.(value);
  };

  const commitTyped = (): void => {
    const parsed = parseNumberIT(number.value);
    if (Number.isNaN(parsed)) {
      number.setAttribute('aria-invalid', 'true');
      error.textContent = `${t.controls.invalidNumber} ${fmt(spec.min)} ${t.controls.and} ${fmt(spec.max)}.`;
      return;
    }
    apply(parsed, true);
  };

  const offs = [
    listen(range, 'input', () => apply(Number(range.value), true)),
    listen(number, 'change', commitTyped),
    listen(number, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTyped();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const mult = e.shiftKey ? 10 : 1;
        apply(value + (e.key === 'ArrowUp' ? 1 : -1) * spec.step * mult, true);
      } else if (e.key === 'Escape') {
        sync();
      }
    }),
  ];

  sync();

  return {
    element,
    get value() {
      return value;
    },
    set: (v, emit = false) => apply(v, emit),
    reset: () => apply(spec.default, true),
    setDisabled(disabled) {
      range.disabled = disabled;
      number.disabled = disabled;
    },
    dispose() {
      offs.splice(0).forEach((off) => off());
      element.remove();
    },
  };
}
