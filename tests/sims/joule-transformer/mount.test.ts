// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../../src/core/types';
import { formatIT } from '../../../src/core/format';

// uPlot needs a real canvas; the transformer chart is SVG, the stub keeps the UI kit importable.
vi.mock('uplot', () => ({
  default: class {
    destroy(): void {}
    setData(): void {}
    setSize(): void {}
  },
}));

const ctx: AppContext = { theme: 'dark', reducedMotion: true, formatIT };
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\u00A0/g, ' ');

describe('joule-transformer mount (DOM, no WebGL)', () => {
  it('GATE: DOM shows the computed "÷100" factor and the power conservation badge', async () => {
    const { mountTransformer, default: sim } = await import('../../../src/sims/joule-transformer');
    expect(sim.id).toBe('joule-transformer');
    expect(sim.theoryId).toBe('08-trasformatore-trasporto-joule');
    const host = document.createElement('div');
    document.body.append(host);
    const d = mountTransformer(host, ctx, { scene: false });
    expect(norm(host.querySelector('[data-testid="loss-factor"]')?.textContent)).toBe('100,0');
    expect(norm(host.textContent)).toContain(
      'Con tensione ×10 le perdite si riducono di un fattore 100,0',
    );
    expect(norm(host.querySelector('[data-testid="power-badge"]')?.textContent)).toContain(
      '✓ Potenza conservata',
    );
    expect(norm(host.querySelector('[data-testid="loss"]')?.textContent)).toBe('12,5 kW');
    expect(norm(host.querySelector('[data-testid="fraction"]')?.textContent)).toBe('0,125 %');
    expect(norm(host.querySelector('.sim-note')?.textContent)).toContain('Modello semplificato');

    // Changing N₂ through the range input updates the results; the factor stays 100.
    const n2 = host.querySelector<HTMLInputElement>('#joule-transformer-N2-range');
    expect(n2).not.toBeNull();
    if (n2) {
      n2.value = '2000';
      n2.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(norm(host.querySelector('[data-testid="V2"]')?.textContent)).toBe('400 kV');
    expect(norm(host.querySelector('[data-testid="loss-factor"]')?.textContent)).toBe('100,0');

    d.dispose();
    d.dispose(); // idempotent
    expect(host.childElementCount).toBe(0);
    host.remove();
  });
});
