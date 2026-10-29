// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createButton, createSegmented, createToggle } from '../../src/ui/controls';
import { createFormulaPanel } from '../../src/ui/formulaPanel';
import { RingBuffer } from '../../src/ui/ringBuffer';
import { createSimHeader, createSimLayout } from '../../src/ui/simLayout';
import { createSimToolbar } from '../../src/ui/toolbar';

describe('RingBuffer', () => {
  it('keeps the last `capacity` samples in chronological order', () => {
    const rb = new RingBuffer(3, 2);
    expect(rb.toArrays()).toEqual([[], [], []]);
    for (let k = 1; k <= 5; k++) rb.push(k, [k * 10, k * 100]);
    expect(rb.length).toBe(3);
    expect(rb.lastX()).toBe(5);
    expect(rb.toArrays()).toEqual([
      [3, 4, 5],
      [30, 40, 50],
      [300, 400, 500],
    ]);
    rb.push(6, [Number.NaN]);
    expect(rb.toArrays()[2]).toEqual([400, 500, null]);
    rb.clear();
    expect(rb.length).toBe(0);
    expect(() => new RingBuffer(0, 1)).toThrow(RangeError);
  });

  it('toArraysInto fills the same preallocated arrays (QA-038)', () => {
    const rb = new RingBuffer(3, 1);
    const out: (number | null)[][] = [];
    for (let k = 1; k <= 2; k++) rb.push(k, [k * 10]);
    expect(rb.toArraysInto(out)).toEqual([
      [1, 2],
      [10, 20],
    ]);
    const [xs, ys] = out;
    for (let k = 3; k <= 5; k++) rb.push(k, [k === 5 ? Number.NaN : k * 10]);
    rb.toArraysInto(out);
    expect(out[0]).toBe(xs); // same array objects, updated in place
    expect(out[1]).toBe(ys);
    expect(out).toEqual(rb.toArrays());
    expect(out[1]).toEqual([30, 40, null]);
  });
});

