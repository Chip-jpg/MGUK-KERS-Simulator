/**
 * Shared, cached material factory ("kit") tied to one stage.
 *
 * - `kit.get(kind, key?)` returns the material for the active tier, cached per
 *   (kind, key). Use `key` when a sim needs its own instance (e.g. a glow whose
 *   intensity it animates); same key → same instance.
 * - `kit.assign(mesh, kind, key?)` additionally records the mesh so that a live
 *   quality switch can swap in the rebuilt material (alta/bilanciata → PBR,
 *   base → cheap Lambert).
 * - Everything (materials + GPU textures) is disposed by `kit.dispose()`, which
 *   the stage calls; sims never dispose kit materials themselves.
 */
import * as THREE from 'three';
import type { Theme } from '../core/types';
import { quantityColorHex, type Quantity } from '../ui/colors';
import type { TierSettings } from './quality';
import {
  brushedNormal,
  carbonAlbedo,
  carbonNormal,
  laminationNormal,
  magnetFace,
} from './textures';
import { renderStats } from './stats';

export type MaterialKind =
  | 'copper'
  | 'enamel'
  | 'brass'
  | 'iron'
  | 'steel'
  | 'darkSteel'
  | 'magnetN'
  | 'magnetS'
  | 'magnet'
  | 'rubber'
  | 'carbon'
  | 'glass'
  | 'ceramic'
  | 'plastic'
  | 'glowB'
  | 'glowEmf'
  | 'glowI'
  | 'glowF'
  | 'glowEnergy'
  | 'filament';

/** Materials that expose an emissive colour/intensity (all kit materials do). */
export type KitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

const GLOW_QUANTITY: Partial<Record<MaterialKind, Quantity>> = {
  glowB: 'b',
  glowEmf: 'emf',
  glowI: 'i',
  glowF: 'f',
  glowEnergy: 'energy',
};

export interface MaterialKit {
  get(kind: MaterialKind, key?: string): KitMaterial;
  assign(mesh: THREE.Mesh | THREE.InstancedMesh, kind: MaterialKind, key?: string): KitMaterial;
  /** Rebuild for a new tier and re-assign every recorded mesh. */
  setTier(settings: TierSettings): void;
  setTheme(theme: Theme): void;
  readonly theme: Theme;
  /** Number of live materials / textures owned by the kit. */
  stats(): { materials: number; textures: number };
  dispose(): void;
}

