/**
 * Graphics quality tiers (DECISIONS D14). No Three.js import: the app shell uses
 * this module for the sidebar control without pulling the 3D chunk.
 *
 * Resolution order of the active tier:
 *  1. `?quality=alta|bilanciata|base` in the page URL (testing / demos, not stored);
 *  2. the user's choice in the sidebar, stored in `localStorage['kers-lab.quality']`;
 *  3. auto-detection ({@link detectQuality}).
 */

export type QualityTier = 'alta' | 'bilanciata' | 'base';

export const QUALITY_TIERS: readonly QualityTier[] = ['alta', 'bilanciata', 'base'];

export const QUALITY_STORAGE_KEY = 'kers-lab.quality';

/** Italian labels (sidebar). */
export const QUALITY_LABEL_IT: Record<QualityTier, string> = {
  alta: 'Alta',
  bilanciata: 'Bilanciata',
  base: 'Base',
};

/** Everything a stage / effect needs to know about a tier. */
export interface TierSettings {
  tier: QualityTier;
  /** Anti-aliasing of the post-processing chain ('none' = context AA or nothing). */
  antialias: 'msaa' | 'smaa' | 'none';
  /** MSAA samples of the composer target (0 when not MSAA). */
  msaaSamples: number;
  /** Post-processing chain (EffectComposer). `false` = direct render. */
  post: boolean;
  /** UnrealBloomPass settings, or null. */
  bloom: { strength: number; radius: number; threshold: number } | null;
  /** Shadow-map size of the key light (0 = no shadows). */
  shadowMapSize: number;
  /** Image-based lighting from a procedural RoomEnvironment (PMREM). */
  ibl: boolean;
  /** Device-pixel-ratio cap. */
  pixelRatioCap: number;
  /** Multiplier for field-line counts (1 = full). */
  lineDensity: number;
  /** Fat lines (Line2/LineSegments2) instead of 1-px GL lines. */
  fatLines: boolean;
  /** Multiplier for particle counts. */
  particleDensity: number;
  /** Multiplier for curve/tube tessellation. */
  tessellation: number;
  /** Physically based materials (clearcoat, normal maps); false = cheap Lambert-like. */
  pbr: boolean;
}

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  alta: {
    tier: 'alta',
    antialias: 'msaa',
    msaaSamples: 4,
    post: true,
    bloom: { strength: 0.75, radius: 0.55, threshold: 0.82 },
    shadowMapSize: 2048,
    ibl: true,
    pixelRatioCap: 2,
    lineDensity: 1,
    fatLines: true,
    particleDensity: 1,
    tessellation: 1,
    pbr: true,
  },
  bilanciata: {
    tier: 'bilanciata',
    antialias: 'smaa',
    msaaSamples: 0,
    post: true,
    bloom: { strength: 0.55, radius: 0.4, threshold: 0.86 },
    shadowMapSize: 1024,
    ibl: true,
    pixelRatioCap: 1.5,
    lineDensity: 0.7,
    fatLines: true,
    particleDensity: 0.6,
    tessellation: 0.6,
    pbr: true,
  },
  base: {
    tier: 'base',
    antialias: 'none',
    msaaSamples: 0,
    post: false,
    bloom: null,
    shadowMapSize: 0,
    ibl: false,
    pixelRatioCap: 1.25,
    lineDensity: 0.45,
    fatLines: false,
    particleDensity: 0.35,
    tessellation: 0.4,
    pbr: false,
  },
};

export function isQualityTier(v: unknown): v is QualityTier {
  return v === 'alta' || v === 'bilanciata' || v === 'base';
}

