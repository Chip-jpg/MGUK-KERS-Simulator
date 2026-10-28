import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '../../src/core/i18n/it';
import {
  findTheoryDoc,
  getTheory,
  loadTheory,
  neighbours,
  type TheoryDoc,
} from '../../src/theory/content';
import { parseFrontmatter } from '../../src/theory/frontmatter';
import { renderMarkdown } from '../../src/theory/markdown';

function readDir(rel: string): Record<string, string> {
  const dir = new URL(rel, import.meta.url);
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()) {
    out[`/${rel.replace(/^(\.\.\/)+/, '')}${f}`] = readFileSync(new URL(f, dir), 'utf8');
  }
  return out;
}

/** The five fixed headings of every theory file (v0.5.0), in order. */
const HEADINGS = [
  'In breve',
  'Formule',
  'Spiegazione',
  'Esempio numerico',
  'Collegamento con KERS / MGU-K',
] as const;

/** Final theory ids (v0.5.0 frozen interface): 13 renamed, 15/16 removed, 17 → 15. */
const THEORY_IDS = [
  '01-flusso-campo-magnetico',
  '02-esperimenti-e-principio-induzione',
  '03-faraday-neumann',
  '04-lenz',
  '05-autoinduzione-induttanza',
  '06-circuito-rl-energia-campo',
  '07-alternatore-corrente-alternata',
  '08-trasformatore-trasporto-joule',
  '09-motore-elettrico-lorentz',
  '10-kers-mguk',
  '11-agenda-2030-goal-9',
  '12-art-32-costituzione',
  '13-filo-logico',
  '14-glossario',
  '15-dinamica-frenata',
];

/**
 * Structural rules of one theory file (v0.5.0): no `slideRefs` key, zero KaTeX
 * errors, exactly the five fixed headings in order (no Q&A section), no slide
 * mention in the text, and every relative link resolves to an existing section.
 */
function checkTheoryFile(doc: TheoryDoc, raw: string, docs: readonly TheoryDoc[]): void {
  expect(Object.keys(parseFrontmatter(raw).data)).not.toContain('slideRefs');
  const r = renderMarkdown(doc.body);
  expect(r.mathErrors).toEqual([]);
  expect(r.toc.map((e) => e.text)).toEqual([...HEADINGS]);
  expect(doc.body).not.toMatch(/^##\s+Domande/m);
  expect(doc.body).not.toMatch(/\bslides?\b/i);
  for (const m of r.html.matchAll(/href="#\/teoria\/([a-z0-9-]+)"/g)) {
    expect(findTheoryDoc(docs, m[1] as string), `${doc.id} → ${m[1]}`).toBeDefined();
  }
}

describe('loadTheory', () => {
  it('handles zero files', () => {
    expect(loadTheory({})).toEqual({ docs: [], errors: [] });
  });

  it('loads the fixtures, sorted by order, with prev/next', () => {
    const { docs, errors } = loadTheory(readDir('../fixtures/theory/'));
    expect(errors).toEqual([]);
    expect(docs.map((d) => d.id)).toEqual(['01-fixture-flusso', '02-fixture-faraday']);
    const [a, b] = docs;
    expect(b?.goal).toBe('9');
    expect(b?.level).toBe('approfondimento');
    expect(neighbours(docs, a!)).toEqual({ next: b });
    expect(neighbours(docs, b!)).toEqual({ prev: a });
    expect(findTheoryDoc(docs, '02-fixture-faraday')).toBe(b);
  });

  it('the fixtures follow the v0.5.0 format (five headings, no Q&A, no slideRefs)', () => {
    const raw = readDir('../fixtures/theory/');
    const { docs } = loadTheory(raw);
    for (const d of docs) checkTheoryFile(d, raw[d.path] as string, docs);
  });

  it('skips invalid files and reports why', () => {
    const { docs, errors } = loadTheory({
      '/c/01-ok.md': '---\ntitleIT: Ok\norder: 1\n---\n',
      '/c/02-no-title.md': '---\norder: 2\n---\n',
      '/c/03-bad-level.md': '---\ntitleIT: X\norder: 3\nlevel: avanzato\n---\n',
      '/c/04-no-order.md': '---\ntitleIT: X\n---\n',
      '/c/05-dup.md': '---\nid: 01-ok\ntitleIT: X\norder: 5\n---\n',
    });
    expect(docs.map((d) => d.id)).toEqual(['01-ok']);
    expect(docs[0]?.level).toBe('base');
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/titleIT mancante/);
  });

  it('slideRefs is optional and ignored when present (no longer part of the schema)', () => {
    const { docs, errors } = loadTheory({
      '/c/01-none.md': '---\ntitleIT: A\norder: 1\n---\n',
      '/c/02-left.md': '---\ntitleIT: B\norder: 2\nslideRefs: [7, 8]\n---\n',
    });
    expect(errors).toEqual([]);
    expect(docs.map((d) => d.id)).toEqual(['01-none', '02-left']);
    for (const d of docs) expect(d).not.toHaveProperty('slideRefs');
  });

  it('the i18n heading list matches the five fixed headings', () => {
    expect([...t.theory.headings]).toEqual([...HEADINGS]);
  });
});

/*
 * The checks below read the real `content/theory/` (owned by the content agent).
 * They encode the v0.5.0 rules and fail until the renamed/cleaned files land.
 */
describe('bundled content/theory renders cleanly (v0.5.0 rules)', () => {
  const real = readDir('../../content/theory/');
  const { docs, errors } = loadTheory(real);

  it('every file has valid frontmatter and matches the bundled loader', () => {
    expect(errors).toEqual([]);
    expect(docs).toHaveLength(Object.keys(real).length);
    expect(getTheory().docs.map((d) => d.id)).toEqual(docs.map((d) => d.id));
  });

  it('has exactly the final fifteen sections, in order', () => {
    expect(docs.map((d) => d.id)).toEqual(THEORY_IDS);
    expect(docs.map((d) => d.order)).toEqual(THEORY_IDS.map((_, i) => i + 1));
  });

  it.each(docs.map((d) => [d.id, d] as const))(
    '%s: no slideRefs, zero KaTeX errors, five headings in order, no Q&A, links resolve',
    (_id, doc) => {
      checkTheoryFile(doc, real[doc.path] as string, docs);
    },
  );
});
