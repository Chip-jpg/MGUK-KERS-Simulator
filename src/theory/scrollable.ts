/**
 * Keyboard access to display formulas that scroll horizontally (QA-020).
 *
 * `.math-display` has `overflow-x: auto`, so a formula wider than the column
 * becomes a scroll region. WCAG 2.1.1 (axe `scrollable-region-focusable`)
 * requires such a region to be reachable by keyboard. Making every formula
 * focusable would add dozens of useless tab stops, so only the ones that
 * actually overflow get `tabindex="0"`, `role="group"` and a label; the state
 * is re-evaluated whenever a formula's box is resized (window resize, sidebar,
 * font loading). Formulas that fit are left untouched.
 */

/** Accessible name of an overflowing formula (Italian UI text). */
export const SCROLLABLE_MATH_LABEL = 'Formula: scorri orizzontalmente con le frecce';

const MARK = 'data-scrollable';

/** Apply or remove the focusable-region attributes according to the current overflow. */
export function syncScrollable(el: HTMLElement): boolean {
  const overflows = el.scrollWidth > el.clientWidth;
  if (overflows) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', SCROLLABLE_MATH_LABEL);
    el.setAttribute(MARK, '');
  } else if (el.hasAttribute(MARK)) {
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    el.removeAttribute(MARK);
  }
  return overflows;
}

/**
 * Keep every `.math-display` under `root` keyboard-accessible while it overflows.
 * Returns a cleanup function (disconnects the ResizeObserver).
 */
export function watchScrollableMath(root: HTMLElement): () => void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.math-display'));
  blocks.forEach(syncScrollable);
  if (blocks.length === 0 || typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) syncScrollable(entry.target as HTMLElement);
  });
  blocks.forEach((b) => ro.observe(b));
  // KaTeX web fonts can change a formula's width without resizing its box.
  let alive = true;
  void document.fonts?.ready.then(() => {
    if (alive) blocks.forEach(syncScrollable);
  });
  return () => {
    alive = false;
    ro.disconnect();
  };
}
