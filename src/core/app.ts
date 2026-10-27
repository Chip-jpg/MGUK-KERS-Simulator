import { formatIT } from './format';
import { t } from './i18n/it';
import { loadSimModules, registry } from './registry';
import { createRouter, formatRoute, type Route } from './router';
import { getTheme, initTheme, prefersReducedMotion, toggleTheme } from './theme';
import type { AppContext, Disposable } from './types';

/**
 * Minimal app shell (A0). A3 replaces the markup/styling with the real sidebar,
 * theory renderer and simulator layout; the wiring (registry → router → mount →
 * dispose on navigation) is the part other tasks rely on.
 */
export function createAppContext(): AppContext {
  return {
    theme: getTheme(),
    reducedMotion: prefersReducedMotion(),
    formatIT,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function navLink(label: string, route: Route): HTMLAnchorElement {
  return el('a', { href: formatRoute(route), textContent: label });
}

export function createApp(root: HTMLElement): Disposable {
  initTheme();
  loadSimModules();

  const main = el('main', { id: 'contenuto', tabIndex: -1 });
  const themeButton = el('button', { type: 'button', textContent: t.theme.toggle });
  const onThemeClick = (): void => {
    toggleTheme();
  };
  themeButton.addEventListener('click', onThemeClick);

  const header = el('header', {}, [
    el('h1', { textContent: t.app.name }),
    el('p', { textContent: t.app.tagline }),
    el('nav', { ariaLabel: t.nav.label }, [
      navLink(t.nav.theory, { kind: 'teoria' }),
      ' · ',
      navLink(t.nav.simulators, { kind: 'sim' }),
      ' · ',
      navLink(t.nav.quiz, { kind: 'interrogazione' }),
    ]),
    themeButton,
  ]);
  root.replaceChildren(header, main);

  let current: Disposable | null = null;

  const render = (route: Route): void => {
    current?.dispose();
    current = null;
    main.replaceChildren();
    switch (route.kind) {
      case 'teoria':
        main.append(
          el('h2', { textContent: t.theory.indexTitle }),
          el('p', { textContent: t.theory.indexIntro }),
        );
        break;
      case 'sim': {
        const sim = route.id ? registry.get(route.id) : undefined;
        if (sim) {
          const host = el('section', { ariaLabel: sim.titleIT });
          main.append(host);
          current = sim.mount(host, createAppContext());
        } else {
          main.append(el('h2', { textContent: t.sim.indexTitle }));
          const list = el('ul');
          for (const s of registry.list()) {
            list.append(el('li', {}, [navLink(s.titleIT, { kind: 'sim', id: s.id })]));
          }
          main.append(
            list.childElementCount > 0 ? list : el('p', { textContent: t.sim.notAvailable }),
          );
        }
        break;
      }
      case 'interrogazione':
        main.append(
          el('h2', { textContent: t.quiz.title }),
          el('p', { textContent: t.quiz.comingSoon }),
        );
        break;
    }
  };

  const router = createRouter(render);

  return {
    dispose() {
      router.dispose();
      current?.dispose();
      current = null;
      themeButton.removeEventListener('click', onThemeClick);
      root.replaceChildren();
    },
  };
}
