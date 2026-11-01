import { formatIT, UNIT_SEPARATOR } from '../core/format';
import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import type { Quantity } from './colors';
import { el } from './dom';
import './ui.css';

/**
 * Fixed-width numeric readouts (F4). A readout reserves, once, the room for its
 * widest possible text — sign + the integer digits of `maxAbs` (with thousands
 * separators) + the fixed decimals — and never changes size afterwards:
 *
 * - the value box gets `--readout-chars: n` (CSS: `width: calc(n * 1ch)`, tabular
 *   figures, right-aligned, overflow clipped — see `ui.css`), so a changing value or
 *   sign never moves anything around it;
 * - the unit sits in its own span after the box (constant text → constant width;
 *   `--readout-unit-chars` is set, the widest unit in a grid);
 * - `null` / NaN / ±∞ show a placeholder shaped like the number (`-,--` for 2 digits);
 * - a value beyond `maxAbs` shows `>9.999` / `<−9.999` (class `readout--over`,
 *   real value in `title`) instead of widening the box.
 */

export interface ReadoutSpec {
  /** Italian label, e.g. 'Velocità'. */
  labelIT: string;
  /** Display unit, e.g. 'km/h' ('' for none). */
  unit: string;
  /** Fixed fraction digits. */
  digits: number;
  /** Largest |value| the box must fit (display units). */
  maxAbs: number;
  /** Reserve a sign column (values can be negative). Default false. */
  signed?: boolean;
  /** Colour-code with a physical-quantity colour (`q-*` class). */
  quantity?: Quantity | 'neutral';
  /** Optional element id of the value (for tests / aria wiring). */
  id?: string;
}

export type ValueReadoutOptions = ReadoutSpec;

export interface ValueReadout extends Disposable {
  readonly element: HTMLElement;
  /** Show a value (display units); null / NaN → placeholder. */
  set(v: number | null): void;
  /** Current text of the value box. */
  readonly text: string;
}

/** Default reserve when a caller gives no `maxAbs` (5 integer digits: 99.999). */
export const DEFAULT_READOUT_MAX_ABS = 99_999;

export interface ReadoutFormat {
  digits: number;
  maxAbs: number;
  signed?: boolean;
}

function cleanDigits(d: number): number {
  return Number.isFinite(d) ? Math.min(10, Math.max(0, Math.round(d))) : 2;
}

function cleanMaxAbs(m: number): number {
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_READOUT_MAX_ABS;
}

/** Placeholder with the shape of the number: 2 digits → `-,--`, 0 digits → `-`. */
export function readoutPlaceholder(digits: number): string {
  const d = cleanDigits(digits);
  return d > 0 ? `-,${'-'.repeat(d)}` : '-';
}

/**
 * Characters reserved for the value box (DESIGN.md: the readout font is monospace, every
 * glyph — "−" and "," included — is 1ch): sign + integer digits of maxAbs + grouping dots
 * + comma and decimals, at least 4 (so "-,--" fits) and at least the overflow marker.
 */
export function readoutChars(f: ReadoutFormat): number {
  const d = cleanDigits(f.digits);
  const m = cleanMaxAbs(f.maxAbs);
  const widest = formatIT(f.signed ? -m : m, d).length;
  return Math.max(4, widest, readoutPlaceholder(d).length, overflowText(m, !!f.signed).length);
}

/** Overflow marker: `>400` / `<−400` (no decimals, so it fits the number's box). */
function overflowText(m: number, negative: boolean): string {
  return negative ? `<${formatIT(-m, 0)}` : `>${formatIT(m, 0)}`;
}

export type ReadoutState = 'ok' | 'na' | 'over';

/** Text and state of a value inside a readout of the given format. */
export function formatReadout(
  v: number | null | undefined,
  f: ReadoutFormat,
): { text: string; state: ReadoutState } {
  const d = cleanDigits(f.digits);
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return { text: readoutPlaceholder(d), state: 'na' };
  }
  const m = cleanMaxAbs(f.maxAbs);
  // Compare after rounding to the shown decimals (99,996 with 2 digits shows 100,00).
  const shown = Math.abs(Number(v.toFixed(d)));
  if (shown > m) {
    return { text: overflowText(m, v < 0), state: 'over' };
  }
  return { text: formatIT(v, d), state: 'ok' };
}

/** Width of a unit column [ch]. */
function unitChars(unit: string): number {
  return unit.length;
}

/**
 * Apply the readout state to a value box: text (only when changed), `title` with the
 * real value on overflow, and the `--na` / `--over` modifier classes on `root`.
 */
