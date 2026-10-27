// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../../src/core/types';
import { formatIT } from '../../../src/core/format';

vi.mock('uplot', () => ({
  default: class {
    destroy(): void {}
    setData(): void {}
    setSize(): void {}
  },
}));

const ctx: AppContext = { theme: 'light', reducedMotion: true, formatIT };
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\u00A0/g, ' ');

interface DebugState {
  mounted: number;
  t: number;
  i: number;
  balance: { relError: number };
}

describe('rl-energy mount (DOM, no WebGL)', () => {
  it('GATE: DOM shows i(τ) = 63,2 % di I₀; switch + step integrate and balance holds', async () => {
    const { mountRl, default: sim } = await import('../../../src/sims/rl-energy');
    expect(sim.id).toBe('rl-energy');
    expect(sim.theoryId).toBe('06-circuito-rl-energia-campo');
    const host = document.createElement('div');
    document.body.append(host);
    const d = mountRl(host, ctx, { scene: false });
    expect(norm(host.querySelector('[data-testid="tau-ratio"]')?.textContent)).toBe('63,2 %');
    expect(norm(host.querySelector('.rl-tau')?.textContent)).toBe('i(τ) = 63,2 % di I₀');

    const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
    buttons()
      .find((b) => b.textContent?.includes('Chiudi interruttore'))
      ?.click();
    // reducedMotion ⇒ the loop stays paused; "Passo" advances one physics step.
    const step = buttons().find((b) => b.textContent?.includes('Passo'));
    expect(step).toBeDefined();
    for (let k = 0; k < 30; k++) step?.click();
    const dbg = (window as unknown as { __kersDebug: Record<string, () => DebugState> })
      .__kersDebug;
    const state = dbg['rl-energy']?.();
    expect(state?.t).toBeGreaterThan(0);
    expect(state?.i).toBeGreaterThan(0);
    expect(state?.balance.relError).toBeLessThan(1e-6);
    expect(norm(host.querySelector('[data-testid="balance"]')?.textContent)).toContain('✓');

    d.dispose();
    expect(host.childElementCount).toBe(0);
    expect(dbg['rl-energy']?.().mounted).toBe(0);
    host.remove();
  });
});
