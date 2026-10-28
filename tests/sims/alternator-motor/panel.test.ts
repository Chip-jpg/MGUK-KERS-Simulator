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
// uPlot needs a 2D canvas context, which jsdom lacks (mount test below).
vi.mock('uplot', () => ({
  default: class {
    destroy(): void {}
    setData(): void {}
    setSize(): void {}
  },
}));

import {
  ARROW_MAX_PX,
  ARROW_MIN_PX,
  arrowEnd,
  headOvershoot,
  FLOW_LABELS_IT,
  THREE_PHASE_NOTE_IT,
  createTheoryLinks,
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
    // QA-017: arrowhead tips stop before the box edges (220, 436, loss top 136)
    const lines = [...flow.element.querySelectorAll('line')];
    const at = (k: number, a: string): number => Number(lines[k]?.getAttribute(a));
    expect(at(0, 'x2') + headOvershoot(w1)).toBeLessThanOrEqual(220);
    expect(at(1, 'x2') + headOvershoot(w2)).toBeLessThanOrEqual(436);
    expect(at(2, 'y2') + headOvershoot(w3)).toBeLessThanOrEqual(136);
    expect(at(0, 'x2')).toBeGreaterThan(at(0, 'x1'));
    expect(arrowEnd(166, 220, ARROW_MIN_PX)).toBeCloseTo(220 - 2 - 2.4 * ARROW_MIN_PX, 9);
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
    expect(r.text('balance')).toBe('1,9·10⁻⁹');
    r.dispose();
  });

  it('balance formatter', () => {
    expect(formatBalance(0)).toBe('0');
    expect(formatBalance(Number.NaN)).toBe('—');
    // QA-016: Unicode superscripts, no ASCII 10^-7
    expect(formatBalance(3.2e-7)).toBe('3,2·10⁻⁷');
    expect(formatBalance(2e-10)).toBe('2,0·10⁻¹⁰');
  });

  it('three-phase note is hedged on the PMSM topology (QA-007)', () => {
    expect(THREE_PHASE_NOTE_IT).toBe(
      'Nota: l’MGU-K reale è una macchina trifase, generalmente descritta come sincrona a magneti permanenti; qui usiamo una sola spira (modello monofase delle slide 18–19).',
    );
  });

  it('links theory 07, 09 and 10 in the panel (QA-006)', () => {
    const p = createTheoryLinks();
    expect(p.textContent).toBe(
      'Teoria: Alternatore (07) · Motore e forza di Lorentz (09) · KERS/MGU-K (10)',
    );
    expect([...p.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '#/teoria/07-alternatore-corrente-alternata',
      '#/teoria/09-motore-elettrico-lorentz',
      '#/teoria/10-kers-mguk',
    ]);
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

describe('formula panel and readouts in the same frame (QA-018)', () => {
  it('a single step updates ε and i in both panels synchronously', async () => {
    const { formatIT } = await import('../../../src/core/format');
    const mod = await import('../../../src/sims/alternator-motor/index');
    const host = document.createElement('div');
    document.body.append(host);
    const d = mod.default.mount(host, { theme: 'light', reducedMotion: true, formatIT });
    const step = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Passo'));
    expect(step).toBeDefined();
    const num = (t: string | null | undefined): number =>
      Number(
        (t ?? '')
          .replace('−', '-')
          .replace(/[^\d,-]/g, '')
          .replace(',', '.'),
      );
    for (let k = 0; k < 5; k++) {
      step?.click();
      for (const key of ['emf', 'i']) {
        const readout = host.querySelector(`.am-readouts__value[data-key="${key}"]`)?.textContent;
        const formula = host.querySelector(
          `.formula-row[data-key="${key}"] .formula-row__number`,
        )?.textContent;
        expect(num(formula), key).toBeCloseTo(num(readout), 1);
      }
    }
    d.dispose();
    host.remove();
  });
});
