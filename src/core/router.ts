import type { Disposable } from './types';

/**
 * Hash-based routes (works on GitHub Pages and from file:// without server
 * rewrites):
 *   #/teoria            theory index (default)
 *   #/teoria/<id>       theory section, <id> = theory file id
 *   #/sim               simulator index
 *   #/sim/<id>          simulator page
 *   #/interrogazione    quiz / oral-exam trainer
 */
export type Route =
  { kind: 'teoria'; id?: string } | { kind: 'sim'; id?: string } | { kind: 'interrogazione' };

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
    case 'interrogazione':
      return validId ? DEFAULT_ROUTE : { kind: 'interrogazione' };
    default:
      return DEFAULT_ROUTE;
  }
}

/** Build the hash for a {@link Route}. Inverse of {@link parseRoute}. */
export function formatRoute(route: Route): string {
  if (route.kind === 'interrogazione') return '#/interrogazione';
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
 * route and on every change. An empty hash is normalised to {@link DEFAULT_HASH}.
 */
export function createRouter(onChange: (route: Route) => void, win: RouterWindow = window): Router {
  let route = parseRoute(win.location.hash);
  const handler = (): void => {
    route = parseRoute(win.location.hash);
    onChange(route);
  };
  win.addEventListener('hashchange', handler);
  if (win.location.hash === '' || win.location.hash === '#') win.location.hash = DEFAULT_HASH;
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
