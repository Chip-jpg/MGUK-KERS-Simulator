// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCROLLABLE_MATH_LABEL,
  syncScrollable,
  watchScrollableMath,
} from '../../src/theory/scrollable';

/** jsdom has no layout: fake the two widths the helper reads. */
function sized(el: HTMLElement, scrollWidth: number, clientWidth: number): HTMLElement {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  return el;
}

function block(): HTMLElement {
  const d = document.createElement('div');
  d.className = 'math-display';
  return d;
}

describe('syncScrollable (QA-020)', () => {
  it('makes an overflowing formula a focusable, labelled group', () => {
    const el = sized(block(), 673, 672);
    expect(syncScrollable(el)).toBe(true);
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe(SCROLLABLE_MATH_LABEL);
  });

  it('leaves a formula that fits without tab stop or role', () => {
    const el = sized(block(), 400, 672);
    expect(syncScrollable(el)).toBe(false);
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('removes the attributes again when the column grows', () => {
    const el = sized(block(), 673, 672);
    syncScrollable(el);
    sized(el, 673, 900);
    expect(syncScrollable(el)).toBe(false);
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
  });
});

describe('watchScrollableMath', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('syncs every .math-display and observes resizes until cleanup', () => {
    const observed: Element[] = [];
    let callback: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe(el: Element): void {
          observed.push(el);
        }
        disconnect = disconnect;
      },
    );
    const root = document.createElement('div');
    const wide = sized(block(), 900, 600);
    const narrow = sized(block(), 300, 600);
    root.append(wide, narrow);

    const stop = watchScrollableMath(root);
    expect(wide.getAttribute('tabindex')).toBe('0');
    expect(narrow.hasAttribute('tabindex')).toBe(false);
    expect(observed).toEqual([wide, narrow]);

    sized(narrow, 300, 200); // the column shrank
    callback([{ target: narrow } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    expect(narrow.getAttribute('tabindex')).toBe('0');

    stop();
    expect(disconnect).toHaveBeenCalled();
  });

  it('works without ResizeObserver and with no formulas', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const root = document.createElement('div');
    const wide = sized(block(), 900, 600);
    root.append(wide);
    expect(() => watchScrollableMath(root)()).not.toThrow();
    expect(wide.getAttribute('tabindex')).toBe('0');
    expect(() => watchScrollableMath(document.createElement('div'))()).not.toThrow();
  });
});
