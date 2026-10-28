// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugEnabled, registerDebugHook } from '../../src/core/debug';

type Host = { __kersDebug?: Record<string, unknown> };
const host = (): Host => window as unknown as Host;

function setWebdriver(value: boolean): void {
  Object.defineProperty(navigator, 'webdriver', { value, configurable: true });
}

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

describe('core/debug (QA-005)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setWebdriver(false);
    setSearch('');
    delete host().__kersDebug;
  });

  it('is enabled in dev builds', () => {
    vi.stubEnv('DEV', true);
    expect(debugEnabled()).toBe(true);
  });

  it('is disabled in a production build for a normal visitor', () => {
    vi.stubEnv('DEV', false);
    setWebdriver(false);
    expect(debugEnabled()).toBe(false);
    const off = registerDebugHook('x', () => 1);
    expect(host().__kersDebug?.['x']).toBeUndefined();
    off();
  });

  it('is enabled in production under WebDriver or with ?kersDebug', () => {
    vi.stubEnv('DEV', false);
    setWebdriver(true);
    expect(debugEnabled()).toBe(true);
    setWebdriver(false);
    expect(debugEnabled()).toBe(false);
    setSearch('?kersDebug');
    expect(debugEnabled()).toBe(true);
    setSearch('?foo=1&kersDebug=1');
    expect(debugEnabled()).toBe(true);
  });

  it('registers and unregisters a hook without clobbering a newer one', () => {
    vi.stubEnv('DEV', true);
    const a = (): string => 'a';
    const b = (): string => 'b';
    const offA = registerDebugHook('sim', a);
    expect(host().__kersDebug?.['sim']).toBe(a);
    const offB = registerDebugHook('sim', b);
    offA(); // a stale unregister must not remove b
    expect(host().__kersDebug?.['sim']).toBe(b);
    offB();
    expect(host().__kersDebug?.['sim']).toBeUndefined();
  });
});
