// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPlot } from '../../src/ui/plot';

vi.mock('uplot', () => ({
  default: class {
    scales = {};
    setData(): void {}
    setSize(): void {}
    destroy(): void {}
  },
}));

const base = { titleIT: 'T', series: [{ labelIT: 'a' }] };
const hintOf = (p: { element: HTMLElement }): HTMLElement | null =>
  p.element.querySelector<HTMLElement>('[data-testid="plot-empty-hint"]');

describe('plot empty state', () => {
  it('shows the default hint, hides on push, returns on clear', () => {
    const plot = createPlot(document.body, base);
    expect(hintOf(plot)?.textContent).toBe('Premi ▶ per avviare la simulazione');
    expect(hintOf(plot)?.hidden).toBe(false);
    expect(plot.element.classList.contains('plot--empty')).toBe(true);
    plot.push(0, 1);
    expect(hintOf(plot)?.hidden).toBe(true);
    expect(plot.element.classList.contains('plot--empty')).toBe(false);
    plot.clear();
    expect(hintOf(plot)?.hidden).toBe(false);
    plot.setData([0, 1], [1, 2]);
    expect(hintOf(plot)?.hidden).toBe(true);
    plot.dispose();
  });

  it('supports a custom message and opt-out', () => {
    const custom = createPlot(document.body, { ...base, emptyHintIT: 'Ciao' });
    expect(hintOf(custom)?.textContent).toBe('Ciao');
    const off = createPlot(document.body, { ...base, emptyHintIT: null });
    expect(hintOf(off)).toBeNull();
    expect(off.element.classList.contains('plot--empty')).toBe(false);
    custom.dispose();
    off.dispose();
  });
});
