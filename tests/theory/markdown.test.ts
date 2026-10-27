import { describe, expect, it } from 'vitest';
import { renderMarkdown, rewriteTheoryLink, slugify } from '../../src/theory/markdown';

describe('renderMarkdown', () => {
  it('renders inline and display math with KaTeX (MathML included)', () => {
    const r = renderMarkdown(
      'Flusso $\\Phi_B = B S \\cos\\alpha$.\n\n$$\n\\varepsilon = -\\frac{\\Delta\\Phi}{\\Delta t}\n$$\n',
    );
    expect(r.mathErrors).toEqual([]);
    expect(r.html).toContain('class="math-inline"');
    expect(r.html).toContain('class="math-display"');
    expect(r.html).toContain('katex-display');
    expect(r.html).toContain('<math');
  });

  it('keeps Markdown from mangling math (underscores, asterisks)', () => {
    const r = renderMarkdown('$a_1 * b_2 * c_3$ e _corsivo_');
    expect(r.html).toContain('<em>corsivo</em>');
    expect(r.html).not.toContain('<em>1');
    expect(r.mathErrors).toEqual([]);
  });

  it('supports the Italian decimal comma {,} inside math', () => {
    const r = renderMarkdown('$I = 62{,}5\\ \\mathrm{mA}$');
    expect(r.mathErrors).toEqual([]);
    expect(r.html).toContain('62');
  });

  it('does not treat prices / lone dollars as math', () => {
    const r = renderMarkdown('Costa 5$ oppure 10 $ e basta');
    expect(r.html).not.toContain('katex');
  });

  it('shows invalid TeX inline in a visible error style and reports it', () => {
    const r = renderMarkdown('Prima $\\frac{1}{$ dopo');
    expect(r.mathErrors).toHaveLength(1);
    expect(r.html).toContain('class="math-error"');
    expect(r.html).toContain('Errore nella formula');
    expect(r.html).toContain('dopo');
  });

  it('never enables KaTeX trust (no \\href / \\htmlClass output)', () => {
    const r = renderMarkdown('$\\href{javascript:alert(1)}{x}$');
    expect(r.html).not.toMatch(/href="javascript:/);
    expect(r.html).not.toContain('<a ');
  });

  it('gives headings unique ids and builds the TOC from ## headings', () => {
    const r = renderMarkdown(
      '## In breve\n\ntesto\n\n### Dettaglio\n\n## Collegamento con KERS / MGU-K\n\n## In breve\n',
    );
    expect(r.toc.map((e) => e.id)).toEqual([
      'in-breve',
      'collegamento-con-kers-mgu-k',
      'in-breve-2',
    ]);
    expect(r.toc[1]?.text).toBe('Collegamento con KERS / MGU-K');
    expect(r.html).toContain('<h3 id="dettaglio" tabindex="-1">');
  });

  it('rewrites relative theory links to hash routes and hardens external links', () => {
    const r = renderMarkdown(
      '[Lenz](04-lenz.md) [ext](https://www.fia.com) [bad](javascript:alert(1))',
    );
    expect(r.html).toContain('href="#/teoria/04-lenz"');
    expect(r.html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('bad');
  });

  it('escapes raw HTML and drops images', () => {
    const r = renderMarkdown('<script>alert(1)</script>\n\n![img](http://x/y.png)');
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('<img');
  });
});

describe('helpers', () => {
  it('slugify strips accents and punctuation', () => {
    expect(slugify('Perché è così?')).toBe('perche-e-cosi');
    expect(slugify('***')).toBe('sezione');
  });

  it('rewriteTheoryLink', () => {
    expect(rewriteTheoryLink('03-faraday-neumann.md')).toBe('#/teoria/03-faraday-neumann');
    expect(rewriteTheoryLink('./10-kers-mguk.md#x')).toBe('#/teoria/10-kers-mguk');
    expect(rewriteTheoryLink('https://example.org/a.md')).toBe('https://example.org/a.md');
  });
});
