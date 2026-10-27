import katex from 'katex';
import 'katex/dist/katex.min.css';
import { escapeHtml } from './dom';

/**
 * KaTeX rendering shared by the theory renderer and `FormulaPanel`.
 * Security (DECISIONS D3): `trust: false` always; `throwOnError: false` so a bad
 * formula never breaks the page — it is shown inline with the `.math-error` style.
 */

export interface TexResult {
  html: string;
  /** Parse error message, if the formula is invalid. */
  error?: string;
}

const OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  output: 'htmlAndMathml',
};

const KATEX_ERROR_RE = /<span class="katex-error" title="([^"]*)"/;

function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function errorHtml(inner: string, message: string, displayMode: boolean): string {
  const tag = displayMode ? 'div' : 'span';
  return (
    `<${tag} class="math-error" role="note" title="${escapeHtml(message)}">` +
    `<span class="math-error__label">Errore nella formula:</span> ${inner}</${tag}>`
  );
}

/** Render TeX to an HTML string; invalid TeX becomes a visible inline error. */
export function renderTex(tex: string, displayMode = false): TexResult {
  let html: string;
  try {
    html = katex.renderToString(tex, { ...OPTIONS, displayMode });
  } catch (err) {
    // Non-parse errors still throw with throwOnError:false.
    const message = err instanceof Error ? err.message : String(err);
    return {
      html: errorHtml(`<code>${escapeHtml(tex)}</code>`, message, displayMode),
      error: message,
    };
  }
  const m = KATEX_ERROR_RE.exec(html);
  if (m) {
    const message = decodeAttr(m[1] ?? 'KaTeX error');
    return { html: errorHtml(html, message, displayMode), error: message };
  }
  return { html };
}

/** Render TeX into an element (replaces its content). Returns the error, if any. */
export function renderTexInto(
  target: HTMLElement,
  tex: string,
  displayMode = false,
): string | undefined {
  const r = renderTex(tex, displayMode);
  target.innerHTML = r.html;
  return r.error;
}
