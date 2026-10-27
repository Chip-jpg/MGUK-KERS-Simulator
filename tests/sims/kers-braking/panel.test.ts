// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PRESETS, defaultParams, summarize } from '../../../src/sims/kers-braking/model';
import { createBalance, createPresets } from '../../../src/sims/kers-braking/panel';

const parseMJ = (s: string | null | undefined): number =>
  Number((s ?? '').replace(/\u00A0MJ$/, '').replace(',', '.'));

describe('kers-braking balance card', () => {
  it('shows ΔE_k = 2,47 MJ for the default event and the displayed sum adds up', () => {
    const host = document.createElement('div');
    const b = createBalance(host);
    b.update(summarize(defaultParams()));
    const out = (k: string): string | null | undefined =>
      host.querySelector(`[data-out="${k}"]`)?.textContent;
    expect(out('dEk')).toBe('2,47\u00A0MJ');
    expect(out('recovered')).toBe('0,36\u00A0MJ');
    expect(out('tRec')).toBe('18,5\u00A0s');
    const sum = parseMJ(out('recovered')) + parseMJ(out('dissipated'));
    expect(Math.abs(sum - parseMJ(out('dEk')))).toBeLessThanOrEqual(0.0100001);
    expect(host.querySelector('.kers-message')?.hasAttribute('hidden')).toBe(true);
    b.dispose();
    expect(host.childElementCount).toBe(0);
  });

  it('v₂ > v₁ shows "Non è una frenata" and no numbers', () => {
    const host = document.createElement('div');
    const b = createBalance(host);
    b.update(summarize({ ...defaultParams(), v1: 100, v2: 200 }));
    const msg = host.querySelector('.kers-message');
    expect(msg?.hasAttribute('hidden')).toBe(false);
    expect(msg?.textContent).toMatch(/^Non è una frenata/);
    expect(host.querySelector('[data-out="dEk"]')?.textContent).toBe('—');
    b.dispose();
  });
});

describe('kers-braking presets', () => {
  it('renders the 2025/2026 buttons with sources and fires callbacks', () => {
    const onPreset = vi.fn();
    const onMinMass = vi.fn();
    const p = createPresets({ onPreset, onMinMass });
    document.body.append(p.element);
    const b2025 = p.element.querySelector<HTMLButtonElement>('[data-preset="2025"]');
    const b2026 = p.element.querySelector<HTMLButtonElement>('[data-preset="2026"]');
    expect(b2025?.textContent).toContain('2025 (120 kW)');
    expect(b2026?.textContent).toContain('2026 (350 kW)');
    expect(p.element.textContent).toContain('Fonte:');
    expect(p.element.textContent).not.toContain('valore da verificare');
    b2026?.click();
    expect(onPreset).toHaveBeenCalledWith(PRESETS[1]);
    p.element.querySelector<HTMLButtonElement>('[data-preset="min-mass-2026"]')?.click();
    expect(onMinMass).toHaveBeenCalledWith(768);
    p.dispose();
    expect(document.body.contains(p.element)).toBe(false);
  });
});
