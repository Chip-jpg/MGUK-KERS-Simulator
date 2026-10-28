import { escapeHtml } from '../ui/dom';
import { renderTex } from '../ui/math';

/** Split Italian text with inline `$…$` TeX into segments (pure, testable). */
export function splitMath(s: string): Array<{ math: boolean; text: string }> {
  const out: Array<{ math: boolean; text: string }> = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ math: false, text: s.slice(last, m.index) });
    out.push({ math: true, text: m[1] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ math: false, text: s.slice(last) });
  return out;
}

/** HTML for text with inline math (text escaped, TeX via KaTeX with trust:false). */
export function richHtml(s: string): string {
  return splitMath(s)
    .map((p) => (p.math ? renderTex(p.text).html : escapeHtml(p.text)))
    .join('');
}

/**
 * Plain-text reading of an element filled by `setRich`: normal text as is, KaTeX
 * replaced by the tokens of its MathML (no TeX annotation, no visual HTML copy),
 * e.g. "$L = R\,i$" → "L = R i". Used as an explicit accessible name where axe-core
 * cannot derive one from KaTeX output (it ignores MathML content, so a label made
 * only of a formula counts as empty).
 */
export function plainText(node: Element): string {
  const parts: string[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === 3) {
      parts.push(n.textContent ?? '');
      return;
    }
    if (!(n instanceof Element)) return;
    if (n.classList.contains('katex-html') || n.localName === 'annotation') return;
    if (n.localName === 'math') {
      const tokens: string[] = [];
      for (const leaf of n.querySelectorAll('mi, mn, mo, mtext, ms')) {
        const s = leaf.textContent?.trim();
        if (s) tokens.push(s);
      }
      parts.push(tokens.join(' '));
      return;
    }
    n.childNodes.forEach(walk);
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Fill `target` with rich text and return it. */
export function setRich<T extends HTMLElement>(target: T, s: string): T {
  target.innerHTML = richHtml(s);
  return target;
}
