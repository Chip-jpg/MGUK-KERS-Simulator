/**
 * User display settings (F7), persisted in `localStorage` and applied live:
 *
 * - **FPS limit** (`kers-lab.fpsLimit`): `'auto'` renders at the display refresh rate
 *   (uncapped, the default), `60` / `30` cap the render rate (laptops on battery).
 *   Physics is unaffected (fixed step, see `src/core/loop.ts`).
 * - **FPS counter** (`kers-lab.showFps`): off by default; toggled from the sidebar or
 *   with the backtick key inside a simulator.
 *
 * Every storage access is wrapped in try/catch: private windows or blocked storage
 * fall back to the defaults for the session.
 */

export type FpsLimit = 'auto' | 60 | 30;

export const FPS_LIMITS: readonly FpsLimit[] = ['auto', 60, 30];
export const FPS_LIMIT_KEY = 'kers-lab.fpsLimit';
export const SHOW_FPS_KEY = 'kers-lab.showFps';
export const DEFAULT_FPS_LIMIT: FpsLimit = 'auto';

export function isFpsLimit(v: unknown): v is FpsLimit {
  return v === 'auto' || v === 60 || v === 30;
}

/** Parse a stored / UI value (`'auto'`, `'60'`, `'30'`, 60, 30); null when invalid. */
export function parseFpsLimit(v: unknown): FpsLimit | null {
  if (v === 'auto') return 'auto';
  const n = typeof v === 'string' ? Number(v) : v;
  return n === 60 || n === 30 ? n : null;
}

/** Render cap [frames/s] of a limit: `'auto'` → `Infinity` (every animation frame). */
export function fpsLimitToMaxFps(limit: FpsLimit): number {
  return limit === 'auto' ? Number.POSITIVE_INFINITY : limit;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* storage unavailable: the setting applies for this session only */
  }
}

let fpsLimitOverride: FpsLimit | null = null;
const fpsListeners = new Set<(limit: FpsLimit) => void>();

/** Active FPS limit (session choice → stored choice → `'auto'`). */
export function getFpsLimit(): FpsLimit {
  return fpsLimitOverride ?? parseFpsLimit(read(FPS_LIMIT_KEY)) ?? DEFAULT_FPS_LIMIT;
}

/** Set, persist and broadcast the FPS limit (invalid values are ignored). */
export function setFpsLimit(limit: FpsLimit): void {
  if (!isFpsLimit(limit)) return;
  const before = getFpsLimit();
  fpsLimitOverride = limit;
  write(FPS_LIMIT_KEY, String(limit));
  if (before !== limit) for (const cb of [...fpsListeners]) cb(limit);
}

/** Subscribe to FPS-limit changes; returns an unsubscribe function. */
export function onFpsLimitChange(cb: (limit: FpsLimit) => void): () => void {
  fpsListeners.add(cb);
  return () => fpsListeners.delete(cb);
}

let showFpsOverride: boolean | null = null;
const showFpsListeners = new Set<(show: boolean) => void>();

/** Whether the FPS counter is shown (default false). */
export function getShowFps(): boolean {
  return showFpsOverride ?? read(SHOW_FPS_KEY) === 'true';
}

/** Show / hide the FPS counter (persisted, broadcast). */
export function setShowFps(show: boolean): void {
  const before = getShowFps();
  showFpsOverride = show;
  write(SHOW_FPS_KEY, String(show));
  if (before !== show) for (const cb of [...showFpsListeners]) cb(show);
}

/** Subscribe to FPS-counter visibility changes; returns an unsubscribe function. */
export function onShowFpsChange(cb: (show: boolean) => void): () => void {
  showFpsListeners.add(cb);
  return () => showFpsListeners.delete(cb);
}

/** Test helper: forget session overrides (the stored values are re-read). */
export function resetSettingsForTests(): void {
  fpsLimitOverride = null;
  showFpsOverride = null;
  fpsListeners.clear();
  showFpsListeners.clear();
}
