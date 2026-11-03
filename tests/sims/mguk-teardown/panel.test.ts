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
import { brakingStateAt } from '../../../src/sims/mguk-teardown/model';
import { READOUTS, createTeardownPanel } from '../../../src/sims/mguk-teardown/panel';

const make = (over: Partial<Parameters<typeof createTeardownPanel>[1]> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const cb = {
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
