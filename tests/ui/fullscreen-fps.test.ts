// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoop, type LoopEnv } from '../../src/core/loop';
import { getShowFps, resetSettingsForTests, setShowFps } from '../../src/core/settings';
import { createFpsCounter, fpsStats, formatFpsStats } from '../../src/ui/fpsCounter';
import {
  createFullscreenButton,
  createFullscreenController,
  FULLSCREEN_EVENT,
} from '../../src/ui/fullscreen';
import { createSimLayout, isFpsKey, isFullscreenKey, isTypingTarget } from '../../src/ui/simLayout';

/** Install a fake Fullscreen API on the jsdom document; returns a restore function. */
function fakeFullscreenApi(): () => void {
  let current: Element | null = null;
  const doc = document as unknown as Record<string, unknown>;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => current,
  });
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto['requestFullscreen'] = function (this: Element) {
    current = this; // eslint-disable-line @typescript-eslint/no-this-alias
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  doc['exitFullscreen'] = () => {
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  return () => {
    delete (document as unknown as Record<string, unknown>)['fullscreenEnabled'];
    delete (document as unknown as Record<string, unknown>)['fullscreenElement'];
    delete proto['requestFullscreen'];
    delete doc['exitFullscreen'];
  };
}

afterEach(() => resetSettingsForTests());

const key = (k: string, o: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });

describe('fullscreen controller + button (F5)', () => {
  it('enters/exits the target, reflects fullscreenchange, dispatches the kers event', async () => {
    const restore = fakeFullscreenApi();
    const root = document.createElement('div');
    document.body.append(root);
    const onChange = vi.fn();
    const events: boolean[] = [];
    const onEvt = (e: Event): void => void events.push((e as CustomEvent).detail.on);
    document.addEventListener(FULLSCREEN_EVENT, onEvt);
    const fs = createFullscreenController(root, { onChange });
    const btn = createFullscreenButton(fs);
    expect(fs.supported).toBe(true);
    expect(btn.element.classList.contains('fs-button')).toBe(true);
    expect(btn.element.title).toBe('Schermo intero (F)');
    expect(btn.element.getAttribute('aria-pressed')).toBe('false');

    btn.element.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fs.isActive()).toBe(true);
    expect(root.classList.contains('sim-layout--fullscreen')).toBe(true);
    expect(btn.element.getAttribute('aria-pressed')).toBe('true');
    await fs.exit(); // e.g. Esc
    expect(root.classList.contains('sim-layout--fullscreen')).toBe(false);
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(events).toEqual([true, false]);

    await fs.enter();
    fs.dispose(); // exits fullscreen and removes listeners
    expect(fs.isActive()).toBe(false);
    btn.dispose();
    document.removeEventListener(FULLSCREEN_EVENT, onEvt);
    root.remove();
    restore();
  });

  it('without the API: pseudo fullscreen (class only), Esc exits, Italian notice', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const fs = createFullscreenController(root);
    const btn = createFullscreenButton(fs);
    expect(fs.supported).toBe(false);
    expect(btn.element.disabled).toBe(false);
    expect(btn.element.title).toMatch(/^Schermo intero non disponibile in questo browser/);
    expect(btn.element.textContent).toContain('non disponibile');
    await fs.toggle();
    expect(fs.isPseudo()).toBe(true);
    expect(root.classList.contains('sim-layout--fullscreen')).toBe(true);
    expect(btn.element.getAttribute('aria-pressed')).toBe('true');
    document.dispatchEvent(key('Escape'));
    await Promise.resolve();
    expect(fs.isActive()).toBe(false);
    expect(root.classList.contains('sim-layout--fullscreen')).toBe(false);
    fs.dispose();
    btn.dispose();
    root.remove();
  });
});

