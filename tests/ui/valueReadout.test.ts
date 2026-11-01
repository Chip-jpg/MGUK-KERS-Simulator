// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormulaPanel } from '../../src/ui/formulaPanel';
import {
  createReadoutGrid,
  createValueReadout,
  formatReadout,
  LIVE_INTERVAL_MS,
  readoutChars,
  readoutPlaceholder,
} from '../../src/ui/valueReadout';

afterEach(() => vi.useRealTimers());

describe('readout format helpers (F4)', () => {
  it('placeholder has the shape of the number', () => {
    expect(readoutPlaceholder(2)).toBe('-,--');
    expect(readoutPlaceholder(1)).toBe('-,-');
    expect(readoutPlaceholder(0)).toBe('-');
  });

  it('reserves sign + integer digits (with grouping dots) + comma and decimals, min 4', () => {
    expect(readoutChars({ digits: 1, maxAbs: 400 })).toBe('400,0'.length);
    expect(readoutChars({ digits: 1, maxAbs: 400, signed: true })).toBe('−400,0'.length);
    expect(readoutChars({ digits: 0, maxAbs: 12000, signed: true })).toBe('<−12.000'.length);
    expect(readoutChars({ digits: 2, maxAbs: 99999.99 })).toBe('99.999,99'.length);
    expect(readoutChars({ digits: 0, maxAbs: 5 })).toBe(4); // minimum 4
    expect(readoutChars({ digits: 2, maxAbs: Number.NaN })).toBe('99.999,00'.length); // default
  });

  it('formats Italian style with the typographic minus; null/NaN → placeholder', () => {
    const f = { digits: 2, maxAbs: 100, signed: true };
    expect(formatReadout(-2.5, f)).toEqual({ text: '−2,50', state: 'ok' });
    expect(formatReadout(-0.001, f).text).toBe('0,00');
    expect(formatReadout(null, f)).toEqual({ text: '-,--', state: 'na' });
    expect(formatReadout(Number.NaN, f).state).toBe('na');
    expect(formatReadout(Number.POSITIVE_INFINITY, f).state).toBe('na');
  });

  it('values beyond maxAbs show an overflow marker that fits the reserved box', () => {
    const f = { digits: 1, maxAbs: 400, signed: true };
    const over = formatReadout(1234.5, f);
    expect(over).toEqual({ text: '>400', state: 'over' });
    expect(formatReadout(-9999, f).text).toBe('<−400');
    expect(over.text.length).toBeLessThanOrEqual(readoutChars(f));
    expect(formatReadout(-9999, f).text.length).toBeLessThanOrEqual(readoutChars(f));
    expect(formatReadout(400.04, f).state).toBe('ok'); // rounds to 400,0
  });
});

describe('createValueReadout', () => {
  it('emits the §6.3 classes, a fixed --readout-chars and a separate unit', () => {
    const r = createValueReadout({
      labelIT: 'Velocità',
      unit: 'km/h',
      digits: 1,
      maxAbs: 400,
      quantity: 'f',
      id: 'v-out',
    });
    const value = r.element.querySelector<HTMLElement>('.readout__value')!;
    expect(r.element.classList.contains('readout')).toBe(true);
    expect(r.element.classList.contains('q-f')).toBe(true);
    expect(r.element.querySelector('.readout__label')?.textContent).toBe('Velocità');
    expect(r.element.querySelector('.readout__unit')?.textContent).toBe('km/h');
    expect(value.id).toBe('v-out');
    const chars = value.style.getPropertyValue('--readout-chars');
    expect(Number(chars)).toBe(readoutChars({ digits: 1, maxAbs: 400 }));
    expect(r.text).toBe('-,-');
    expect(r.element.classList.contains('readout--na')).toBe(true);

    r.set(123.45);
    expect(r.text).toBe('123,5');
    expect(r.element.classList.contains('readout--na')).toBe(false);
    r.set(5000);
    expect(r.text).toBe('>400');
    expect(r.element.classList.contains('readout--over')).toBe(true);
    expect(value.title).toBe('5000,0 km/h'); // it-IT groups from 5 digits
    r.set(Number.NaN);
    expect(r.text).toBe('-,-');
    expect(value.hasAttribute('title')).toBe(false);
    // the reserved width never changes, whatever was shown
    expect(value.style.getPropertyValue('--readout-chars')).toBe(chars);
    r.dispose();
  });
});

