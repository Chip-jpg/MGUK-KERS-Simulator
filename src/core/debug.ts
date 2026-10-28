/**
 * Read-only debug hooks for the e2e leak / fps checks (`window.__kersDebug[id]`).
 *
 * Hooks are installed only when {@link debugEnabled} is true: Vite dev server,
 * automated browsers (`navigator.webdriver`, set by Playwright) or an explicit
 * `?kersDebug` query parameter. The production bundle for a normal visitor
 * exposes nothing (QA-005).
 */

type DebugHost = { __kersDebug?: Record<string, unknown> };

/** True in dev, under WebDriver/Playwright, or with `?kersDebug` in the URL. */
export function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.webdriver === true) return true;
    return new URLSearchParams(window.location.search).has('kersDebug');
  } catch {
    return false;
  }
}

/**
 * Install `hook` as `window.__kersDebug[id]` when debugging is enabled.
 * Returns an unregister function (call it on dispose); it removes the entry only
 * if it still holds this hook, so a newer mount's hook is never clobbered.
 */
export function registerDebugHook<T>(id: string, hook: T): () => void {
  if (!debugEnabled()) return () => {};
  const host = window as unknown as DebugHost;
  host.__kersDebug ??= {};
  host.__kersDebug[id] = hook;
  return () => {
    const reg = host.__kersDebug;
    if (reg && reg[id] === hook) delete reg[id];
  };
}
