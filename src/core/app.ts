import '../styles/index.css';
import { getTheory, findTheoryDoc, type TheoryDoc } from '../theory/content';
import { renderTheoryIndex, renderTheoryPage } from '../theory/page';
import { getQuality, onQualityChange, setQuality, type QualityTier } from '../render/quality';
import { createSegmented } from '../ui/controls';
import { el, listen } from '../ui/dom';
import { createSimHeader, createSimLayout } from '../ui/simLayout';
import { formatIT } from './format';
import { t } from './i18n/it';
import { availableSimIds, isSimId, loadSim, SIM_IDS, type SimId } from './registry';
import { createRouter, formatRoute, routesEqual, type Route } from './router';
import { currentTheme, initTheme, onThemeChange, prefersReducedMotion, toggleTheme } from './theme';
import type { AppContext, Disposable } from './types';

/**
 * App shell (A3): skip link, sidebar (Teoria / Simulatori + theme toggle), and
 * the route → page wiring. Simulators are lazy-loaded chunks; the previous page
 * is always disposed before the next one renders.
 */

/**
 * Context handed to `SimModule.mount`. `theme` and `reducedMotion` are live
 * getters, so a sim always reads the current value (use `onThemeChange` to react).
 */
export function createAppContext(): AppContext {
  return {
    get theme() {
      return currentTheme();
    },
    get reducedMotion() {
      return prefersReducedMotion();
    },
    formatIT,
  };
}

const noop: Disposable = { dispose() {} };

export interface AppOptions {
  /** Theory documents (default: bundled `content/theory`). Injectable for tests. */
  theory?: readonly TheoryDoc[];
  /** Simulator ids that exist (default: discovered `src/sims/*`). */
  availableSims?: readonly SimId[];
}