describe('FormulaPanel', () => {
  it('renders KaTeX once and batches live values to one frame, formatted Italian style', () => {
    const host = document.createElement('div');
    const frames: Array<() => void> = [];
    const panel = createFormulaPanel(
      host,
      [
        {
          key: 'emf',
          tex: '\\varepsilon = -N\\dfrac{\\Delta\\Phi}{\\Delta t}',
          labelIT: 'f.e.m. indotta',
          unit: 'V',
          digits: 2,
          quantity: 'emf',
        },
        {
          key: 'i',
          tex: 'i = \\varepsilon / R',
          unit: 'mA',
          digits: 1,
          scale: 1000,
          quantity: 'i',
        },
        { key: 'static', tex: '\\Phi = B S \\cos\\alpha' },
      ],
      { schedule: (cb) => frames.push(cb), cancel: () => {} },
    );
    expect(host.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    expect(host.querySelector('.q-emf')).not.toBeNull();
    expect(host.textContent).not.toMatch(/slide/i);

    panel.update({ emf: 1.234 });
    panel.update({ i: 0.0625, unknown: 3 });
    expect(frames).toHaveLength(1); // batched
    const nums = host.querySelectorAll('.formula-row__number');
    expect(nums[0]?.textContent).toBe('—');
    frames[0]!();
    expect(nums[0]?.textContent).toBe('1,23 V');
    expect(nums[1]?.textContent).toBe('62,5 mA');
    expect(nums).toHaveLength(2);

    panel.update({ emf: -0.001 });
    panel.flush();
    expect(nums[0]?.textContent).toBe('0,00 V');
    panel.dispose();
    expect(host.childElementCount).toBe(0);
    panel.update({ emf: 5 });
    expect(frames).toHaveLength(2);
  });
});

describe('controls', () => {
  it('button, toggle (role=switch) and segmented radio group', () => {
    const onClick = vi.fn();
    const b = createButton({ labelIT: 'Reimposta', icon: '↺', onClick });
    b.element.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(b.element.type).toBe('button');
    expect(b.element.querySelector('[aria-hidden=true]')?.textContent).toBe('↺');

    const onChange = vi.fn();
    const tg = createToggle({ labelIT: 'Moto traslatorio', onChange });
    document.body.append(tg.element);
    const input = tg.element.querySelector('input')!;
    expect(input.getAttribute('role')).toBe('switch');
    tg.element.querySelector('label')!.click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(tg.checked).toBe(true);

    const onMode = vi.fn();
    const seg = createSegmented({
      labelIT: 'Modalità',
      options: [
        { value: 'gen', labelIT: 'Generatore' },
        { value: 'mot', labelIT: 'Motore' },
      ],
      value: 'gen',
      onChange: onMode,
    });
    document.body.append(seg.element);
    expect(seg.element.querySelector('legend')?.textContent).toBe('Modalità');
    seg.element.querySelectorAll('input')[1]!.click();
    expect(onMode).toHaveBeenCalledWith('mot');
    expect(seg.value).toBe('mot');
    [b, tg, seg].forEach((c) => c.dispose());
  });
});

describe('createSimLayout + toolbar', () => {
  it('builds the regions, the model note and the "Mostra formule" overlay', () => {
    const host = document.createElement('div');
    host.append('old');
    const layout = createSimLayout(host, { modelNoteIT: 'spira singola, B uniforme.' });
    expect(host.textContent).not.toContain('old');
    for (const region of [
      layout.scene,
      layout.controls,
      layout.formulas,
      layout.plots,
      layout.toolbar,
    ]) {
      expect(host.contains(region)).toBe(true);
    }
    expect(layout.note.textContent).toBe('Modello semplificato: spira singola, B uniforme.');
    const btn = layout.toolbar.querySelector<HTMLButtonElement>('.sim-toolbar__formulas')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(layout.formulas.closest('.sim-formula-overlay')).not.toBeNull();
    btn.click();
    expect(layout.formulas.closest('.sim-formula-overlay')).toBeNull();
    layout.dispose();
    expect(host.childElementCount).toBe(0);
  });

  it('docks scene legends below a compact scene and back into the canvas when large', () => {
    let fire = (): void => {};
    class FakeRO {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', FakeRO);
    const host = document.createElement('div');
    const layout = createSimLayout(host);
    let h = 360;
    Object.defineProperty(layout.scene, 'clientHeight', { get: () => h });
    Object.defineProperty(layout.scene, 'clientWidth', { get: () => 900 });
    const legend = document.createElement('div');
    layout.addSceneLegend(legend);
    const dock = host.querySelector<HTMLDetailsElement>('.sim-legend-dock')!;
    expect(layout.compact).toBe(true);
    expect(dock.hidden).toBe(false);
    expect(dock.querySelector('summary')?.textContent).toBe('Legenda');
    expect(legend.parentElement?.classList.contains('sim-legend-dock__body')).toBe(true);
    expect(legend.hasAttribute('data-scene-legend')).toBe(true);
    expect(layout.scene.classList.contains('sim-scene--compact')).toBe(true);
    h = 496; // 1920×1080
    fire();
    expect(layout.compact).toBe(false);
    expect(legend.parentElement).toBe(layout.sceneOverlay);
    expect(dock.hidden).toBe(true);
    layout.dispose();
    vi.unstubAllGlobals();
  });

  it('toolbar drives the loop: Pausa/Riprendi and Passo', () => {
    const host = document.createElement('div');
    const layout = createSimLayout(host);
    let paused = false;
    const loop = {
      pause: vi.fn(() => void (paused = true)),
      resume: vi.fn(() => void (paused = false)),
      stepOnce: vi.fn(),
      isPaused: () => paused,
    };
    const onReset = vi.fn();
    const tb = createSimToolbar(layout.toolbar, { loop, onReset });
    const buttons = [...layout.toolbar.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual([
      '↺Reimposta',
      '❚❚Pausa',
      '⏭Passo',
      'ƒMostra formule',
    ]);
    buttons[0]!.click();
    expect(onReset).toHaveBeenCalled();
    buttons[1]!.click();
    expect(loop.pause).toHaveBeenCalled();
    expect(buttons[1]!.textContent).toContain('Riprendi');
    buttons[1]!.click();
    expect(loop.resume).toHaveBeenCalled();
    buttons[2]!.click(); // step pauses first
    expect(paused).toBe(true);
    expect(loop.stepOnce).toHaveBeenCalledOnce();
    expect(buttons[2]!.getAttribute('aria-label')).toBe('Avanza di un passo');
    tb.dispose();
    layout.dispose();
  });

  it('createSimHeader links the theory section and shows no slide chips', () => {
    const h = createSimHeader({
      titleIT: 'Legge di Lenz',
      summaryIT: 'Magnete e bobina.',
      theoryId: '04-lenz',
    });
    expect(h.querySelector('h1')?.textContent).toBe('Legge di Lenz');
    expect(h.querySelector('a')?.getAttribute('href')).toBe('#/teoria/04-lenz');
    expect(h.querySelector('.chip')).toBeNull();
    expect(h.textContent).not.toMatch(/slide/i);
  });
});
