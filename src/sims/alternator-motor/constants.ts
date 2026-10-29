/**
 * Visual scales of the `alternator-motor` scene (shared by the scene and the
 * legend in index.ts without importing the Three.js scene module).
 */

/** Scene units per metre of coil (L, w drawn to scale). */
export const DRAW = 8;
/** Current particles: scene units per second per ampere (capped at 2,2 units/s). */
export const PARTICLE_SPEED_PER_AMP = 0.08;
/** Force arrows: length ∝ log₁₀|F| between these magnitudes [N]. */
export const F_LOG_RANGE = [1, 1000] as const;

/** Live counters of the scene's own (non-kit) resources, for the leak check. */
export const sceneStats = { liveScenes: 0, liveGeometries: 0, liveMaterials: 0 };