/** Facts used by the auto-detection (injectable for tests). */
export interface QualityProbe {
  /** Running inside the Tauri desktop shell. */
  tauri: boolean;
  /** WebGL2 available. */
  webgl2: boolean;
  /** `UNMASKED_RENDERER_WEBGL` (or `RENDERER`) string, '' when unknown. */
  renderer: string;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|mesa offscreen/i;
const DISCRETE =
  /nvidia|geforce|rtx|gtx|quadro|radeon\s*(rx|pro|r9|vii)|\brx\s*\d{3,4}|arc\s*a\d|apple\s*m\d\s*(pro|max|ultra)/i;
const INTEGRATED =
  /intel|uhd|iris|hd graphics|radeon\(tm\)\s*graphics|radeon graphics|vega\s*\d+\s*graphics|adreno|mali|powervr|apple\s*(m\d|gpu)|videocore/i;

/**
 * Pure tier decision from probe facts:
 * software renderer or no WebGL2 → `base`; Tauri desktop → `alta`;
 * discrete GPU → `alta`; integrated GPU → `bilanciata`; unknown hardware → `bilanciata`.
 */
export function classifyQuality(p: QualityProbe): QualityTier {
  if (!p.webgl2 || SOFTWARE.test(p.renderer)) return 'base';
  if (p.tauri) return 'alta';
  if (DISCRETE.test(p.renderer)) return 'alta';
  if (INTEGRATED.test(p.renderer)) return 'bilanciata';
  return 'bilanciata';
}

/** Probe the browser once (throwaway WebGL2 context, released immediately). */
export function probeBrowser(): QualityProbe {
  const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  let webgl2 = false;
  let renderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (gl) {
      webgl2 = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      renderer = typeof r === 'string' ? r : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl2 = false;
  }
  return { tauri, webgl2, renderer };
}

let detected: { tier: QualityTier; probe: QualityProbe } | null = null;

/** Auto-detected tier (probed once per page load and cached). */
export function detectQuality(probe: () => QualityProbe = probeBrowser): QualityTier {
  if (!detected) {
    const p = probe();
    detected = { tier: classifyQuality(p), probe: p };
  }
  return detected.tier;
}

/** Renderer string seen by the detection ('' before the first detection). */
export function detectedRenderer(): string {
  return detected?.probe.renderer ?? '';
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** `?quality=` override from the page URL, or null. */
export function urlQuality(search?: string): QualityTier | null {
  try {
    const s = search ?? (typeof location === 'undefined' ? '' : location.search);
    const v = new URLSearchParams(s).get('quality');
    return isQualityTier(v) ? v : null;
  } catch {
    return null;
  }
}

export function storedQuality(): QualityTier | null {
  try {
    const v = storage()?.getItem(QUALITY_STORAGE_KEY);
    return isQualityTier(v) ? v : null;
  } catch {
    return null;
  }
}

let override: QualityTier | null = null;
const listeners = new Set<(tier: QualityTier) => void>();

/** Where the active tier comes from. */
export function qualitySource(): 'url' | 'user' | 'auto' {
  if (!override && urlQuality()) return 'url';
  if (override || storedQuality()) return 'user';
  return 'auto';
}

/** Active tier (URL > user choice > auto-detection). */
export function getQuality(): QualityTier {
  if (override) return override;
  return urlQuality() ?? storedQuality() ?? detectQuality();
}

/**
 * Set the tier chosen by the user: persisted, applied live (every subscriber is
 * notified). The choice also wins over a `?quality=` URL for the rest of the session.
 */
export function setQuality(tier: QualityTier): void {
  if (!isQualityTier(tier)) return;
  const before = getQuality();
  override = tier;
  try {
    storage()?.setItem(QUALITY_STORAGE_KEY, tier);
  } catch {
    /* storage unavailable: applies for this session only */
  }
  if (before !== tier) for (const cb of [...listeners]) cb(tier);
}

/** Subscribe to tier changes; returns an unsubscribe function. */
export function onQualityChange(cb: (tier: QualityTier) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Settings of a tier (default: the active one). */
export function tierSettings(tier: QualityTier = getQuality()): TierSettings {
  return TIER_SETTINGS[tier];
}

/** Test helper: forget the cached detection, the session override and listeners. */
export function resetQualityForTests(): void {
  detected = null;
  override = null;
  listeners.clear();
}
