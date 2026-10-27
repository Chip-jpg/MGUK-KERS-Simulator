import type { SimModule } from './types';

/** Simulator IDs of phases 1–3 (§2), in sidebar order. */
export const SIM_IDS = [
  'faraday',
  'lenz',
  'alternator-motor',
  'kers-braking',
  'joule-transformer',
  'rl-energy',
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

/**
 * Discover simulator modules at build time. Every `src/sims/<id>/index.ts` must
 * `export default` a {@link SimModule} whose `id` equals the folder name `<id>`.
 * No shared file has to be edited to add a simulator.
 */
export function loadSimModules(target: SimRegistry = registry): SimModule[] {
  const found = import.meta.glob<{ default: SimModule }>('../sims/*/index.ts', { eager: true });
  const loaded: SimModule[] = [];
  for (const [path, mod] of Object.entries(found)) {
    const folder = /\/sims\/([^/]+)\/index\.ts$/.exec(path)?.[1];
    const sim = mod.default;
    if (!sim || sim.id !== folder) {
      throw new Error(`${path} must default-export a SimModule with id '${folder ?? '?'}'`);
    }
    if (!target.has(sim.id)) target.register(sim);
    loaded.push(sim);
  }
  return loaded;
}