export function createMaterialKit(settings: TierSettings, theme: Theme): MaterialKit {
  let tier = settings;
  let th = theme;
  const mats = new Map<string, KitMaterial>();
  const textures = new Map<string, THREE.Texture>();
  const bindings: Array<{
    mesh: THREE.Mesh | THREE.InstancedMesh;
    kind: MaterialKind;
    key: string;
  }> = [];

  const tex = (
    name: string,
    make: () => HTMLCanvasElement,
    repeat?: [number, number],
    srgb = false,
  ): THREE.Texture => {
    const id = `${name}|${repeat?.join('x') ?? ''}`;
    let t = textures.get(id);
    if (!t) {
      t = new THREE.CanvasTexture(make());
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      if (repeat) t.repeat.set(repeat[0], repeat[1]);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      textures.set(id, t);
      renderStats.liveTextures++;
    }
    return t;
  };

  const make = (kind: MaterialKind): KitMaterial => {
    const pbr = tier.pbr;
    const dark = th === 'dark';
    const q = GLOW_QUANTITY[kind];
    if (q) {
      const c = quantityColorHex(q, th);
      const m = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: c,
        emissiveIntensity: 1,
        roughness: 0.5,
        metalness: 0,
      });
      return m;
    }
    if (!pbr) {
      const lam = (
        color: number,
        extra: THREE.MeshLambertMaterialParameters = {},
      ): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, ...extra });
      switch (kind) {
        case 'copper':
        case 'enamel':
          return lam(0xc46a3a);
        case 'brass':
          return lam(0xc9a34a);
        case 'iron':
          return lam(dark ? 0x66707c : 0x7a8591);
        case 'steel':
          return lam(0xa3acb6);
        case 'darkSteel':
          return lam(dark ? 0x4a5058 : 0x8a929c);
        case 'magnetN':
        case 'magnetS':
          return lam(0xffffff, {
            map: tex(
              `magnet-${kind}-${th}`,
              () => magnetFace(kind === 'magnetN' ? 'N' : 'S', dark),
              undefined,
              true,
            ),
          });
        case 'magnet':
          return lam(dark ? 0x5d636b : 0x7b828a);
        case 'rubber':
          return lam(0x1d1f22);
        case 'carbon':
          return lam(0xffffff, { map: tex('carbon-albedo', carbonAlbedo, [4, 4], true) });
        case 'glass':
          return lam(0xdfe9f3, { transparent: true, opacity: 0.25, depthWrite: false });
        case 'ceramic':
          return lam(0xe8e2d6);
        case 'plastic':
          return lam(dark ? 0x2b3038 : 0x59606a);
        case 'filament':
          return lam(0x332211, { emissive: 0xffaa55, emissiveIntensity: 0 });
        default:
          return lam(0x888888);
      }
    }
    switch (kind) {
      case 'copper':
        return new THREE.MeshPhysicalMaterial({
          color: 0xd9824f,
          metalness: 1,
          roughness: 0.3,
          clearcoat: 0.6,
          clearcoatRoughness: 0.15,
        });
      case 'enamel':
        // Enamelled magnet wire: copper under a thin glossy varnish.
        return new THREE.MeshPhysicalMaterial({
          color: 0xc8703d,
          metalness: 0.9,
          roughness: 0.38,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          sheen: 0.2,
          sheenColor: new THREE.Color(0xffb07a),
        });
      case 'brass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xd4af5a,
          metalness: 1,
          roughness: 0.28,
          clearcoat: 0.3,
        });
      case 'iron':
        return new THREE.MeshStandardMaterial({
          color: dark ? 0x5f6873 : 0x6f7883,
          metalness: 0.85,
          roughness: 0.42,
          normalMap: tex('lamination', laminationNormal, [1, 7]),
          normalScale: new THREE.Vector2(0.35, 0.35),
        });
      case 'steel':
        return new THREE.MeshStandardMaterial({
          color: 0xc4ccd4,
          metalness: 1,
          roughness: 0.3,
          normalMap: tex('brushed', brushedNormal, [2, 2]),
          normalScale: new THREE.Vector2(0.25, 0.25),
        });
      case 'darkSteel':
        return new THREE.MeshStandardMaterial({
          color: dark ? 0x4d545e : 0x9aa2ab,
          metalness: 0.9,
          roughness: 0.45,
        });
      case 'magnetN':
      case 'magnetS': {
        const face = tex(
          `magnet-${kind}-${th}`,
          () => magnetFace(kind === 'magnetN' ? 'N' : 'S', dark),
          undefined,
          true,
        );
        return new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: face,
          bumpMap: face,
          bumpScale: 2.5,
          metalness: 0.25,
          roughness: 0.55,
          clearcoat: 0.35,
          clearcoatRoughness: 0.4,
        });
      }
      case 'magnet':
        return new THREE.MeshPhysicalMaterial({
          color: dark ? 0x5d636b : 0x7b828a,
          metalness: 0.2,
          roughness: 0.62,
          clearcoat: 0.15,
        });
      case 'rubber':
        return new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0, roughness: 0.92 });
      case 'carbon':
        return new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: tex('carbon-albedo', carbonAlbedo, [4, 4], true),
          normalMap: tex('carbon-normal', carbonNormal, [4, 4]),
          metalness: 0.2,
          roughness: 0.35,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xf2f7ff,
          metalness: 0,
          roughness: 0.04,
          transparent: true,
          opacity: 0.22,
          clearcoat: 1,
          clearcoatRoughness: 0,
          depthWrite: false,
          envMapIntensity: 1.6,
        });
      case 'ceramic':
        return new THREE.MeshPhysicalMaterial({ color: 0xece5d8, roughness: 0.35, clearcoat: 0.6 });
      case 'plastic':
        return new THREE.MeshStandardMaterial({
          color: dark ? 0x2a2f37 : 0x5b626c,
          roughness: 0.6,
          metalness: 0.05,
        });
      case 'filament':
        return new THREE.MeshStandardMaterial({
          color: 0x2a1a10,
          emissive: 0xffaa55,
          emissiveIntensity: 0,
          roughness: 0.6,
        });
      default:
        return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }
  };

  const get = (kind: MaterialKind, key = ''): KitMaterial => {
    const id = `${kind}|${key}`;
    let m = mats.get(id);
    if (!m) {
      m = make(kind);
      m.name = `kit:${id}`;
      mats.set(id, m);
      renderStats.liveMaterials++;
    }
    return m;
  };

  const disposeAll = (): void => {
    for (const m of mats.values()) {
      m.dispose();
      renderStats.liveMaterials--;
    }
    mats.clear();
    for (const t of textures.values()) {
      t.dispose();
      renderStats.liveTextures--;
    }
    textures.clear();
  };

  const rebind = (): void => {
    disposeAll();
    for (const b of bindings) b.mesh.material = get(b.kind, b.key);
  };

  return {
    get,
    assign(mesh, kind, key = '') {
      const m = get(kind, key);
      mesh.material = m;
      bindings.push({ mesh, kind, key });
      return m;
    },
    setTier(s) {
      if (s.tier === tier.tier) return;
      tier = s;
      rebind();
    },
    setTheme(t) {
      if (t === th) return;
      th = t;
      rebind();
    },
    get theme() {
      return th;
    },
    stats: () => ({ materials: mats.size, textures: textures.size }),
    dispose() {
      disposeAll();
      bindings.length = 0;
    },
  };
}
