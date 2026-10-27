import type { Theme } from '../core/types';

/**
 * Colour tokens (§4.5) as resolved hex values, for consumers that cannot read
 * CSS custom properties (Three.js materials, uPlot canvas strokes).
 *
 * `src/styles/tokens.css` mirrors these values one-to-one as `--color-*` and
 * `--q-*` custom properties; `tests/ui/colors.test.ts` fails if the two drift
 * apart and checks every text/background pair for WCAG AA contrast.
 */

/** Physical quantities with a fixed colour across every simulator. */
export type Quantity = 'b' | 'emf' | 'i' | 'f' | 'energy';

export const QUANTITIES: readonly Quantity[] = ['b', 'emf', 'i', 'f', 'energy'];

/** Italian label of each quantity colour (legend / docs). */
export const QUANTITY_LABEL_IT: Record<Quantity, string> = {
  b: 'Campo magnetico B',
  emf: 'Forza elettromotrice',
  i: 'Corrente',
  f: 'Forza',
  energy: 'Energia',
};

export interface Palette {
  /** Page background. */
  bg: string;
  /** Cards, sidebar, panels. */
  surface: string;
  /** Inputs, nested panels, hover. */
  surface2: string;
  /** Decorative separators (non-text, not contrast-critical). */
  border: string;
  /** Control outlines (inputs, slider track) — ≥ 3:1 against surfaces. */
  borderStrong: string;
  text: string;
  textMuted: string;
  /** The single accent colour (links, primary buttons, focus ring). */
  accent: string;
  /** Text on an accent-filled background. */
  onAccent: string;
  /** Errors (e.g. KaTeX parse errors). */
  danger: string;
  /** Plot grid lines (decorative). */
  grid: string;
  /** Neutral series colour for plots (not tied to a quantity). */
  neutral: string;
  /** Fixed quantity colours: B blue, emf amber, current red, force green, energy purple. */
  quantity: Record<Quantity, string>;
}

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    bg: '#0e1117',
    surface: '#161b22',
    surface2: '#1f2630',
    border: '#30363d',
    borderStrong: '#6e7681',
    text: '#e6edf3',
    textMuted: '#9da7b3',
    accent: '#3dd6c6',
    onAccent: '#04201c',
    danger: '#ff7b72',
    grid: '#2a313b',
    neutral: '#b1bac4',
    quantity: {
      b: '#6ea8fe',
      emf: '#f5b83d',
      i: '#ff6b6b',
      f: '#4fd27f',
      energy: '#c29bff',
    },
  },
  light: {
    bg: '#f6f8fa',
    surface: '#ffffff',
    surface2: '#eaeef2',
    border: '#d0d7de',
    borderStrong: '#7d8590',
    text: '#1f2328',
    textMuted: '#4d5866',
    accent: '#0a7368',
    onAccent: '#ffffff',
    danger: '#b42318',
    grid: '#dfe4ea',
    neutral: '#57606a',
    quantity: {
      b: '#1d5bd6',
      emf: '#8a5a00',
      i: '#c4271f',
      f: '#17783a',
      energy: '#7a3bc4',
    },
  },
};

/** Resolved palette for a theme. */
export function getPalette(theme: Theme): Palette {
  return PALETTES[theme];
}

/** Hex colour of a physical quantity in the given theme. */
export function quantityColor(q: Quantity, theme: Theme): string {
  return PALETTES[theme].quantity[q];
}

/** `0xRRGGBB` number of a quantity colour, handy for `new THREE.Color(n)`. */
export function quantityColorHex(q: Quantity, theme: Theme): number {
  return Number.parseInt(quantityColor(q, theme).slice(1), 16);
}

// --- WCAG helpers (used by tests, exported for sims that pick colours) --------

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #rrggbb, got '${hex}'`);
  const n = Number.parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.x contrast ratio (1–21) between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
