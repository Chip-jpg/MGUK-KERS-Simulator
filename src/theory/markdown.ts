import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import { formatRoute } from '../core/router';
import { escapeHtml } from '../ui/dom';
import { renderTex } from '../ui/math';

/**
 * Markdown → HTML for theory pages: marked 14 + a `$…$` / `$$…$$` KaTeX
 * extension, heading ids, a table of contents from `##` headings, relative
 * `NN-slug.md` links rewritten to hash routes (DECISIONS D5), raw HTML escaped.
 */

export interface TocEntry {
  id: string;
  /** Rendered inline HTML of the heading (may contain KaTeX). */
  html: string;
  /** Plain text of the heading. */
  text: string;
}

export interface RenderedMarkdown {
  html: string;
  /** `##` headings, in order (the page TOC). */
  toc: TocEntry[];
  /** KaTeX error messages (empty when every formula renders). */
  mathErrors: string[];
}

/** URL-safe, accent-free slug: "Collegamento con KERS / MGU-K" → "collegamento-con-kers-mgu-k". */
export function slugify(text: string): string {
  const s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'sezione';
}

/** `03-faraday-neumann.md`, `./03-x.md#y` → `#/teoria/03-x`; anything else unchanged. */
export function rewriteTheoryLink(href: string): string {
  const m = /^(?:\.\/)?(\d{2}-[a-z0-9-]+)\.md(?:#.*)?$/.exec(href);
  return m?.[1] ? formatRoute({ kind: 'teoria', id: m[1] }) : href;
}

const SAFE_URL = /^(https?:|mailto:|#\/)/i;

function plainText(tokens: Tokens.Generic[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      if (t.type === 'inlineMath') return String(t['text'] ?? '');
      if (Array.isArray(t.tokens)) return plainText(t.tokens as Tokens.Generic[]);
      return String(t['text'] ?? t.raw ?? '');
    })
    .join('');
}

interface RenderState {
  slugs: Map<string, number>;
  toc: TocEntry[];
  mathErrors: string[];
}

function createMarked(state: () => RenderState): Marked {
  const tex = (src: string, display: boolean): string => {
    const r = renderTex(src, display);
    if (r.error) state().mathErrors.push(`${r.error} — in: ${src}`);
    return r.html;
  };

  const blockMath: TokenizerAndRendererExtension = {
    name: 'blockMath',
    level: 'block',
    start: (src) => /^ {0,3}\$\$/m.exec(src)?.index,
    tokenizer(src) {
      const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
      if (!m) return undefined;
      return { type: 'blockMath', raw: m[0], text: (m[1] ?? '').trim() };
    },
    renderer: (token) => `<div class="math-display">${tex(String(token['text']), true)}</div>\n`,
  };

  const inlineMath: TokenizerAndRendererExtension = {
    name: 'inlineMath',
    level: 'inline',
    start(src) {
      const m = /(?<!\\)\$/.exec(src);
      return m?.index;
    },
    tokenizer(src) {
      const display = /^\$\$((?:\\[\s\S]|[^\\$])+?)\$\$/.exec(src);
      if (display) {
        return {
          type: 'inlineMath',
          raw: display[0],
          text: (display[1] ?? '').trim(),
          display: true,
        };
      }
      // $…$: no whitespace just inside the delimiters, not followed by a digit ("5$").
      const m = /^\$(?!\s)((?:\\[\s\S]|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
      if (!m) return undefined;
      return { type: 'inlineMath', raw: m[0], text: m[1] ?? '', display: false };
    },
    renderer: (token) =>
      token['display']
        ? `<span class="math-display math-display--inline">${tex(String(token['text']), true)}</span>`
        : `<span class="math-inline">${tex(String(token['text']), false)}</span>`,
  };

  return new Marked({
    gfm: true,
    extensions: [blockMath, inlineMath],
    renderer: {
      heading(this, token) {
        const inner = this.parser.parseInline(token.tokens);
        const text = plainText(token.tokens as Tokens.Generic[]).trim();
        const s = state();
        const base = slugify(text);
        const n = s.slugs.get(base) ?? 0;
        s.slugs.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n + 1}`;
        if (token.depth === 2) s.toc.push({ id, html: inner, text });
        return `<h${token.depth} id="${id}" tabindex="-1">${inner}</h${token.depth}>\n`;
      },
      link(this, token) {
        const inner = this.parser.parseInline(token.tokens);
        const href = rewriteTheoryLink(token.href.trim());
        if (!SAFE_URL.test(href)) return inner; // drop javascript:, data:, bare #anchors …
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        const external = /^https?:/i.test(href)
          ? ' class="external" target="_blank" rel="noopener noreferrer"'
          : '';
        return `<a href="${escapeHtml(href)}"${title}${external}>${inner}</a>`;
      },
      image(token) {
        // Theory pages are text-only; never load remote images (offline-first).
        return escapeHtml(token.text);
      },
      html(token) {
        // Raw HTML in Markdown is shown as text, never injected.
        return escapeHtml(token.text);
      },
    },
  });
}

let current: RenderState = { slugs: new Map(), toc: [], mathErrors: [] };
const marked = createMarked(() => current);

/** Render a theory Markdown body (frontmatter already removed). Synchronous. */
export function renderMarkdown(md: string): RenderedMarkdown {
  current = { slugs: new Map(), toc: [], mathErrors: [] };
  const html = marked.parse(md, { async: false });
  const out = { html, toc: current.toc, mathErrors: current.mathErrors };
  current = { slugs: new Map(), toc: [], mathErrors: [] };
  return out;
}
