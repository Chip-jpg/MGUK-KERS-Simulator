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
  service: string;
  busy: boolean;
  lineCount: number;
  linesDone: number;
  geometry: string;
  bCentre: number | null;
  bRef: number;
}

const debug = (): DebugState | undefined =>
  (window as unknown as { __kersDebug?: Record<string, () => DebugState> }).__kersDebug?.[
    'field-biot-savart'
  ]?.();

async function settle(): Promise<void> {
  await vi.waitFor(() => expect(debug()?.busy).toBe(false), { timeout: 10_000, interval: 20 });
}

describe('field-biot-savart mount (DOM, no WebGL, main-thread fallback)', () => {
  it('metadata, readouts, geometry switch, reset and leak-free dispose', async () => {
    const {
      mountBiot,
      default: sim,
      MODEL_NOTE_IT,
    } = await import('../../../src/sims/field-biot-savart');
    expect(sim.id).toBe('field-biot-savart');
    expect(sim.theoryId).toBe('15-campo-biot-savart');
    expect(sim.slideRefs).toEqual([7, 14]);
    expect(sim.summaryIT).toContain('Approfondimento (Fase 4)');
    expect(MODEL_NOTE_IT).toContain('RK4');

    const host = document.createElement('div');
    document.body.append(host);
    const d = mountBiot(host, ctx, { scene: false });
    expect(norm(host.querySelector('.sim-note')?.textContent)).toContain(
      'Modello semplificato: conduttore filiforme',
    );
    expect(norm(host.querySelector('[data-testid="b-ref"]')?.textContent)).toBe('0,8378 mT');
    await settle();
    const st = debug();
    expect(st?.service).toBe('main-thread');
    expect(st?.lineCount).toBe(12);
    expect(st?.linesDone).toBe(12);
    expect(norm(host.querySelector('[data-testid="b-centre"]')?.textContent)).toMatch(
      /^0,8[0-3]\d\d mT$/,
    );
    expect(norm(host.querySelector('[data-testid="b-diff"]')?.textContent)).toMatch(
      /^-[12],\d\d %$/,
    );
    expect(norm(host.querySelector('[data-testid="inductance"]')?.textContent)).toBe('18,95 µH');
    expect(norm(host.querySelector('[data-testid="field-status"]')?.textContent)).toContain(
      '12/12',
    );

    // switch to the single loop: reference μ₀NI/(2R), l slider disabled, L row hidden
    const loopRadio = host.querySelector<HTMLInputElement>('input[type="radio"][value="loop"]');
    loopRadio!.checked = true;
    loopRadio!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(debug()?.geometry).toBe('loop');
    expect(host.querySelector<HTMLInputElement>('#field-biot-savart-l-range')?.disabled).toBe(true);
    expect(
      host.querySelector<HTMLElement>('[data-testid="inductance"]')?.parentElement?.hidden,
    ).toBe(true);
    await settle();
    const ref = debug()?.bRef ?? 0;
    expect(Math.abs((debug()?.bCentre ?? 0) - ref) / ref).toBeLessThan(0.005);
    expect(norm(host.querySelector('[data-testid="b-diff"]')?.textContent)).toMatch(/^-?0,\d\d %$/);

    // reset → back to the solenoid
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Reimposta'))?.click();
    expect(debug()?.geometry).toBe('solenoid');
    await settle();

    d.dispose();
    d.dispose(); // idempotent
    expect(host.childElementCount).toBe(0);
    expect(debug()).toBeUndefined();
    host.remove();
  });
});