export function createApp(root: HTMLElement, options: AppOptions = {}): Disposable {
  initTheme();
  const html = document.documentElement;
  html.dataset['reducedMotion'] = String(prefersReducedMotion());
  const docs = options.theory ?? getTheory().docs;
  const available = new Set<string>(options.availableSims ?? availableSimIds());
  const offs: Array<() => void> = [];

  // --- skeleton -------------------------------------------------------------
  const main = el('main', { class: 'main', attrs: { id: 'contenuto', tabindex: -1 } });
  const skip = el('button', {
    class: 'skip-link',
    text: t.app.skipToContent,
    attrs: { type: 'button' },
  });
  offs.push(
    listen(skip, 'click', () => {
      const target = main.querySelector<HTMLElement>('h1[tabindex]') ?? main;
      target.focus();
    }),
  );

  const navLinks: Array<{ a: HTMLAnchorElement; route: Route }> = [];
  const link = (route: Route, children: (Node | string)[], cls: string): HTMLAnchorElement => {
    const a = el('a', { class: cls, attrs: { href: formatRoute(route) } }, children);
    navLinks.push({ a, route });
    return a;
  };

  const theoryItems = el('ul', { class: 'nav__list', attrs: { 'aria-label': t.nav.theoryList } });
  for (const d of docs) {
    theoryItems.append(
      el('li', {}, [
        link(
          { kind: 'teoria', id: d.id },
          [
            el('span', { class: 'nav__num', text: String(d.order).padStart(2, '0') }),
            el('span', { text: d.titleIT }),
          ],
          'nav__item',
        ),
      ]),
    );
  }
  const simItems = el('ul', { class: 'nav__list', attrs: { 'aria-label': t.nav.simList } });
  for (const id of SIM_IDS) {
    const title = t.sim.titles[id];
    simItems.append(
      el('li', {}, [
        available.has(id)
          ? link({ kind: 'sim', id }, [title], 'nav__item')
          : link(
              { kind: 'sim', id },
              [
                el('span', { text: title }),
                el('span', { class: 'badge badge--small', text: t.app.comingSoon }),
              ],
              'nav__item nav__item--soon',
            ),
      ]),
    );
  }

  const themeButton = el('button', {
    class: 'theme-toggle btn btn--ghost',
    attrs: { type: 'button' },
  });
  const syncThemeButton = (): void => {
    const dark = currentTheme() === 'dark';
    themeButton.replaceChildren(
      el('span', { class: 'btn__icon', text: dark ? '☀' : '☾', attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: dark ? t.theme.switchToLight : t.theme.switchToDark }),
    );
  };
  offs.push(listen(themeButton, 'click', () => toggleTheme()));
  offs.push(onThemeChange(syncThemeButton));

  // Graphics quality (D14): applies live to the open simulator, persisted.
  const quality = createSegmented<QualityTier>({
    labelIT: t.render.quality,
    options: [
      { value: 'alta', labelIT: t.render.qualityAlta },
      { value: 'bilanciata', labelIT: t.render.qualityBilanciata },
      { value: 'base', labelIT: t.render.qualityBase },
    ],
    value: getQuality(),
    onChange: (v) => setQuality(v),
  });
  quality.element.classList.add('quality-control');
  quality.element.title = t.render.qualityHint;
  offs.push(() => quality.dispose());
  offs.push(onQualityChange((v) => quality.set(v)));

  const sidebar = el('aside', { class: 'sidebar' }, [
    el('div', { class: 'brand' }, [
      el('a', {
        class: 'brand__name',
        text: t.app.name,
        attrs: { href: formatRoute({ kind: 'teoria' }) },
      }),
      el('p', { class: 'brand__tagline', text: t.app.tagline }),
    ]),
    el('div', { class: 'sidebar__theme' }, [themeButton, quality.element]),
    el('nav', { class: 'nav', attrs: { 'aria-label': t.nav.label } }, [
      el('ul', { class: 'nav__sections' }, [
        el('li', {}, [
          link({ kind: 'teoria' }, [t.nav.theory], 'nav__section'),
          docs.length > 0 ? theoryItems : null,
        ]),
        el('li', {}, [link({ kind: 'sim' }, [t.nav.simulators], 'nav__section'), simItems]),
      ]),
    ]),
  ]);
  syncThemeButton();

  root.replaceChildren(skip, el('div', { class: 'shell' }, [sidebar, main]));

  // --- pages ----------------------------------------------------------------
  let current: Disposable = noop;
  let token = 0;
  let firstRender = true;

  const page = (): HTMLElement => {
    const p = el('div', { class: 'page' });
    main.replaceChildren(p);
    return p;
  };

  const message = (title: string, text: string, back = true): void => {
    const p = page();
    p.append(
      el('header', { class: 'page-header' }, [
        el('h1', { class: 'page-title', text: title, attrs: { tabindex: -1 } }),
      ]),
      el('p', { class: 'empty-state', text }),
    );
    if (back) {
      p.append(
        el('p', {}, [
          el('a', { text: t.errors.backHome, attrs: { href: formatRoute({ kind: 'teoria' }) } }),
        ]),
      );
    }
  };

  const focusHeading = (): void => {
    if (firstRender) return;
    const h = main.querySelector<HTMLElement>('h1[tabindex]');
    (h ?? main).focus({ preventScroll: true });
  };

  const setTitle = (title?: string): void => {
    document.title = title ? `${title} — ${t.app.name}` : t.app.documentTitle;
  };

  const renderSimIndex = (myToken: number): void => {
    const p = page();
    const cards = el('ul', { class: 'card-list sim-index' });
    p.append(
      el('header', { class: 'page-header' }, [
        el('h1', { class: 'page-title', text: t.sim.indexTitle, attrs: { tabindex: -1 } }),
        el('p', { class: 'lead', text: t.sim.indexIntro }),
      ]),
      cards,
    );
    for (const id of SIM_IDS) {
      const title = t.sim.titles[id];
      if (!available.has(id)) {
        cards.append(
          el('li', { class: 'card card--soon' }, [
            el('span', { class: 'card__title', text: title }),
            el('span', { class: 'badge', text: t.app.comingSoon }),
          ]),
        );
        continue;
      }
      const summary = el('span', { class: 'card__summary', text: t.app.loading });
      const titleNode = el('span', { class: 'card__title', text: title });
      cards.append(
        el('li', { class: 'card' }, [
          el('a', { class: 'card__link', attrs: { href: formatRoute({ kind: 'sim', id }) } }, [
            titleNode,
            summary,
          ]),
        ]),
      );
      loadSim(id)
        .then((sim) => {
          if (myToken !== token || !sim) return;
          titleNode.textContent = sim.titleIT;
          summary.textContent = sim.summaryIT;
        })
        .catch((err: unknown) => {
          console.error(err);
          if (myToken === token) summary.textContent = t.sim.loadError;
        });
    }
  };

  const renderComingSoonSim = (id: SimId): Disposable => {
    const p = page();
    const host = el('section', { class: 'sim-host', attrs: { 'aria-label': t.sim.titles[id] } });
    p.append(
      createSimHeader(
        { titleIT: t.sim.titles[id], summaryIT: t.sim.comingSoonBody, theoryId: '' },
        t.app.comingSoon,
      ),
      host,
    );
    const layout = createSimLayout(host);
    layout.scene.append(el('p', { class: 'sim-placeholder', text: t.app.comingSoon }));
    layout.controls.append(el('p', { class: 'muted', text: t.sim.notAvailable }));
    return layout;
  };

  const renderSim = async (id: string, myToken: number): Promise<void> => {
    if (!isSimId(id)) {
      message(t.errors.notFound, t.sim.notAvailable);
      return;
    }
    if (!available.has(id)) {
      setTitle(t.sim.titles[id]);
      current = renderComingSoonSim(id);
      return;
    }
    message(t.sim.titles[id], t.app.loading, false);
    try {
      const sim = await loadSim(id);
      if (myToken !== token) return;
      if (!sim) throw new Error(`simulator ${id} missing`);
      setTitle(sim.titleIT);
      const p = page();
      const host = el('section', { class: 'sim-host', attrs: { 'aria-label': sim.titleIT } });
      p.append(createSimHeader(sim), host);
      current = sim.mount(host, createAppContext());
    } catch (err) {
      console.error(err);
      if (myToken === token) message(t.sim.titles[id], t.sim.loadError);
    }
  };

  const render = (route: Route): void => {
    token += 1;
    const myToken = token;
    current.dispose();
    current = noop;
    for (const { a, route: r } of navLinks) {
      if (routesEqual(r, route)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
      const isSectionLink = !('id' in r && r.id);
      a.classList.toggle('is-section-active', isSectionLink && r.kind === route.kind);
    }
    main.scrollTop = 0;
    window.scrollTo?.(0, 0);

    let pending: Promise<void> | null = null;
    switch (route.kind) {
      case 'teoria': {
        if (!route.id) {
          setTitle(t.theory.indexTitle);
          current = renderTheoryIndex(page(), docs);
          break;
        }
        const doc = findTheoryDoc(docs, route.id);
        if (doc) {
          setTitle(doc.titleIT);
          current = renderTheoryPage(page(), doc, docs);
        } else {
          setTitle(t.errors.notFound);
          message(t.errors.notFound, t.theory.notFound);
        }
        break;
      }
      case 'sim':
        if (route.id) pending = renderSim(route.id, myToken);
        else {
          setTitle(t.sim.indexTitle);
          renderSimIndex(myToken);
        }
        break;
    }
    const wasFirst = firstRender;
    if (pending) void pending.then(() => myToken === token && !wasFirst && focusHeading());
    else focusHeading();
    firstRender = false;
  };

  const router = createRouter(render);

  return {
    dispose() {
      router.dispose();
      current.dispose();
      current = noop;
      offs.splice(0).forEach((off) => off());
      root.replaceChildren();
    },
  };
}
