import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/theory/frontmatter';

const DIR = new URL('../../content/theory/', import.meta.url);
const FILES = readdirSync(DIR)
  .filter((f) => /^(0[1-9]|1[0-5])-.*\.md$/.test(f))
  .sort();

describe('theory titles 01–15 (QA-016)', () => {
  it('covers all fifteen theory files', () => {
    expect(FILES).toHaveLength(15);
  });

  it.each(FILES)('%s: titleIT uses the typographic apostrophe ’', (f) => {
    const { data } = parseFrontmatter(readFileSync(new URL(f, DIR), 'utf8'));
    const title = data['titleIT'];
    expect(typeof title).toBe('string');
    expect(String(title).includes("'"), String(title)).toBe(false);
  });
});