export function writeReadout(
  box: HTMLElement,
  root: HTMLElement,
  prefix: string,
  r: { text: string; state: ReadoutState },
  realValue: number | null,
  unit: string,
  digits: number,
): void {
  if (box.textContent !== r.text) box.textContent = r.text;
  root.classList.toggle(`${prefix}--na`, r.state === 'na');
  root.classList.toggle(`${prefix}--over`, r.state === 'over');
  if (r.state === 'over' && realValue !== null) {
    box.title = formatIT(realValue, digits, unit || undefined);
  } else if (box.hasAttribute('title')) {
    box.removeAttribute('title');
  }
}

export function createValueReadout(o: ValueReadoutOptions): ValueReadout {
  const digits = cleanDigits(o.digits);
  const fmt: ReadoutFormat = { digits, maxAbs: cleanMaxAbs(o.maxAbs), signed: !!o.signed };
  const chars = readoutChars(fmt);
  const q = o.quantity && o.quantity !== 'neutral' ? ` q-${o.quantity}` : '';
  const value = el('span', {
    class: 'readout__value',
    text: readoutPlaceholder(digits),
    attrs: { id: o.id },
  });
  value.style.setProperty('--readout-chars', String(chars));
  const unit = el('span', { class: 'readout__unit', text: o.unit });
  unit.style.setProperty('--readout-unit-chars', String(unitChars(o.unit)));
  const element = el('div', { class: `readout readout--na${q}` }, [
    el('span', { class: 'readout__label', text: o.labelIT }),
    value,
    o.unit ? unit : null,
  ]);
  element.dataset['signed'] = String(!!o.signed);
  let current: number | null = null;

  return {
    element,
    get text() {
      return value.textContent ?? '';
    },
    set(v) {
      current = v === null || !Number.isFinite(v) ? null : v;
      writeReadout(value, element, 'readout', formatReadout(v, fmt), current, o.unit, digits);
    },
    dispose() {
      element.remove();
    },
  };
}

export interface ReadoutGridOptions {
  /** Optional heading of the grid. */
  titleIT?: string;
  /**
   * Announce values to screen readers through one polite live region, at most once
   * per {@link LIVE_INTERVAL_MS} (default false: values are read on demand only).
   */
  live?: boolean;
}

export interface ReadoutGrid extends Disposable {
  readonly element: HTMLElement;
  /** Set the given keys (display units; null → placeholder). Other keys are unchanged. */
  update(values: Record<string, number | null>): void;
}

/** Minimum interval between two screen-reader announcements of a grid [ms]. */
export const LIVE_INTERVAL_MS = 1000;

export function createReadoutGrid(
  container: HTMLElement,
  items: ReadonlyArray<ReadoutSpec & { key: string }>,
  o: ReadoutGridOptions = {},
): ReadoutGrid {
  const readouts = new Map<string, { r: ValueReadout; spec: ReadoutSpec }>();
  const body: HTMLElement[] = [];
  let maxChars = 0;
  let maxUnit = 0;
  for (const item of items) {
    const { key, ...spec } = item;
    const r = createValueReadout(spec);
    r.element.dataset['key'] = key;
    readouts.set(key, { r, spec });
    body.push(r.element);
    maxChars = Math.max(maxChars, readoutChars(spec));
    maxUnit = Math.max(maxUnit, unitChars(spec.unit));
  }
  const live = o.live
    ? el('p', {
        class: 'visually-hidden readout-grid__live',
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      })
    : null;
  const element = el(
    'section',
    {
      class: 'readout-grid',
      attrs: { 'aria-label': o.titleIT || t.readouts.title },
    },
    [o.titleIT ? el('h3', { class: 'readout-grid__title', text: o.titleIT }) : null, ...body, live],
  );
  // Readouts are direct children (CSS subgrid aligns label · value · unit columns);
  // every unit cell reserves the widest unit so the columns line up.
  element.style.setProperty('--readout-chars-max', String(maxChars));
  for (const { r } of readouts.values()) {
    r.element
      .querySelector<HTMLElement>('.readout__unit')
      ?.style.setProperty('--readout-unit-chars', String(maxUnit));
  }
  container.append(element);

  let lastAnnounce = -Infinity;
  let lastSpoken = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const announce = (): void => {
    timer = null;
    if (disposed || !live) return;
    lastAnnounce = Date.now();
    const text = [...readouts.values()]
      .map(
        ({ r, spec }) => `${spec.labelIT}: ${r.text}${spec.unit ? UNIT_SEPARATOR + spec.unit : ''}`,
      )
      .join('; ');
    if (text !== lastSpoken) {
      lastSpoken = text;
      live.textContent = text;
    }
  };

  return {
    element,
    update(values) {
      if (disposed) return;
      for (const [key, v] of Object.entries(values)) readouts.get(key)?.r.set(v);
      if (live && timer === null) {
        timer = setTimeout(announce, Math.max(0, lastAnnounce + LIVE_INTERVAL_MS - Date.now()));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      for (const { r } of readouts.values()) r.dispose();
      readouts.clear();
      element.remove();
    },
  };
}
