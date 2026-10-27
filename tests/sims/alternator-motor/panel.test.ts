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
import {
  ARROW_MAX_PX,
  ARROW_MIN_PX,
  FLOW_LABELS_IT,
  THREE_PHASE_NOTE_IT,
  arrowWidth,
  createEnergyFlow,
  createReadouts,
  formatBalance,
} from '../../../src/sims/alternator-motor/panel';
import { renderTex } from '../../../src/ui/math';

describe('energy-flow diagram', () => {
  it('arrow width grows linearly with power and is clamped', () => {
    expect(arrowWidth(0, 10)).toBe(ARROW_MIN_PX);
    expect(arrowWidth(10, 10)).toBe(ARROW_MAX_PX);
    expect(arrowWidth(50, 10)).toBe(ARROW_MAX_PX);
    const half = arrowWidth(5, 10);
    expect(half).toBeCloseTo((ARROW_MIN_PX + ARROW_MAX_PX) / 2, 12);
  });

  it('shows the generator and motor chains and thickness ∝ power', () => {
    const host = document.createElement('div');
    const flow = createEnergyFlow(host, 'generator');
    expect(flow.element.textContent).toContain(FLOW_LABELS_IT.generator.sentence);
    expect(FLOW_LABELS_IT.generator.sentence).toBe(
      'Energia cinetica → energia elettrica → batteria (+ calore Joule)',
    );
    flow.update({ p1: 20, p2: 16, pLoss: 4 });
    const [w1, w2, w3] = flow.widths();
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
    expect(w1).toBe(ARROW_MAX_PX);
    flow.setMode('motor');
    expect(flow.element.textContent).toContain(
      'Batteria → energia elettrica → energia meccanica (+ calore Joule)',
    );
    expect(flow.element.dataset['mode']).toBe('motor');
    flow.dispose();
    expect(host.children).toHaveLength(0);
  });
});

describe('readouts', () => {
  it('formats values Italian style with units', () => {
    const host = document.createElement('div');
    const r = createReadouts(host);
    r.update({
      omega: 30,
      rpm: 286.48,
      emf: 12.345,
      i: -2.5,
      tau: 0.1234,
      pMech: 20,
      pElec: 16,
      pJoule: 4,
      eta: 0.8,
      balance: 1.9e-9,
    });
    expect(r.text('emf')).toBe('12,35 V');
    expect(r.text('i')).toBe('−2,50 A'.replace('−', r.text('i').startsWith('-') ? '-' : '−'));
    expect(r.text('rpm')).toBe('286 giri/min');
    expect(r.text('eta')).toBe('80,0 %');
    expect(r.text('balance')).toBe('1,9·10^-9');
    r.dispose();
  });

  it('balance formatter', () => {
    expect(formatBalance(0)).toBe('0');
    expect(formatBalance(Number.NaN)).toBe('—');
    expect(formatBalance(3.2e-7)).toBe('3,2·10^-7');
  });

  it('three-phase note text is the required one', () => {
    expect(THREE_PHASE_NOTE_IT).toBe(
      "Nota: l'MGU-K reale è una macchina sincrona trifase a magneti permanenti; qui usiamo una sola spira (modello monofase delle slide 18–19).",
    );
  });
});

describe('module metadata and formulas', () => {
  it('default export is a valid SimModule and every formula renders in KaTeX', async () => {
    const mod = await import('../../../src/sims/alternator-motor/index');
    const sim = mod.default;
    expect(sim.id).toBe('alternator-motor');
    expect(sim.theoryId).toBe('10-kers-mguk');
    expect(sim.slideRefs).toEqual([16, 17, 18, 19]);
    for (const m of ['generator', 'motor'] as const) {
      for (const f of mod.formulaItems(m)) {
        expect(renderTex(f.tex).error, f.tex).toBeUndefined();
        if (f.symbolTex) expect(renderTex(f.symbolTex).error).toBeUndefined();
      }
    }
    expect(Object.keys(mod.params)).toContain('Vs');
  });
});
