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

/** Fill `target` with rich text and return it. */
export function setRich<T extends HTMLElement>(target: T, s: string): T {
  target.innerHTML = richHtml(s);
  return target;
}
