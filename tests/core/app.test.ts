// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, createAppContext } from '../../src/core/app';
import { SIM_IDS } from '../../src/core/registry';
import { THEME_STORAGE_KEY, onThemeChange, toggleTheme } from '../../src/core/theme';
import { loadTheory } from '../../src/theory/content';

// jsdom does not implement scrolling.
window.scrollTo = (() => {}) as typeof window.scrollTo;

const docs = loadTheory({
  '/c/01-a.md':
    '---\ntitleIT: Primo\norder: 1\nslideRefs: [7]\n---\n## In breve\n\n$B$ e [link](02-b.md)\n\n## Formule\n',
  '/c/02-b.md': '---\ntitleIT: Secondo\norder: 2\n---\n## In breve\n',
}).docs;

async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 0));
}

describe('createApp (jsdom smoke)', () => {
  let app: { dispose(): void } | null = null;
  afterEach(() => {
    app?.dispose();
    app = null;
    localStorage.clear();
  });

  it('renders sidebar, theory index/page, sim index, coming-soon sim; #/interrogazione redirects', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    window.location.hash = '';
    app = createApp(root, { theory: docs, availableSims: [] });

    expect(root.querySelector('.skip-link')?.textContent).toBe('Vai al contenuto');
    const nav = root.querySelector('nav[aria-label="Navigazione principale"]')!;
    expect(nav.textContent).toContain('Teoria');
    expect(nav.textContent).toContain('Simulatori');
    expect(nav.textContent).not.toContain('Interrogazione');
    expect(nav.querySelectorAll('.nav__section')).toHaveLength(2);
    expect(nav.querySelectorAll('.nav__item--soon')).toHaveLength(SIM_IDS.length);
    expect(root.querySelector('h1')?.textContent).toBe('Teoria');
    expect(root.querySelectorAll('.theory-index .card')).toHaveLength(2);

    await go('#/teoria/01-a');
    expect(root.querySelector('main h1')?.textContent).toBe('Primo');
    expect(root.querySelector('.toc')?.textContent).toContain('In breve');
    expect(root.querySelector('.pager__link--next')?.getAttribute('href')).toBe('#/teoria/02-b');
    expect(root.querySelector('.prose a')?.getAttribute('href')).toBe('#/teoria/02-b');
    // A leftover `slideRefs` frontmatter key is ignored: no slide chips anywhere.
    expect(root.querySelector('.chip, .chips')).toBeNull();
    expect(root.querySelector('main')?.textContent).not.toMatch(/slide/i);
    expect(root.querySelector('a[aria-current=page]')?.textContent).toContain('Primo');
    expect(document.title).toBe('Primo — KERS Lab');
    expect(document.activeElement?.tagName).toBe('H1');

    await go('#/sim');
    expect(root.querySelectorAll('.sim-index .card--soon')).toHaveLength(SIM_IDS.length);
    expect(root.querySelector('.sim-index')?.textContent).toContain('In arrivo');

    await go('#/sim/faraday');
    expect(root.querySelector('main h1')?.textContent).toContain(
      'Flusso e legge di Faraday-Neumann',
    );
    expect(root.querySelector('.sim-scene')).not.toBeNull();
    expect(root.querySelector('.sim-placeholder')?.textContent).toBe('In arrivo');

    // The Interrogazione mode was removed in v0.5.0: its old route redirects to Teoria.
    await go('#/interrogazione');
    expect(window.location.hash).toBe('#/teoria');
    expect(root.querySelector('main h1')?.textContent).toBe('Teoria');

    await go('#/teoria/99-nope');
    expect(root.querySelector('main')?.textContent).toContain('Sezione di teoria non trovata.');
  });

  it('theme toggle flips data-theme, persists, notifies, and ctx.theme is live', () => {
    const root = document.createElement('div');
    app = createApp(root, { theory: [], availableSims: [] });
    const ctx = createAppContext();
    const seen: string[] = [];
    const off = onThemeChange((th) => seen.push(th));
    const before = document.documentElement.dataset['theme'];
    root.querySelector<HTMLButtonElement>('.theme-toggle')!.click();
    const after = document.documentElement.dataset['theme'];
    expect(after).not.toBe(before);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(after);
    expect(ctx.theme).toBe(after);
    expect(seen).toEqual([after]);
    expect(root.querySelector('.theme-toggle')?.textContent).toMatch(/Passa al tema/);
    toggleTheme();
    off();
  });
});
