/** Tiny DOM helpers shared by the shell and the UI kit (no framework). */

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  dataset?: Record<string, string>;
}

/**
 * Create an element: `el('div', { class: 'card', attrs: { role: 'note' } }, [child, 'text'])`.
 * Attribute values `false`/`undefined` are skipped, `true` sets an empty attribute.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [k, v] of Object.entries(props.dataset ?? {})) node.dataset[k] = v;
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

/** Escape text for safe interpolation into HTML strings. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let uid = 0;
/** Unique id for label/aria wiring: `uniqueId('slider')` → `slider-3`. */
export function uniqueId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

/** Add a listener and get a remover back (collect them for `dispose()`). */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  cb: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, cb as EventListener, options);
  return () => target.removeEventListener(type, cb as EventListener, options);
}