describe('createReadoutGrid', () => {
  it('updates by key, aligns columns, announces at most once per second', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const grid = createReadoutGrid(
      host,
      [
        { key: 'v', labelIT: 'Velocità', unit: 'km/h', digits: 0, maxAbs: 400 },
        { key: 'p', labelIT: 'P MGU-K', unit: 'kW', digits: 0, maxAbs: 400, signed: true },
      ],
      { titleIT: 'Telemetria', live: true },
    );
    expect(host.querySelector('.readout-grid')).toBe(grid.element);
    expect(grid.element.querySelector('h3')?.textContent).toBe('Telemetria');
    expect(Number(grid.element.style.getPropertyValue('--readout-chars-max'))).toBe(
      readoutChars({ digits: 0, maxAbs: 400, signed: true }),
    );
    const live = grid.element.querySelector('[role=status]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');

    grid.update({ v: 250, p: -120 });
    const vals = [...grid.element.querySelectorAll('.readout__value')].map((e) => e.textContent);
    expect(vals).toEqual(['250', '−120']);
    vi.advanceTimersByTime(0);
    expect(live.textContent).toBe('Velocità: 250 km/h; P MGU-K: −120 kW');
    for (let k = 0; k < 10; k++) {
      grid.update({ v: 251 + k });
      vi.advanceTimersByTime(50);
    }
    expect(live.textContent).toContain('250'); // throttled: not yet re-announced
    vi.advanceTimersByTime(LIVE_INTERVAL_MS);
    expect(live.textContent).toContain('260');
    grid.update({ p: null });
    expect(grid.element.querySelectorAll('.readout--na')).toHaveLength(1);
    grid.dispose();
    expect(host.childElementCount).toBe(0);
    grid.update({ v: 1 }); // no throw after dispose
  });
});

describe('FormulaPanel fixed-width values (F4)', () => {
  it('puts --readout-chars on .formula-row__number and the unit in a sibling span', () => {
    const host = document.createElement('div');
    const panel = createFormulaPanel(
      host,
      [
        { key: 'a', tex: 'a', unit: 'V', digits: 2, maxAbs: 10, signed: true },
        { key: 'b', tex: 'b', unit: '°', digits: 0 },
      ],
      { schedule: () => 1, cancel: () => {} },
    );
    const [a, b] = [...host.querySelectorAll<HTMLElement>('.formula-row__number')];
    const chars = a!.style.getPropertyValue('--readout-chars');
    expect(Number(chars)).toBe(readoutChars({ digits: 2, maxAbs: 10, signed: true }));
    expect(a!.textContent).toBe('-,--');
    expect(a!.nextElementSibling?.className).toBe('formula-row__unit');
    expect(a!.nextElementSibling?.textContent).toBe('V');
    panel.update({ a: -3.14159, b: 107 });
    panel.flush();
    expect(a!.textContent).toBe('−3,14');
    expect(b!.textContent).toBe('107');
    panel.update({ a: 12345 });
    panel.flush();
    expect(a!.textContent).toBe('>10');
    expect(a!.classList.contains('formula-row__number--over')).toBe(true);
    expect(a!.title).toBe('12.345,00\u00A0V');
    panel.update({ a: null });
    panel.flush();
    expect(a!.textContent).toBe('-,--');
    expect(a!.style.getPropertyValue('--readout-chars')).toBe(chars);
    panel.dispose();
  });
});
