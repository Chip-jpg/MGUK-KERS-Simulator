import { FrontmatterError, parseFrontmatter, type FrontmatterValue } from './frontmatter';

/**
 * Theory content loader. Files are bundled at build time (offline-first):
 * `content/theory/*.md` (A2) via `import.meta.glob(…, { query: '?raw', eager: true })`.
 *
 * Test/screenshot fallback: when `content/theory/` has no Markdown file AND the
 * build sets `VITE_THEORY_FIXTURES=true` (only the Playwright webServer does),
 * the two fixtures in `tests/fixtures/theory/` are used instead. Production
 * builds never include them.
 */

export type TheoryLevel = 'base' | 'approfondimento';

export interface TheoryDoc {
  /** Route id (`#/teoria/<id>`), e.g. `03-faraday-neumann`. */
  id: string;
  titleIT: string;
  goal?: string;
  order: number;
  level: TheoryLevel;
  /** Markdown body without frontmatter. */
  body: string;
  /** Source path (for error messages). */
  path: string;
}

export interface TheoryLoadResult {
  /** Valid documents sorted by `order` (then id). */
  docs: TheoryDoc[];
  /** One message per invalid file (the file is skipped). */
  errors: string[];
}

function fileSlug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

function asString(v: FrontmatterValue | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/**
 * Validate one file against the frontmatter schema (`id?`, `titleIT`, `order`,
 * `level?`, `goal?`). Throws on error. Since v0.5.0 slide references are not part
 * of the schema: a leftover `slideRefs` key is ignored (never rendered).
 */
export function toTheoryDoc(path: string, source: string): TheoryDoc {
  const { data, body } = parseFrontmatter(source);
  const slug = fileSlug(path);
  const id = asString(data['id']) ?? slug;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new FrontmatterError(`id non valido "${id}"`);
  const titleIT = asString(data['titleIT']);
  if (!titleIT) throw new FrontmatterError('titleIT mancante');
  const order = data['order'];
  if (typeof order !== 'number') throw new FrontmatterError('order mancante o non intero');
  const level = data['level'] ?? 'base';
  if (level !== 'base' && level !== 'approfondimento') {
    throw new FrontmatterError('level deve essere "base" o "approfondimento"');
  }
  const goal = asString(data['goal']);
  return {
    id,
    titleIT,
    ...(goal ? { goal } : {}),
    order,
    level,
    body,
    path,
  };
}

/** Parse and sort a `{ path: rawMarkdown }` map (the `import.meta.glob` result). */
export function loadTheory(sources: Record<string, string>): TheoryLoadResult {
  const docs: TheoryDoc[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [path, source] of Object.entries(sources)) {
    try {
      const doc = toTheoryDoc(path, source);
      if (seen.has(doc.id)) throw new FrontmatterError(`id duplicato "${doc.id}"`);
      seen.add(doc.id);
      docs.push(doc);
    } catch (err) {
      errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  docs.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { docs, errors };
}

const CONTENT = import.meta.glob<string>('/content/theory/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function bundledSources(): Record<string, string> {
  if (Object.keys(CONTENT).length > 0) return CONTENT;
  if (import.meta.env.VITE_THEORY_FIXTURES === 'true') {
    return import.meta.glob<string>('/tests/fixtures/theory/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
  }
  return {};
}

let cache: TheoryLoadResult | null = null;

/** All bundled theory documents (memoised). Never throws; 0 files → empty list. */
export function getTheory(): TheoryLoadResult {
  if (!cache) {
    cache = loadTheory(bundledSources());
    for (const e of cache.errors) console.warn(`[teoria] ${e}`);
  }
  return cache;
}

/** Find a document by route id (also accepts the file slug). */
export function findTheoryDoc(docs: readonly TheoryDoc[], id: string): TheoryDoc | undefined {
  return docs.find((d) => d.id === id) ?? docs.find((d) => fileSlug(d.path) === id);
}

/** Previous / next documents by `order`. */
export function neighbours(
  docs: readonly TheoryDoc[],
  doc: TheoryDoc,
): { prev?: TheoryDoc; next?: TheoryDoc } {
  const i = docs.indexOf(doc);
  const prev = i > 0 ? docs[i - 1] : undefined;
  const next = i >= 0 && i < docs.length - 1 ? docs[i + 1] : undefined;
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}
