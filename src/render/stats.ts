import { registerDebugHook } from '../core/debug';
/**
 * Module-level live-resource counters of the render foundation (read by the
 * e2e leak checks through each sim's debug hook). Every create increments,
 * every dispose decrements: after unmounting a sim they must return to 0.
 */
export const renderStats = {
  liveStages: 0,
  liveRenderers: 0,
  liveComposers: 0,
  /** Render targets owned by post-processing (composer ×2, bloom mips, SMAA). */
  liveRenderTargets: 0,
  livePmrem: 0,
  liveMaterials: 0,
  liveTextures: 0,
  /** Geometries created by foundation helpers (field lines, flow, ribbons, floor…). */
  liveGeometries: 0,
  liveWorkers: 0,
  createdStages: 0,
  frames: 0,
};

export type RenderStats = typeof renderStats;

let hooked = false;
/**
 * Expose the counters as `window.__kersDebug.render()` (dev / automated browsers
 * only, see core/debug). Installed once on the first stage; it is a module-level
 * singleton (never removed), so the e2e leak checks can read the counters AFTER
 * a sim has been unmounted.
 */
export function installRenderDebugHook(): void {
  if (hooked) return;
  hooked = true;
  registerDebugHook('render', snapshotRenderStats);
}

export function snapshotRenderStats(): RenderStats {
  return { ...renderStats };
}
