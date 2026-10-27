import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  PALETTES,
  QUANTITIES,
  quantityColorHex,
  relativeLuminance,
  type Palette,
} from '../../src/ui/colors';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

/** Extract `--name: #hex` declarations from the CSS block whose selector list contains `selector`. */
function cssBlock(selector: string): Record<string, string> {
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selectors = (m[1] ?? '').split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    const vars: Record<string, string> = {};
    for (const d of (m[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      vars[d[1] as string] = (d[2] as string).toLowerCase();
    }
    return vars;
  }
  throw new Error(`selector ${selector} not found in tokens.css`);
}

const CSS_NAME: Record<Exclude<keyof Palette, 'quantity'>, string> = {
  bg: '--color-bg',
  surface: '--color-surface',
  surface2: '--color-surface-2',
  border: '--color-border',
  borderStrong: '--color-border-strong',
  text: '--color-text',
  textMuted: '--color-text-muted',
  accent: '--color-accent',
  onAccent: '--color-on-accent',
  danger: '--color-danger',
  grid: '--color-grid',
  neutral: '--color-neutral',
};

const themes = ['dark', 'light'] as const;

describe('tokens.css ↔ colors.ts', () => {
  it.each(themes)('%s: every colour token matches the TS palette', (theme) => {
    const vars = cssBlock(`:root[data-theme='${theme}']`);
    const p = PALETTES[theme];
    for (const [key, name] of Object.entries(CSS_NAME)) {
      expect(vars[name], `${theme} ${name}`).toBe(p[key as keyof typeof CSS_NAME]);
    }
    for (const q of QUANTITIES) expect(vars[`--q-${q}`], `${theme} --q-${q}`).toBe(p.quantity[q]);
  });

  it('exposes hex numbers for Three.js', () => {
    expect(quantityColorHex('b', 'dark')).toBe(0x6ea8fe);
  });
});

describe('WCAG helpers', () => {
  it('match reference values', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('WCAG AA contrast of token pairs', () => {
  const backgrounds = ['bg', 'surface', 'surface2'] as const;

  it.each(themes)('%s: text colours ≥ 4.5:1 on every background', (theme) => {
    const p = PALETTES[theme];
    const fgs: Record<string, string> = {
      text: p.text,
      textMuted: p.textMuted,
      accent: p.accent,
      danger: p.danger,
      neutral: p.neutral,
      ...Object.fromEntries(QUANTITIES.map((q) => [`q-${q}`, p.quantity[q]])),
    };
    for (const [fgName, fg] of Object.entries(fgs)) {
      for (const bg of backgrounds) {
        const ratio = contrastRatio(fg, p[bg]);
        expect(ratio, `${theme}: ${fgName} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it.each(themes)('%s: text on accent-filled buttons ≥ 4.5:1', (theme) => {
    const p = PALETTES[theme];
    expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(themes)('%s: control outlines and focus ring ≥ 3:1 (non-text, WCAG 1.4.11)', (theme) => {
    const p = PALETTES[theme];
    for (const bg of backgrounds) {
      expect(contrastRatio(p.borderStrong, p[bg]), `borderStrong on ${bg}`).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrastRatio(p.accent, p[bg]), `accent on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});
