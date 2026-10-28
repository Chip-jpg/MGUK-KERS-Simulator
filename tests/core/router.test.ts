import { describe, expect, it, vi } from 'vitest';
import {
  createRouter,
  DEFAULT_HASH,
  formatRoute,
  parseRoute,
  type Route,
  type RouterWindow,
} from '../../src/core/router';

describe('parseRoute', () => {
  it.each<[string, Route]>([
    ['', { kind: 'teoria' }],
    ['#', { kind: 'teoria' }],
    ['#/', { kind: 'teoria' }],
    ['#/teoria', { kind: 'teoria' }],
    ['#/teoria/', { kind: 'teoria' }],
    ['#/teoria/03-faraday-neumann', { kind: 'teoria', id: '03-faraday-neumann' }],
    ['#/sim', { kind: 'sim' }],
    ['#/sim/faraday', { kind: 'sim', id: 'faraday' }],
    ['#/sim/alternator-motor', { kind: 'sim', id: 'alternator-motor' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });

  it.each([
    '#/unknown',
    '#/sim/Faraday',
    '#/sim/a/b',
    '#/teoria/../x',
    '#/interrogazione',
    '#/interrogazione/x',
    '#/sim/<script>',
  ])('falls back to the default route for %s', (hash) => {
    expect(parseRoute(hash)).toEqual({ kind: 'teoria' });
  });
});

describe('formatRoute', () => {
  it('round-trips with parseRoute', () => {
    const routes: Route[] = [
      { kind: 'teoria' },
      { kind: 'teoria', id: '10-kers-mguk' },
      { kind: 'sim' },
      { kind: 'sim', id: 'kers-braking' },
    ];
    for (const r of routes) expect(parseRoute(formatRoute(r))).toEqual(r);
  });

  it('produces the documented hashes', () => {
    expect(formatRoute({ kind: 'sim', id: 'lenz' })).toBe('#/sim/lenz');
    expect(formatRoute({ kind: 'teoria', id: '04-lenz' })).toBe('#/teoria/04-lenz');
  });
});

function fakeWindow(initial: string): RouterWindow & { fire(): void; listeners: number } {
  const handlers = new Set<() => void>();
  return {
    location: { hash: initial },
    addEventListener: (_t, cb) => void handlers.add(cb),
    removeEventListener: (_t, cb) => void handlers.delete(cb),
    fire: () => handlers.forEach((h) => h()),
    get listeners() {
      return handlers.size;
    },
  };
}

describe('createRouter', () => {
  it('normalises an empty hash to the default and notifies immediately', () => {
    const win = fakeWindow('');
    const onChange = vi.fn();
    const router = createRouter(onChange, win);
    expect(win.location.hash).toBe(DEFAULT_HASH);
    expect(onChange).toHaveBeenCalledWith({ kind: 'teoria' });
    router.dispose();
  });

  it('notifies on hashchange, navigates, and removes its listener on dispose', () => {
    const win = fakeWindow('#/sim/faraday');
    const onChange = vi.fn();
    const router = createRouter(onChange, win);
    expect(router.current()).toEqual({ kind: 'sim', id: 'faraday' });

    router.navigate({ kind: 'teoria', id: '13-filo-logico' });
    expect(win.location.hash).toBe('#/teoria/13-filo-logico');
    win.fire();
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'teoria', id: '13-filo-logico' });

    expect(win.listeners).toBe(1);
    router.dispose();
    expect(win.listeners).toBe(0);
  });

  it('redirects unknown and removed routes (e.g. #/interrogazione) to the canonical hash', () => {
    for (const [initial, canonical] of [
      ['#/interrogazione', DEFAULT_HASH],
      ['#/unknown', DEFAULT_HASH],
      ['#/teoria/', '#/teoria'],
    ] as const) {
      const win = fakeWindow(initial);
      const onChange = vi.fn();
      const router = createRouter(onChange, win);
      expect(win.location.hash).toBe(canonical);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ kind: 'teoria' });
      // The rewrite's own hashchange does not render the same route twice.
      win.fire();
      expect(onChange).toHaveBeenCalledTimes(1);
      router.dispose();
    }
  });

  it('redirects #/interrogazione reached by hashchange', () => {
    const win = fakeWindow('#/sim');
    const onChange = vi.fn();
    const router = createRouter(onChange, win);
    win.location.hash = '#/interrogazione';
    win.fire();
    expect(win.location.hash).toBe(DEFAULT_HASH);
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'teoria' });
    router.dispose();
  });
});
