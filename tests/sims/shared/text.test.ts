// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// uPlot (pulled in by the UI barrel) reads matchMedia at import time; jsdom lacks it.
vi.hoisted(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

import { createSlider } from '../../../src/ui';
import { singularTurnsScale } from '../../../src/sims/shared/turns';

describe('singularTurnsScale (QA-016)', () => {
  it('turns "1 spire" into "1 spira" and leaves plurals alone', () => {
    const s = createSlider({
      spec: { min: 1, max: 500, step: 1, default: 50, unit: 'spire', labelIT: 'Numero di spire N' },
      onInput: () => {},
    });
    singularTurnsScale(s.element);
    const scale = [...s.element.querySelectorAll('.slider__scale span')].map((x) =>
      (x.textContent ?? '').replace(/\u00A0/g, ' '),
    );
    expect(scale).toEqual(['1 spira', '500 spire']);
    s.dispose();
  });
});

/** Italian string literals in the sims: no ASCII pseudo-notation, one apostrophe style. */
describe('sim UI strings (QA-016)', () => {
  const root = join(__dirname, '../../../src/sims');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(root, f));

  /** Quoted literals, minus KaTeX sources (`tex`/`symbolTex` values contain backslashes or `_{`). */
  function literals(src: string): string[] {
    const out: string[] = [];
    for (const line of src.split('\n')) {
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
      if (/\b(tex|symbolTex|Tex)\b\s*[:=(]/.test(line) || line.includes('\\\\')) continue;
      for (const m of line.matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(m[1] ?? m[2] ?? '');
    }
    return out;
  }

  it('no Φ_B / P_max / R_w style subscripts or 10^- exponents in sim strings', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const s of literals(readFileSync(f, 'utf8'))) {
        if (/[A-Za-zΦτΔ]_[A-Za-z0-9]/.test(s) && /\s/.test(s)) bad.push(`${f}: ${s}`);
        if (/10\^/.test(s)) bad.push(`${f}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('uses the typographic apostrophe in Italian text', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/"([^"]*[a-zà-ù]'[a-zà-ùA-Z][^"]*)"/g))
        bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
});
