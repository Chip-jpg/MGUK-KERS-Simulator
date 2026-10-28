// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyQuality,
  detectQuality,
  detectedRenderer,
  getQuality,
  onQualityChange,
  probeBrowser,
  QUALITY_STORAGE_KEY,
  qualitySource,
  resetQualityForTests,
  setQuality,
  storedQuality,
  tierSettings,
  TIER_SETTINGS,
  urlQuality,
} from '../../src/render/quality';

const hw = (renderer: string, extra: Partial<{ tauri: boolean; webgl2: boolean }> = {}) => ({
  tauri: false,
  webgl2: true,
  renderer,
  ...extra,
});

afterEach(() => {
  resetQualityForTests();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('classifyQuality', () => {
  it('software renderers and missing WebGL2 → base', () => {
    for (const r of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
    ])
      expect(classifyQuality(hw(r))).toBe('base');
    expect(classifyQuality(hw('NVIDIA GeForce RTX 3060', { webgl2: false }))).toBe('base');
    // software wins even inside Tauri
    expect(classifyQuality(hw('SwiftShader', { tauri: true }))).toBe('base');
  });
  it('discrete GPUs and the Tauri desktop shell → alta', () => {
    expect(
      classifyQuality(
        hw(
          'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        ),
      ),
    ).toBe('alta');
    expect(classifyQuality(hw('AMD Radeon RX 6700 XT'))).toBe('alta');
    expect(classifyQuality(hw('Intel(R) UHD Graphics 630', { tauri: true }))).toBe('alta');
  });
  it('integrated or unknown GPUs → bilanciata', () => {
    expect(classifyQuality(hw('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'))).toBe(
      'bilanciata',
    );
    expect(classifyQuality(hw('AMD Radeon(TM) Graphics'))).toBe('bilanciata');
    expect(classifyQuality(hw('Apple GPU'))).toBe('bilanciata');
    expect(classifyQuality(hw('Mali-G78'))).toBe('bilanciata');
    expect(classifyQuality(hw(''))).toBe('bilanciata');
  });
});

describe('probeBrowser (mocked WebGL)', () => {
  it('reads the unmasked renderer and releases the context', () => {
    const loseContext = vi.fn();
    const gl = {
      RENDERER: 0x1f01,
      getExtension: (name: string) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
          : name === 'WEBGL_lose_context'
            ? { loseContext }
            : null,
      getParameter: (p: number) => (p === 0x9246 ? 'NVIDIA GeForce RTX 3060' : 'WebKit WebGL'),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      gl as unknown as RenderingContext,
    );
    expect(probeBrowser()).toEqual({
      tauri: false,
      webgl2: true,
      renderer: 'NVIDIA GeForce RTX 3060',
    });
    expect(loseContext).toHaveBeenCalledOnce();
  });
  it('detects Tauri and the absence of WebGL2', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    expect(probeBrowser()).toEqual({ tauri: true, webgl2: false, renderer: '' });
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });
  it('falls back to RENDERER without the debug extension and survives exceptions', () => {
    const gl = { RENDERER: 1, getExtension: () => null, getParameter: () => 'Generic GPU' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      gl as unknown as RenderingContext,
    );
    expect(probeBrowser().renderer).toBe('Generic GPU');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(probeBrowser().webgl2).toBe(false);
  });
});

describe('active tier: URL > user choice > auto', () => {
  const probe = vi.fn(() => hw('SwiftShader'));
  it('auto-detects once and caches', () => {
    expect(detectQuality(probe)).toBe('base');
    expect(detectQuality(probe)).toBe('base');
    expect(probe).toHaveBeenCalledTimes(1);
    expect(detectedRenderer()).toBe('SwiftShader');
    expect(getQuality()).toBe('base');
    expect(qualitySource()).toBe('auto');
  });
  it('honours ?quality= and ignores invalid values', () => {
    detectQuality(probe);
    expect(urlQuality('?quality=alta')).toBe('alta');
    expect(urlQuality('?quality=ultra')).toBeNull();
    window.history.replaceState(null, '', '/?quality=bilanciata#/sim/faraday');
    expect(getQuality()).toBe('bilanciata');
    expect(qualitySource()).toBe('url');
  });
  it('persists the user choice, notifies subscribers and applies live', () => {
    detectQuality(probe);
    const seen: string[] = [];
    const off = onQualityChange((t) => seen.push(t));
    setQuality('alta');
    expect(localStorage.getItem(QUALITY_STORAGE_KEY)).toBe('alta');
    expect(storedQuality()).toBe('alta');
    expect(getQuality()).toBe('alta');
    expect(qualitySource()).toBe('user');
    setQuality('alta'); // no change → no event
    setQuality('base');
    off();
    setQuality('bilanciata');
    expect(seen).toEqual(['alta', 'base']);
    setQuality('ultra' as never);
    expect(getQuality()).toBe('bilanciata');
  });
  it('the stored choice survives a reload (new module state)', () => {
    localStorage.setItem(QUALITY_STORAGE_KEY, 'bilanciata');
    detectQuality(probe);
    expect(getQuality()).toBe('bilanciata');
    localStorage.setItem(QUALITY_STORAGE_KEY, 'garbage');
    expect(getQuality()).toBe('base');
  });
  it('tier settings are ordered alta ≥ bilanciata ≥ base', () => {
    detectQuality(probe);
    expect(tierSettings().tier).toBe('base');
    expect(tierSettings('alta')).toBe(TIER_SETTINGS.alta);
    expect(TIER_SETTINGS.base.post).toBe(false);
    expect(TIER_SETTINGS.base.shadowMapSize).toBe(0);
    expect(TIER_SETTINGS.alta.shadowMapSize).toBeGreaterThan(
      TIER_SETTINGS.bilanciata.shadowMapSize,
    );
    expect(TIER_SETTINGS.alta.lineDensity).toBeGreaterThan(TIER_SETTINGS.base.lineDensity);
  });
});
