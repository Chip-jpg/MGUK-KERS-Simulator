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

/** Integer part written with Italian "." thousands grouping: "20.000", "1.234.567". */
const GROUPED_INT = /^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Parse a user-typed number written Italian style or with a dot decimal.
 * Returns NaN when not a number. Rules (chosen so that
 * `parseNumberIT(formatIT(v, d)) === v` for every value a slider can show):
 *
 * - A `,` is always the decimal separator; any `.` before it must form valid
 *   thousands groups: "1.234,5" → 1234.5, "20.000,5" → 20000.5, "0,05" → 0.05.
 * - Without a `,`, dots that form valid thousands groups (first group 1–3
 *   digits not starting with 0, then groups of exactly 3 digits) are grouping:
 *   "20.000" → 20000, "1.234.567" → 1234567. So "1.500" reads as 1500
 *   (Italian reading), never 1,5.
 * - Otherwise a single `.` is a decimal point: "0.5", "2.25", "0.500", "1.5".
 * - An exponent may follow: "1,2e-3", "1e-3". A leading "−" (U+2212) is a
 *   minus; spaces / NBSP are ignored.
 */
export function parseNumberIT(input: string): number {
  const s = input
    .trim()
    .replace(/\s|\u00A0/g, '')
    .replace(/^\u2212/, '-');
  const m = /^([+-]?)([\d.]*)(?:,(\d*))?(e[+-]?\d+)?$/i.exec(s);
  if (!m) return Number.NaN;
  const [, sign = '', intRaw = '', frac, exp = ''] = m;
  let mantissa: string;
  if (frac !== undefined) {
    // Comma decimal: dots (if any) must be thousands grouping.
    if (intRaw.includes('.') && !GROUPED_INT.test(intRaw)) return Number.NaN;
    const int = intRaw.replace(/\./g, '');
    if (int === '' && frac === '') return Number.NaN;
    mantissa = `${int || '0'}.${frac || '0'}`;
  } else if (GROUPED_INT.test(intRaw)) {
    mantissa = intRaw.replace(/\./g, '');
  } else if (/^(\d+\.?\d*|\.\d+)$/.test(intRaw)) {
    mantissa = intRaw; // plain integer or one dot decimal
  } else {
    return Number.NaN;
  }
  return Number(`${sign}${mantissa}${exp}`);
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
  // Size the field for the widest value it can show (QA-004); CSS turns this
  // character count into a `ch` width with a 6.5rem floor.
  const maxChars = Math.max(fmt(spec.min).length, fmt(spec.max).length, fmt(spec.default).length);
  number.style.setProperty('--slider-chars', String(maxChars));
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
