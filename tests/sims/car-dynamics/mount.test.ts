// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../../src/core/types';
import { formatIT } from '../../../src/core/format';
import { defaultParams, summarize } from '../../../src/sims/car-dynamics/model';

vi.mock('uplot', () => ({
  default: class {
    destroy(): void {}
    setData(): void {}
    setSize(): void {}
  },
}));

const ctx: AppContext = { theme: 'dark', reducedMotion: true, formatIT };
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\u00A0/g, ' ');
/** "1.234,5 MJ" → 1234.5 */
const num = (s: string): number =>
  Number(norm(s).split(' ')[0]?.replace(/\./g, '').replace(',', '.'));

interface Dbg {
  liveMounts: number;
  simT: number;
  aero: boolean;
  tBrake: number;
  distance: number;
  eStored: number;
  eAero: number;
  balanceError: number;
  compareRecovered: number | null;
  params: { Pmax: number; balance: number; mu: number };
}

const dbg = (): Dbg | undefined =>
  (window as unknown as { __kersDebug?: Record<string, () => Dbg> }).__kersDebug?.[
    'car-dynamics'
  ]?.();

describe('car-dynamics mount (DOM, no WebGL)', () => {
  it('shows note, links, consistent readouts; presets, aero toggle and ideal balance work', async () => {
    const { default: sim, FORMULA_ITEMS } = await import('../../../src/sims/car-dynamics');
    expect(sim.id).toBe('car-dynamics');
    expect(sim.theoryId).toBe('17-dinamica-frenata');
    expect(sim.slideRefs).toEqual([16, 17]);
    expect(sim.summaryIT).toMatch(/^Approfondimento \(Fase 4\)/);
    expect(FORMULA_ITEMS.length).toBeGreaterThanOrEqual(6);
    for (const f of FORMULA_ITEMS) {
      expect(f.labelIT ?? '').not.toMatch(/[A-Za-z]_[A-Za-z0-9{(]|\^/);
      expect(f.labelIT ?? '').not.toContain("'");
      // word subscripts upright via \text{} (QA-026): no _{post}, _{batt}, x,post …
      for (const tex of [f.tex, f.symbolTex ?? '']) {
        expect(tex).not.toMatch(/_\{(?:[^{}]*,)?[a-z]{3,}/);
      }
    }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    document.body.append(host);
    const d = sim.mount(host, ctx);
    const text = norm(host.textContent);
    expect(text).toContain(
      'Modello semplificato: vettura puntiforme con trasferimento di carico longitudinale, pneumatici Pacejka semplificati al picco di aderenza (ABS ideale), MGU-K solo sull’asse posteriore, parametri illustrativi.',
    );
    expect(text).not.toContain("'");
    for (const id of ['17-dinamica-frenata', '10-kers-mguk', '06-circuito-rl-energia-campo']) {
      expect(host.querySelector(`.cd-links a[href="#/teoria/${id}"]`)).not.toBeNull();
    }
    // sources next to the presets
    expect(host.querySelectorAll('.cd-sources a').length).toBeGreaterThanOrEqual(2);

    const out = (k: string): string =>
      norm(host.querySelector(`[data-out="${k}"]`)?.textContent ?? '');
    const ref = summarize(defaultParams(), true);
    expect(out('distance')).toBe(`${formatIT(ref.zone.distance, 1)} m`);
    expect(out('time')).toBe('1,83 s');
    expect(out('cTime')).toBe('1,83 s');
    expect(out('dEk')).toBe('2,47 MJ');
    expect(out('cDEk')).toBe('2,47 MJ');
    expect(out('stored')).toBe('0,22 MJ');
    expect(out('cStored')).toBe('0,22 MJ');
    expect(out('aero')).toBe('0,23 MJ');
    expect(out('cAero')).toBe('0,00 MJ');
    // displayed parts add up to ΔE_k (display rounding)
    const parts = ['stored', 'loss', 'brakesFront', 'brakesRear', 'aero'].map((k) => num(out(k)));
    expect(Math.abs(parts.reduce((a, b) => a + b, 0) - num(out('dEk')))).toBeLessThanOrEqual(0.03);

    const st = dbg();
    expect(st?.liveMounts).toBe(1);
    expect(Math.abs(st?.balanceError ?? 1)).toBeLessThan(1e-6);

    // reducedMotion ⇒ paused; "Passo" advances the playback
    const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
    const stepBtn = buttons().find((b) => b.textContent?.includes('Passo'));
    for (let k = 0; k < 24; k++) stepBtn?.click();
    expect(dbg()?.simT).toBeCloseTo(0.1, 6);
    expect(norm(host.querySelector('.cd-hud')?.textContent)).toContain('MGU-K limitata da');

    // 2026 preset: 350 kW, stored < constant-deceleration model
    buttons()
      .find((b) => b.dataset['preset'] === '2026')
      ?.click();
    const p26 = dbg();
    expect(p26?.params.Pmax).toBe(350);
    expect(out('stored')).toBe('0,55 MJ');
    expect(out('cStored')).toBe('0,64 MJ');
    expect(p26?.eStored ?? 0).toBeLessThan(p26?.compareRecovered ?? 0);

    // aero off
    host.querySelector<HTMLInputElement>('input[role=switch]')?.click();
    expect(dbg()?.aero).toBe(false);
    expect(dbg()?.eAero).toBe(0);
    expect(out('time')).toBe('3,56 s');
    expect(host.querySelector<HTMLInputElement>('#cd-CdA-range')?.disabled).toBe(true);

    // ideal balance
    buttons()
      .find((b) => b.textContent?.includes('Ripartizione ideale'))
      ?.click();
    expect(dbg()?.params.balance).toBe(58);
    const mu = host.querySelector<HTMLInputElement>('#cd-mu-range');
    if (mu) {
      mu.value = '2';
      mu.dispatchEvent(new Event('input', { bubbles: true }));
    }
    buttons()
      .find((b) => b.textContent?.includes('Ripartizione ideale'))
      ?.click();
    expect(dbg()?.params.balance).toBe(62);

    // v₂ > v₁: message instead of numbers
    const v2 = host.querySelector<HTMLInputElement>('#cd-v2-range');
    const v1 = host.querySelector<HTMLInputElement>('#cd-v1-range');
    if (v1 && v2) {
      v1.value = '150';
      v1.dispatchEvent(new Event('input', { bubbles: true }));
      v2.value = '200';
      v2.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(norm(host.querySelector('.cd-message')?.textContent)).toContain('Non è una frenata');
    expect(out('stored')).toBe('—');

    // Reset restores the defaults and the aero
    buttons()
      .find((b) => b.textContent?.includes('Reimposta'))
      ?.click();
    expect(dbg()?.aero).toBe(true);
    expect(dbg()?.params.Pmax).toBe(120);
    expect(out('time')).toBe('1,83 s');

    d.dispose();
    expect(host.childElementCount).toBe(0);
    expect(dbg()).toBeUndefined();
    host.remove();
    warn.mockRestore();
  });

  it('mount is idempotent on the same host', async () => {
    const { default: sim } = await import('../../../src/sims/car-dynamics');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    const a = sim.mount(host, ctx);
    const b = sim.mount(host, ctx);
    expect(host.querySelectorAll('.sim-layout')).toHaveLength(1);
    a.dispose();
    b.dispose();
    expect(host.childElementCount).toBe(0);
    warn.mockRestore();
  });
});
