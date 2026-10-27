/**
 * Minimal YAML-frontmatter parser for theory files (§4.4). Supports exactly the
 * subset the theory format needs — no YAML dependency:
 *
 *   key: plain string          key: "quoted" / 'quoted'
 *   key: 42                    key: [7, 8, 9]   key: []
 *   key:                       (followed by "  - 7" block-list lines of ints/strings)
 *   # comment lines and blank lines are ignored
 */

export type FrontmatterValue = string | number | Array<number | string>;
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedDocument {
  data: Frontmatter;
  body: string;
}

export class FrontmatterError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `${message} (riga ${line})`);
    this.name = 'FrontmatterError';
  }
}

const FENCE = /^---[ \t]*$/;
const INT = /^[+-]?\d+$/;
const KEY_LINE = /^([A-Za-z_][\w-]*)[ \t]*:(.*)$/;

function unquote(raw: string, line: number): string {
  const v = raw.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'")) {
    if (v[v.length - 1] !== v[0]) throw new FrontmatterError('Stringa non chiusa', line);
    const inner = v.slice(1, -1);
    return v[0] === '"'
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'");
  }
  return v;
}

/** Strip a trailing ` # comment` from an unquoted scalar. */
function stripComment(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') || t.startsWith("'")) return t;
  const i = t.search(/\s#/);
  return i === -1 ? t : t.slice(0, i).trim();
}

function scalar(raw: string, line: number): number | string {
  const v = stripComment(raw);
  if (INT.test(v)) return Number.parseInt(v, 10);
  return unquote(v, line);
}

function inlineArray(raw: string, line: number): Array<number | string> {
  const v = stripComment(raw);
  if (!v.endsWith(']')) throw new FrontmatterError('Lista non chiusa', line);
  const inner = v.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((item) => {
    const s = item.trim();
    if (s === '') throw new FrontmatterError('Elemento vuoto nella lista', line);
    return scalar(s, line);
  });
}

/**
 * Split `--- … ---` frontmatter from the Markdown body. A file without
 * frontmatter yields `{ data: {}, body: source }`.
 */
export function parseFrontmatter(source: string): ParsedDocument {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) return { data: {}, body: text };
  const end = lines.findIndex((l, i) => i > 0 && FENCE.test(l));
  if (end === -1) throw new FrontmatterError('Frontmatter senza "---" di chiusura', 1);

  const data: Frontmatter = {};
  let listKey: string | null = null;
  for (let i = 1; i < end; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? '';
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item) {
      const list = listKey === null ? undefined : data[listKey];
      if (!Array.isArray(list))
        throw new FrontmatterError('Elemento di lista senza chiave', lineNo);
      list.push(scalar(item[1] ?? '', lineNo));
      continue;
    }
    const kv = KEY_LINE.exec(line);
    if (!kv) throw new FrontmatterError(`Riga non valida: "${line.trim()}"`, lineNo);
    const key = kv[1] as string;
    const rawValue = (kv[2] ?? '').trim();
    if (key in data) throw new FrontmatterError(`Chiave duplicata "${key}"`, lineNo);
    listKey = null;
    if (rawValue === '' || rawValue.startsWith('#')) {
      data[key] = [];
      listKey = key;
    } else if (rawValue.startsWith('[')) {
      data[key] = inlineArray(rawValue, lineNo);
    } else {
      data[key] = scalar(rawValue, lineNo);
    }
  }
  const body = lines.slice(end + 1).join('\n');
  return { data, body };
}
