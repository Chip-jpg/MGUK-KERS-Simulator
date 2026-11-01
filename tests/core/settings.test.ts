import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FPS_LIMIT_KEY,
  fpsLimitToMaxFps,
  getFpsLimit,
  getShowFps,
  onFpsLimitChange,
  onShowFpsChange,
  parseFpsLimit,
  resetSettingsForTests,
  setFpsLimit,
  setShowFps,
  SHOW_FPS_KEY,
} from '../../src/core/settings';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => resetSettingsForTests());
afterEach(() => {
  vi.unstubAllGlobals();
  resetSettingsForTests();
});

describe('FPS limit setting', () => {
  it('defaults to auto (uncapped) without storage', () => {
    expect(getFpsLimit()).toBe('auto');
    expect(fpsLimitToMaxFps('auto')).toBe(Number.POSITIVE_INFINITY);
    expect(fpsLimitToMaxFps(60)).toBe(60);
    expect(fpsLimitToMaxFps(30)).toBe(30);
  });

  it('reads and writes localStorage["kers-lab.fpsLimit"]', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    s.setItem(FPS_LIMIT_KEY, '30');
    expect(getFpsLimit()).toBe(30);
    setFpsLimit(60);
    expect(s.getItem(FPS_LIMIT_KEY)).toBe('60');
    setFpsLimit('auto');
    expect(s.getItem(FPS_LIMIT_KEY)).toBe('auto');
    resetSettingsForTests();
    expect(getFpsLimit()).toBe('auto');
  });

  it('ignores invalid stored values and invalid input', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    s.setItem(FPS_LIMIT_KEY, '144');
    expect(getFpsLimit()).toBe('auto');
    setFpsLimit(144 as never);
    expect(getFpsLimit()).toBe('auto');
    expect(parseFpsLimit('60')).toBe(60);
    expect(parseFpsLimit('x')).toBeNull();
  });

  it('survives a throwing storage (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(getFpsLimit()).toBe('auto');
    setFpsLimit(30);
    expect(getFpsLimit()).toBe(30); // session-only
  });

  it('notifies subscribers only on change; unsubscribe works', () => {
    const seen: unknown[] = [];
    const off = onFpsLimitChange((l) => seen.push(l));
    setFpsLimit(60);
    setFpsLimit(60);
    setFpsLimit(30);
    off();
    setFpsLimit('auto');
    expect(seen).toEqual([60, 30]);
  });
});

describe('FPS counter visibility setting', () => {
  it('is off by default, persisted in kers-lab.showFps, broadcast', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    expect(getShowFps()).toBe(false);
    const seen: boolean[] = [];
    const off = onShowFpsChange((b) => seen.push(b));
    setShowFps(true);
    expect(s.getItem(SHOW_FPS_KEY)).toBe('true');
    resetSettingsForTests();
    expect(getShowFps()).toBe(true);
    off();
    expect(seen).toEqual([true]);
  });
});
