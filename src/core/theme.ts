import type { Theme } from './types';

/**
 * Theme handling. The active theme is written to
 * `<html data-theme="dark|light">`; CSS tokens (§4.5) key off that attribute.
 * Default = system preference; an explicit toggle is remembered per browser.
 */
export const THEME_STORAGE_KEY = 'kers-lab.theme';

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getSystemTheme(): Theme {
  if (typeof matchMedia !== 'function') return 'dark';
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getStoredTheme(): Theme | null {
  try {
    const v = safeStorage()?.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** Event dispatched on `document` whenever {@link applyTheme} changes the theme. */
export const THEME_CHANGE_EVENT = 'kers-lab:themechange';

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  const previous = root.dataset['theme'];
  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;
  if (previous !== theme && typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
  }
}

/**
 * Subscribe to theme changes (toggle button). Sims use it to recolour Three.js
 * materials; `Plot` uses it internally. Returns an unsubscribe function.
 */
export function onThemeChange(cb: (theme: Theme) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<Theme>).detail);
  document.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => document.removeEventListener(THEME_CHANGE_EVENT, handler);
}

/** Apply the stored/system theme. Call once at startup. */
export function initTheme(root?: HTMLElement): Theme {
  const theme = getTheme();
  applyTheme(theme, root);
  return theme;
}

/** Flip and persist the theme; returns the new theme. */
export function toggleTheme(root: HTMLElement = document.documentElement): Theme {
  const next: Theme = root.dataset['theme'] === 'light' ? 'dark' : 'light';
  applyTheme(next, root);
  try {
    safeStorage()?.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable: theme still applies for this session */
  }
  return next;
}

/** Theme currently applied to `<html>` (falls back to stored/system preference). */
export function currentTheme(root?: HTMLElement): Theme {
  const el = root ?? (typeof document === 'undefined' ? undefined : document.documentElement);
  const v = el?.dataset['theme'];
  return v === 'dark' || v === 'light' ? v : getTheme();
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
