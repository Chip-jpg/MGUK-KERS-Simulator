// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// uPlot (pulled in by the UI barrel) reads matchMedia at import time; jsdom lacks it.
vi.hoisted(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

import { existsSync } from 'node:fs';
import { SIM_IDS } from '../../../src/core/registry';
import { formatIT } from '../../../src/core/format';
import * as dims from '../../../src/sims/mguk-teardown/dims';
import sim from '../../../src/sims/mguk-teardown/index';
import { PRESETS } from '../../../src/sims/kers-braking/model';
import { brakingStateAt } from '../../../src/sims/mguk-teardown/model';
import { READOUTS, createTeardownPanel } from '../../../src/sims/mguk-teardown/panel';

const make = (over: Partial<Parameters<typeof createTeardownPanel>[1]> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const cb = {
    onEra: vi.fn(),
    onPhase: vi.fn(),
    onPlayToggle: vi.fn(),
    onHousing: vi.fn(),
    onView: vi.fn(),
  };
  const panel = createTeardownPanel(host, { formatIT, ...cb, ...over });
  return { host, panel, cb };
};

describe('mguk-teardown module metadata', () => {
  it('has a registered id, Italian text and an existing theory page', () => {
    expect(sim.id).toBe('mguk-teardown');
    expect(SIM_IDS).toContain(sim.id);
    expect(sim.titleIT.length).toBeGreaterThan(5);
    expect(sim.summaryIT.length).toBeGreaterThan(20);
    expect(existsSync(`content/theory/${sim.theoryId}.md`)).toBe(true);
    expect(typeof sim.mount).toBe('function');
  });

  it('dimensions are positive and the gear ratio matches the tooth counts', () => {
    expect(dims.HOUSING_R).toBeGreaterThan(dims.STATOR_R_OUT);
    expect(dims.STATOR_R_BORE).toBeGreaterThan(dims.MAGNET_R_OUT);
    expect(dims.SLOT_R_BOTTOM).toBeLessThan(dims.STATOR_R_OUT);
    expect(dims.CRANK_TO_ROTOR_RATIO).toBeCloseTo(18 / 60, 12);
    expect(dims.GEAR_CENTRE_DISTANCE).toBeCloseTo(dims.PINION_R + dims.CRANK_GEAR_R, 12);
  });
});

describe('mguk-teardown panel', () => {
  it('renders every readout from a BrakingState', () => {
    const { host, panel } = make();
    panel.update(brakingStateAt(0.3), 0.3);
    for (const r of READOUTS) {
      const out = host.querySelector(`[data-out="${r.key}"]`)?.textContent ?? '';
      expect(out, r.key).not.toBe('—');
      expect(out, r.key).toMatch(/\d/);
    }
    expect(host.querySelector('[data-out="v"]')?.textContent).toContain('km/h');
    panel.dispose();
    expect(host.childElementCount).toBe(0);
  });

  it('updates live powers, energy bars, cap badge and braking phase', () => {
    const { host, panel } = make();
    const preset = PRESETS.find((p) => p.id === '2025')!;
    const out = (key: string) => host.querySelector(`[data-out="${key}"]`)!.textContent;
    const soc = host.querySelector<HTMLProgressElement>(
      'progress[aria-label="Carica batteria (SoC)"]',
    )!;
    const recovered = host.querySelector<HTMLProgressElement>(
      'progress[aria-label="Energia recuperata / limite per giro"]',
    )!;
    for (const phase of [0, 0.3, 0.7, 1]) {
      const state = brakingStateAt(phase, preset.values);
      panel.update(state, phase);
      for (const row of READOUTS) expect(out(row.key)).toBe(row.text(state, formatIT, preset));
      expect(soc.value).toBeCloseTo(state.soc);
      expect(recovered.value).toBeCloseTo(state.recovered / preset.lapLimitJoules);
      expect(host.querySelector<HTMLElement>('[data-out="powerCapActive"]')!.hidden).toBe(
        !state.powerCapActive,
      );
      expect(out('phase')).toContain(
        phase === 0 ? 'Inizio frenata' : phase === 1 ? 'Fine frenata (P ≤ 0)' : 'Frenata in corso',
      );
    }
    expect(out('pMech')).toContain('kW');
    expect(out('pBrakes')).toContain('kW');
    expect(out('brakeHeat')).toContain('MJ');
    expect(out('mgukLoss')).toContain('MJ');
    expect(host.textContent).toContain('correzione fissa FIA');
    panel.dispose();
  });

  it('switches era to the 350 kW cap, 60,000 rpm and 8.5 MJ lap limit', () => {
    const { host, panel, cb } = make();
    const preset = PRESETS.find((p) => p.id === '2026')!;
    host.querySelector<HTMLInputElement>('input[type="radio"][value="2026"]')!.click();
    expect(cb.onEra).toHaveBeenLastCalledWith('2026');
    for (const phase of [0, 0.5, 1]) {
      const state = brakingStateAt(phase, preset.values, 0.25, '2026');
      panel.update(state, phase);
      expect(host.querySelector('[data-out="pKers"]')!.textContent).toContain(
        formatIT(350, 0, 'kW'),
      );
      expect(host.querySelector('[data-out="recovered"]')!.textContent).toContain(
        formatIT(8.5, 1, 'MJ'),
      );
      expect(host.querySelector('[data-out="rpm"]')!.textContent).toContain(
        formatIT((state.rpm / 60_000) * 100, 1, '%'),
      );
      expect(host.querySelector('[data-out="eta"]')!.textContent).toBe(formatIT(97, 0, '%'));
      const bar = host.querySelector<HTMLProgressElement>(
        'progress[aria-label="Energia recuperata / limite per giro"]',
      )!;
      expect(bar.value).toBeCloseTo(state.recovered / 8.5e6);
    }
    expect(host.textContent).toContain(preset.noteIT);
    host.querySelector<HTMLInputElement>('input[type="radio"][value="2025"]')!.click();
    expect(cb.onEra).toHaveBeenLastCalledWith('2025');
    expect(host.querySelector('[data-out="pKers"]')!.textContent).toContain(formatIT(120, 0, 'kW'));
    expect(host.querySelector('[data-out="recovered"]')!.textContent).toContain(
      formatIT(2, 1, 'MJ'),
    );
    panel.dispose();
  });

  it('shows zero power at phase 1 and a play/pause toggle', () => {
    const { host, panel, cb } = make();
    panel.update(brakingStateAt(1), 1);
    expect(host.querySelector('[data-out="pKers"]')?.textContent).toMatch(/^0\s/);
    const btn = host.querySelector<HTMLButtonElement>('button.btn')!;
    expect(btn.textContent).toContain('Pausa');
    btn.click();
    expect(cb.onPlayToggle).toHaveBeenLastCalledWith(false);
    expect(btn.textContent).toContain('Riproduci');
    btn.click();
    expect(cb.onPlayToggle).toHaveBeenLastCalledWith(true);
    panel.dispose();
  });

  it('phase slider emits, and housing/view controls call back', () => {
    const { host, panel, cb } = make();
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '0.5';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb.onPhase).toHaveBeenLastCalledWith(0.5);
    host.querySelector<HTMLInputElement>('input[type="radio"][value="glass"]')!.click();
    expect(cb.onHousing).toHaveBeenCalledWith('glass');
    host.querySelector<HTMLInputElement>('input[type="radio"][value="mguk"]')!.click();
    expect(cb.onView).toHaveBeenCalledWith('mguk');
    panel.dispose();
  });
});
