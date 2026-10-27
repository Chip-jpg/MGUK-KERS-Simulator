import { describe, expect, it } from 'vitest';
import { FrontmatterError, parseFrontmatter } from '../../src/theory/frontmatter';

describe('parseFrontmatter', () => {
  it('parses strings, ints, inline and block int arrays', () => {
    const src = [
      '---',
      'id: 10-kers-mguk',
      "titleIT: KERS e MGU-K - recupero dell'energia in frenata",
      'slideRefs: [8, 11, 17]',
      "goal: '9'",
      'order: 10',
      'level: approfondimento',
      'empty: []',
      'block:',
      '  - 7',
      '  - 8',
      '# a comment',
      '---',
      '',
      '## In breve',
    ].join('\n');
    const { data, body } = parseFrontmatter(src);
    expect(data).toEqual({
      id: '10-kers-mguk',
      titleIT: "KERS e MGU-K - recupero dell'energia in frenata",
      slideRefs: [8, 11, 17],
      goal: '9',
      order: 10,
      level: 'approfondimento',
      empty: [],
      block: [7, 8],
    });
    expect(body).toBe('\n## In breve');
  });

  it('handles double quotes, CRLF, BOM and trailing comments', () => {
    const src = '﻿---\r\ntitleIT: "Titolo: con due punti"\r\norder: 3 # terzo\r\n---\r\ntesto';
    const { data, body } = parseFrontmatter(src);
    expect(data).toEqual({ titleIT: 'Titolo: con due punti', order: 3 });
    expect(body).toBe('testo');
  });

  it('returns the whole source as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Solo testo')).toEqual({ data: {}, body: '# Solo testo' });
  });

  it.each([
    ['---\nid: x\n', /chiusura/],
    ['---\nnot a pair\n---\n', /Riga non valida/],
    ['---\na: 1\na: 2\n---\n', /duplicata/],
    ['---\na: [1, 2\n---\n', /non chiusa/],
    ['---\n  - 7\n---\n', /senza chiave/],
    ['---\na: "aperta\n---\n', /non chiusa/],
  ])('rejects malformed frontmatter %#', (src, msg) => {
    expect(() => parseFrontmatter(src)).toThrow(FrontmatterError);
    expect(() => parseFrontmatter(src)).toThrow(msg);
  });
});
