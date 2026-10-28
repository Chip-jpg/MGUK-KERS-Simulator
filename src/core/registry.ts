import type { SimModule } from './types';

/** Simulator IDs of phases 1–3 (§2) followed by the Phase 4 modules, in sidebar order. */
export const SIM_IDS = [
  'faraday',
  'lenz',
  'alternator-motor',
  'kers-braking',
  'joule-transformer',
  'rl-energy',
  // Phase 4 (optional, advanced)
  'car-dynamics',
] as const;

export type SimId = (typeof SIM_IDS)[number];

export function isSimId(id: string): id is SimId {
  return (SIM_IDS as readonly string[]).includes(id);
}

export interface SimRegistry {
  /** Register a module. Throws on duplicate id or unknown id. */
  register(mod: SimModule): void;
  get(id: string): SimModule | undefined;
  /** Registered modules, ordered as in {@link SIM_IDS}. */
  list(): SimModule[];
  has(id: string): boolean;
}

export function createRegistry(): SimRegistry {
  const mods = new Map<string, SimModule>();
  const order = (id: string): number => {
    const i = (SIM_IDS as readonly string[]).indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return {
    register(mod) {
      if (!isSimId(mod.id)) {
        throw new Error(`Unknown simulator id '${mod.id}'. Allowed: ${SIM_IDS.join(', ')}`);
      }
      if (mods.has(mod.id)) throw new Error(`Simulator '${mod.id}' is already registered`);
      mods.set(mod.id, mod);
    },
    get: (id) => mods.get(id),
    has: (id) => mods.has(id),
    list: () => [...mods.values()].sort((a, b) => order(a.id) - order(b.id)),
  };
}

/** App-wide registry instance. */
export const registry: SimRegistry = createRegistry();

/** Lazy importer of one `src/sims/<id>/index.ts` (a separate chunk, with its Three.js). */
export type SimLoader = () => Promise<{ default: SimModule }>;

/**
 * Discovered at build time (DECISIONS D4), **lazily** (A3): every
 * `src/sims/<id>/index.ts` becomes its own chunk, so Three.js and uPlot are not part
 * of the initial bundle. Keys are folder ids.
 */
const DISCOVERED: ReadonlyMap<string, SimLoader> = (() => {
  const found = import.meta.glob<{ default: SimModule }>('../sims/*/index.ts');
  const map = new Map<string, SimLoader>();
  for (const [path, loader] of Object.entries(found)) {
    const folder = /\/sims\/([^/]+)\/index\.ts$/.exec(path)?.[1];
    if (folder) map.set(folder, loader);
  }
  return map;
})();

/** Ids (in {@link SIM_IDS} order) that have a `src/sims/<id>/index.ts`, without loading them. */
export function availableSimIds(loaders: ReadonlyMap<string, SimLoader> = DISCOVERED): SimId[] {
  return SIM_IDS.filter((id) => loaders.has(id));
}

/**
 * Load (once) and register the simulator `id`. Resolves to `undefined` when no
 * `src/sims/<id>/index.ts` exists. Rejects when the module does not
 * default-export a {@link SimModule} whose `id` equals the folder name.
 */
export async function loadSim(
  id: string,
  target: SimRegistry = registry,
  loaders: ReadonlyMap<string, SimLoader> = DISCOVERED,
): Promise<SimModule | undefined> {
  const existing = target.get(id);
  if (existing) return existing;
  const loader = loaders.get(id);
  if (!loader) return undefined;
  const sim = (await loader()).default;
  if (!sim || sim.id !== id) {
    throw new Error(`src/sims/${id}/index.ts must default-export a SimModule with id '${id}'`);
  }
  if (!target.has(sim.id)) target.register(sim);
  return target.get(id);
}

/**
 * Load and register every discovered simulator (e.g. for the index page or tests).
 * No shared file has to be edited to add a simulator.
 */
export async function loadSimModules(
  target: SimRegistry = registry,
  loaders: ReadonlyMap<string, SimLoader> = DISCOVERED,
): Promise<SimModule[]> {
  // SIM_IDS order first; unknown ids last so loadSim still rejects them.
  const rank = (id: string): number => {
    const i = (SIM_IDS as readonly string[]).indexOf(id);
    return i === -1 ? SIM_IDS.length : i;
  };
  const ids = [...loaders.keys()].sort((a, b) => rank(a) - rank(b));
  const mods = await Promise.all(ids.map((id) => loadSim(id, target, loaders)));
  return mods.filter((m): m is SimModule => m !== undefined);
}
