import type { Disposable } from './types';

/**
 * Hash-based routes (works on GitHub Pages and from file:// without server
 * rewrites):
 *   #/teoria            theory index (default)
 *   #/teoria/<id>       theory section, <id> = theory file id
 *   #/sim               simulator index
 *   #/sim/<id>          simulator page
 * Any other hash (including the removed `#/interrogazione`) maps to the default
 * route `#/teoria`.
 */
export type Route = { kind: 'teoria'; id?: string } | { kind: 'sim'; id?: string };

export const DEFAULT_ROUTE: Route = { kind: 'teoria' };
export const DEFAULT_HASH = '#/teoria';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Parse a location hash into a {@link Route}. Unknown hashes map to the default route. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#?\/?/, '').replace(/\/+$/, '');
  const [head, id, ...rest] = path.split('/');
  if (rest.length > 0) return DEFAULT_ROUTE;
  const validId = id !== undefined && ID_RE.test(id) ? id : undefined;
  if (id !== undefined && validId === undefined) return DEFAULT_ROUTE;
  switch (head) {
    case 'teoria':
      return validId ? { kind: 'teoria', id: validId } : { kind: 'teoria' };
    case 'sim':
      return validId ? { kind: 'sim', id: validId } : { kind: 'sim' };
    default:
      return DEFAULT_ROUTE;
  }
}

/** Build the hash for a {@link Route}. Inverse of {@link parseRoute}. */
export function formatRoute(route: Route): string {
  return route.id ? `#/${route.kind}/${route.id}` : `#/${route.kind}`;
}

export function routesEqual(a: Route, b: Route): boolean {
  return formatRoute(a) === formatRoute(b);
}

/** Minimal window surface the router needs (injectable for tests). */
export interface RouterWindow {
  location: { hash: string };
  addEventListener(type: 'hashchange', cb: () => void): void;
  removeEventListener(type: 'hashchange', cb: () => void): void;
}

export interface Router extends Disposable {
  current(): Route;
  navigate(route: Route): void;
}

/**
 * Start listening to `hashchange`, call `onChange` immediately with the current
 * route and on every route change. A hash that is not the canonical form of its
 * route (empty, unknown such as the removed `#/interrogazione`, trailing slash…)
 * is rewritten to the canonical hash, so unknown routes redirect to
 * {@link DEFAULT_HASH}. The rewrite's own `hashchange` does not re-render.
 */
export function createRouter(onChange: (route: Route) => void, win: RouterWindow = window): Router {
  const canonicalize = (): Route => {
    const next = parseRoute(win.location.hash);
    const hash = formatRoute(next);
    if (win.location.hash !== hash) win.location.hash = hash;
    return next;
  };
  let route = canonicalize();
  const handler = (): void => {
    const next = canonicalize();
    if (routesEqual(next, route)) return;
    route = next;
    onChange(route);
  };
  win.addEventListener('hashchange', handler);
  onChange(route);
  return {
    current: () => route,
    navigate(next) {
      const hash = formatRoute(next);
      if (win.location.hash !== hash) win.location.hash = hash;
    },
    dispose() {
      win.removeEventListener('hashchange', handler);
    },
  };
}
