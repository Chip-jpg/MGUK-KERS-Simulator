// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ParamSpec } from '../../src/core/types';
import { createSlider, parseNumberIT, snapToSpec, stepDigits } from '../../src/ui/slider';

const B: ParamSpec = {
  min: 0,
  max: 2,
  step: 0.01,
  default: 0.5,
  unit: 'T',
  labelIT: 'Campo magnetico B',
};

function keydown(target: HTMLElement, key: string, shiftKey = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
}

describe('slider helpers', () => {
  it('stepDigits', () => {
    expect(stepDigits(0.01)).toBe(2);
    expect(stepDigits(5)).toBe(0);
    expect(stepDigits(1e-7)).toBe(7);
    expect(stepDigits(0.25)).toBe(2);
  });

  it('parseNumberIT accepts Italian and dot decimals', () => {
    expect(parseNumberIT('0,5')).toBe(0.5);
    expect(parseNumberIT('0.5')).toBe(0.5);
    expect(parseNumberIT('1.234,5')).toBe(1234.5);
    expect(parseNumberIT(' -3 ')).toBe(-3);
    expect(parseNumberIT('−2,5')).toBe(-2.5);
    expect(parseNumberIT('1e-3')).toBe(0.001);
    expect(parseNumberIT('abc')).toBeNaN();
    expect(parseNumberIT('')).toBeNaN();
  });

  it('snapToSpec clamps and snaps without float noise', () => {
    expect(snapToSpec(5, B)).toBe(2);
    expect(snapToSpec(-1, B)).toBe(0);
    expect(snapToSpec(0.123, B)).toBe(0.12);
    expect(snapToSpec(0.1 + 0.2, B)).toBe(0.3);
    expect(snapToSpec(Number.NaN, B)).toBe(0.5);
  });
});

describe('createSlider', () => {
  it('renders an accessible range + numeric field with Italian formatting', () => {
    const s = createSlider({ spec: B, id: 'b' });
    document.body.append(s.element);
    const range = s.element.querySelector<HTMLInputElement>('input[type=range]')!;
    const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
    const label = s.element.querySelector('label')!;
    expect(label.htmlFor).toBe(range.id);
    expect(label.textContent).toBe('Campo magnetico B');
    expect(range.min).toBe('0');
    expect(range.max).toBe('2');
    expect(range.step).toBe('0.01');
    expect(range.value).toBe('0.5');
    expect(range.getAttribute('aria-valuetext')).toBe('0,50 T');
    expect(number.value).toBe('0,50');
    expect(number.getAttribute('aria-label')).toBe('Campo magnetico B (T)');
    expect(s.element.textContent).toContain('T');
    s.dispose();
    expect(document.body.contains(s.element)).toBe(false);
  });

  it('emits on range input and typed values (comma decimals), clamps out-of-range input', () => {
    const onInput = vi.fn();
    const s = createSlider({ spec: B, onInput });
    const range = s.element.querySelector<HTMLInputElement>('input[type=range]')!;
    const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;

    range.value = '1.2';
    range.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenLastCalledWith(1.2);
    expect(number.value).toBe('1,20');

    number.value = '0,75';
    number.dispatchEvent(new Event('change'));
    expect(s.value).toBe(0.75);
    expect(onInput).toHaveBeenLastCalledWith(0.75);

    number.value = '99';
    keydown(number, 'Enter');
    expect(s.value).toBe(2);
    expect(number.value).toBe('2,00');
    s.dispose();
  });

  it('flags invalid text without changing the value', () => {
    const onInput = vi.fn();
    const s = createSlider({ spec: B, onInput });
    const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
    number.value = 'boh';
    number.dispatchEvent(new Event('change'));
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(s.element.querySelector('.slider__error')?.textContent).toMatch(/Valore non valido/);
    expect(s.value).toBe(0.5);
    expect(onInput).not.toHaveBeenCalled();
    keydown(number, 'Escape');
    expect(number.value).toBe('0,50');
    expect(number.hasAttribute('aria-invalid')).toBe(false);
    s.dispose();
  });

  it('arrow keys in the numeric field step the value (Shift = ×10)', () => {
    const s = createSlider({ spec: B });
    const number = s.element.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;
    keydown(number, 'ArrowUp');
    expect(s.value).toBe(0.51);
    keydown(number, 'ArrowDown', true);
    expect(s.value).toBe(0.41);
    s.dispose();
  });

  it('set() is silent by default, reset() restores the default and emits', () => {
    const onInput = vi.fn();
    const s = createSlider({ spec: B, value: 1, onInput });
    expect(s.value).toBe(1);
    s.set(1.5);
    expect(onInput).not.toHaveBeenCalled();
    s.reset();
    expect(s.value).toBe(0.5);
    expect(onInput).toHaveBeenCalledWith(0.5);
    s.setDisabled(true);
    expect(s.element.querySelector<HTMLInputElement>('input[type=range]')!.disabled).toBe(true);
    s.dispose();
  });
});