describe('layout shortcuts', () => {
  it('F toggles fullscreen of layout.root; ignored in text inputs and with modifiers', async () => {
    const restore = fakeFullscreenApi();
    const host = document.createElement('div');
    document.body.append(host);
    const layout = createSimLayout(host);
    expect(layout.toolbar.querySelector('.fs-button')).not.toBeNull();
    const input = document.createElement('input');
    input.type = 'number';
    layout.controls.append(input);
    input.dispatchEvent(key('f'));
    document.dispatchEvent(key('f', { ctrlKey: true }));
    document.dispatchEvent(key('p'));
    await Promise.resolve();
    expect(layout.fullscreen.isActive()).toBe(false);
    document.body.dispatchEvent(key('F'));
    await Promise.resolve();
    expect(layout.fullscreen.isActive()).toBe(true);
    expect(layout.root.classList.contains('sim-layout--fullscreen')).toBe(true);
    layout.dispose(); // exits and unbinds
    expect(layout.fullscreen.isActive()).toBe(false);
    document.body.dispatchEvent(key('F'));
    await Promise.resolve();
    expect(layout.fullscreen.isActive()).toBe(false);
    host.remove();
    restore();
  });

  it('key predicates', () => {
    expect(isFullscreenKey(key('f'))).toBe(true);
    expect(isFullscreenKey(key('F', { shiftKey: true }))).toBe(true);
    expect(isFullscreenKey(key('f', { metaKey: true }))).toBe(false);
    expect(isFullscreenKey(key('p'))).toBe(false);
    expect(isFpsKey(key('`'))).toBe(true);
    expect(isFpsKey(key('\\', { code: 'Backquote' }))).toBe(true);
    const range = document.createElement('input');
    range.type = 'range';
    const text = document.createElement('input');
    expect(isTypingTarget(range)).toBe(false);
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
  });

  it('backtick toggles the FPS counter (top-right of the overlay), fed by running loops', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const layout = createSimLayout(host);
    const counter = layout.sceneOverlay.querySelector<HTMLElement>('.fps-counter')!;
    expect(counter.hidden).toBe(true); // off by default
    document.body.dispatchEvent(key('`'));
    expect(getShowFps()).toBe(true);
    expect(counter.hidden).toBe(false);

    let t = 0;
    let pending: ((ms: number) => void) | null = null;
    const env: LoopEnv = {
      now: () => t,
      requestFrame: (cb) => ((pending = cb), 1),
      cancelFrame: () => void (pending = null),
      isHidden: () => false,
      onVisibilityChange: () => () => {},
    };
    const loop = createLoop({ step() {}, render() {} }, { env });
    for (let k = 0; k < 120; k++) {
      t += 1000 / 120;
      const p = pending as ((ms: number) => void) | null;
      pending = null;
      p?.(t);
    }
    expect(counter.textContent).toContain('120 fps');
    expect(counter.textContent).toContain('8,3 ms');
    setShowFps(false);
    expect(counter.hidden).toBe(true);
    loop.dispose();
    layout.dispose();
    host.remove();
  });
});

describe('fps statistics', () => {
  it('average, frame time and 1 % low', () => {
    const xs = [...Array(99).fill(10), 50];
    const s = fpsStats(xs)!;
    expect(s.frameMs).toBeCloseTo(10.4, 6);
    expect(s.fps).toBeCloseTo(1000 / 10.4, 6);
    expect(s.low1).toBeCloseTo(20, 6); // 99th percentile = the 50 ms hitch
    expect(fpsStats([])).toBeNull();
    expect(formatFpsStats(s)).toEqual(['96 fps', '10,4 ms', '1% 20']);
  });

  it('counter ignores the gap after a pause and shows "in pausa" when frames stop', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const c = createFpsCounter(host);
    for (let k = 0; k < 30; k++) c.frame(k * 16);
    c.frame(10_000); // resumed after a pause: history reset
    c.frame(10_016);
    expect(c.stats()?.frameMs).toBe(16);
    vi.advanceTimersByTime(1500);
    expect(c.element.textContent).toBe('in pausa');
    c.dispose();
    vi.useRealTimers();
  });
});
