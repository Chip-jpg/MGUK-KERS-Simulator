// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../../src/core/types';
import { formatIT } from '../../../src/core/format';
import { parseNumberIT, snapToSpec, stepDigits } from '../../../src/ui/slider';
import { pmsmTorque } from '../../../src/physics';

vi.mock('uplot', () => ({
  default: class {
    destroy(): void {}
    setData(): void {}
    setSize(): void {}
  },
}));

const ctx: AppContext = { theme: 'dark', reducedMotion: true, formatIT };
/** Replace NBSP (formatIT unit separator) with a plain space. */
const norm = (s: string | null | undefined): string => (s ?? '').replace(/\u00A0/g, ' ');
/** "-117,2 A" → -117.2 */
const num = (s: string): number =>
  Number(norm(s).split(' ')[0]?.replace(/\./g, '').replace(',', '.'));

interface Dbg {
  liveMounts: number;
  t: number;
  id: number;
  iq: number;
  torque: number;
  pMech: number;
  pElec: number;
  pCu: number;
  mode: string;
  region: string;
  envelopeTorque: number;
}

describe('pmsm-dq panel helpers', () => {
  it('Italian number round-trip of every slider value (QA-001)', async () => {
    const { params } = await import('../../../src/sims/pmsm-dq/model');
    for (const [key, spec] of Object.entries(params)) {
      const digits = stepDigits(spec.step);
      for (let v = spec.min; v <= spec.max; v += spec.step) {
        const x = snapToSpec(v, spec);
        expect(parseNumberIT(formatIT(x, digits)), `${key} ${x}`).toBe(x);
      }
    }
  });

  it('conductor symbols and plane mapping', async () => {
    const { conductorSymbol } = await import('../../../src/sims/pmsm-dq/scene');
    expect(conductorSymbol(5, true)).toBe('⊙');
    expect(conductorSymbol(5, false)).toBe('⊗');
    expect(conductorSymbol(-5, true)).toBe('⊗');
    expect(conductorSymbol(0, true)).toBe('·');
    const { planeMapper, pathOf } = await import('../../../src/sims/pmsm-dq/panel');
    const map = planeMapper(400);
    const [x0, y0] = map([0, 0]);
    const [x1, y1] = map([100, 100]);
    expect(x1 - x0).toBeCloseTo(y0 - y1, 9); // equal scales, q upwards
    expect(pathOf([[0, 0]], map)).toBe('');
    expect(
      pathOf(
        [
          [0, 0],
          [1, 1],
        ],
        map,
      ),
    ).toMatch(/^M[\d.]+,[\d.]+ L/);
  });
});

describe('pmsm-dq mount (DOM, no WebGL)', () => {
  it('shows the notes, links, readouts consistent with the physics, and disposes cleanly', async () => {
    const { default: sim, FORMULA_ITEMS } = await import('../../../src/sims/pmsm-dq');
    expect(sim.id).toBe('pmsm-dq');
    expect(sim.theoryId).toBe('16-pmsm-dq');
    expect(sim.slideRefs).toEqual([18, 19]);
    expect(sim.summaryIT).toMatch(/^Approfondimento \(Fase 4\)/);
    expect(FORMULA_ITEMS.length).toBeGreaterThanOrEqual(6);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    document.body.append(host);
    const d = sim.mount(host, ctx);
    const text = norm(host.textContent);
    expect(text).toContain(
      'Modello rappresentativo di una macchina trifase sincrona a magneti permanenti con parametri illustrativi; il tipo e i dati reali dell’MGU-K non sono pubblici.',
    );
    expect(text).toContain(
      'Modello semplificato: modello d-q lineare, nessuna saturazione, perdite nel ferro trascurate, inverter ideale',
    );
    for (const id of [
      '16-pmsm-dq',
      '07-alternatore-corrente-alternata',
      '09-motore-elettrico-lorentz',
      '10-kers-mguk',
    ]) {
      expect(host.querySelector(`.pm-theory-links a[href="#/teoria/${id}"]`)).not.toBeNull();
    }
    // reducedMotion ⇒ paused; "Passo" advances one physics step
    const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
    const stepBtn = buttons().find((b) => b.textContent?.includes('Passo'));
    for (let k = 0; k < 10; k++) stepBtn?.click();
    const dbg = (window as unknown as { __kersDebug: Record<string, () => Dbg> }).__kersDebug;
    const st = dbg['pmsm-dq']?.() as Dbg;
    expect(st.liveMounts).toBe(1);
    expect(st.t).toBeGreaterThan(0);
    expect(st.region).toBe('mtpa');
    const read = (k: string): string =>
      host.querySelector(`.pm-readouts__value[data-key="${k}"]`)?.textContent ?? '';
    expect(num(read('torque'))).toBeCloseTo(st.torque, 1);
    expect(num(read('id'))).toBeCloseTo(st.id, 1);
    expect(num(read('pElec'))).toBeCloseTo(num(read('pMech')) + num(read('pCu')), 1);
    expect(st.torque).toBeCloseTo(
      pmsmTorque(st.id, st.iq, { Rs: 0.02, Ld: 0.2e-3, Lq: 0.35e-3, psiM: 0.08, p: 4 }),
      9,
    );
    expect(st.torque).toBeLessThanOrEqual(st.envelopeTorque + 1e-6);
    expect(norm(read('baseRpm'))).toMatch(/^6\.?128 giri\/min$/);

    // switch to braking: torque and mechanical power become negative
    const gen = host.querySelector<HTMLInputElement>('input[type=radio][value=generator]');
    gen?.click();
    for (let k = 0; k < 2000; k++) stepBtn?.click();
    const g = dbg['pmsm-dq']?.() as Dbg;
    expect(g.mode).toBe('generator');
    expect(g.torque).toBeLessThan(0);
    expect(g.pMech).toBeLessThan(0);
    expect(g.pElec).toBeLessThan(0);
    expect(norm(host.querySelector('.pm-badge')?.textContent)).toBe('Generatore (frenata)');

    // manual mode shows the d/q sliders
    const auto = host.querySelector<HTMLInputElement>('input[role=switch]');
    auto?.click();
    expect(
      host.querySelector<HTMLElement>('#pm-idRef')?.closest('.slider')?.hasAttribute('hidden') ??
        false,
    ).toBe(false);

    d.dispose();
    expect(host.childElementCount).toBe(0);
    expect(dbg['pmsm-dq']).toBeUndefined();
    host.remove();
    warn.mockRestore();
  });

  it('mount is idempotent on the same host', async () => {
    const { default: sim } = await import('../../../src/sims/pmsm-dq');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    const a = sim.mount(host, ctx);
    const b = sim.mount(host, ctx);
    expect(host.querySelectorAll('.sim-layout')).toHaveLength(1);
    a.dispose(); // already replaced: no effect
    b.dispose();
    expect(host.childElementCount).toBe(0);
    warn.mockRestore();
  });
});
