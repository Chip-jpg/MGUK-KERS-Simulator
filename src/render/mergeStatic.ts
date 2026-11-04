/**
 * Draw-call reduction for the `base` tier: bake the static meshes under a root into one mesh
 * per (material, shadow flags). Only meshes that nothing references at run time may be merged —
 * the caller lists everything that moves, toggles or is looked up in `keep` (those objects and
 * their sub-trees are left alone). Geometry is baked into the root's local space, so the root
 * itself may still move as a whole.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialKit } from './materials';

export interface MergeStaticOptions {
  kit: MaterialKit;
  /** Register a new geometry with the scene's owner (leak counters / dispose). */
  track: <G extends THREE.BufferGeometry>(g: G) => G;
  /** Release an original geometry that is no longer used. */
  drop?: (g: THREE.BufferGeometry) => void;
  /** Objects (with their sub-trees) that must stay as they are. */
  keep?: Iterable<THREE.Object3D | null | undefined>;
  /** Called per baked group with the new mesh and the meshes it replaced (already detached). */
  onMerge?: (merged: THREE.Mesh, sources: readonly THREE.Mesh[]) => void;
}

const ATTRS = ['position', 'normal', 'uv'] as const;

export function mergeStatic(
  root: THREE.Object3D,
  o: MergeStaticOptions,
): { before: number; after: number } {
  const keep = new Set<THREE.Object3D>();
  for (const k of o.keep ?? []) if (k) keep.add(k);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const groups = new Map<string, THREE.Mesh[]>();
  const eligible = (m: THREE.Mesh): boolean => {
    if (
      !m.isMesh ||
      (m as THREE.InstancedMesh).isInstancedMesh ||
      (m as THREE.SkinnedMesh).isSkinnedMesh
    )
      return false;
    // (single-material meshes ignore geometry groups, e.g. the cap/side groups of primitives)
    if (m.children.length > 0 || Array.isArray(m.material)) return false;
    const g = m.geometry;
    if (
      !g.attributes['position'] ||
      !g.attributes['normal'] ||
      Object.keys(g.morphAttributes).length
    )
      return false;
    if (m.matrixWorld.determinant() <= 0) return false;
    for (let p: THREE.Object3D | null = m; p && p !== root.parent; p = p.parent) {
      if (!p.visible || keep.has(p)) return false;
    }
    return true;
  };
  let before = 0;
  root.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    before++;
    if (!eligible(m)) return;
    const g = m.geometry;
    const sig = [
      (m.material as THREE.Material).uuid,
      m.castShadow ? 1 : 0,
      m.receiveShadow ? 1 : 0,
      m.renderOrder,
      g.index ? 'i' : 'n',
      g.attributes['uv'] ? 'uv' : '-',
    ].join('|');
    const list = groups.get(sig);
    if (list) list.push(m);
    else groups.set(sig, [m]);
  });

  let after = before;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const parts = list.map((m) => {
      const src = m.geometry;
      const c = new THREE.BufferGeometry();
      if (src.index) c.setIndex(src.index.clone());
      for (const a of ATTRS) {
        const at = src.attributes[a];
        if (at) c.setAttribute(a, at.clone());
      }
      c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return c;
    });
    const merged = mergeGeometries(parts);
    for (const c of parts) c.dispose();
    if (!merged) continue;
    const first = list[0] as THREE.Mesh;
    const mesh = new THREE.Mesh(o.track(merged), first.material);
    mesh.name = 'merged:' + first.name;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    const b = o.kit.binding(first);
    if (b) o.kit.assign(mesh, b.kind, b.key);
    root.add(mesh);
    for (const m of list) {
      m.removeFromParent();
      o.kit.forget(m);
      o.drop?.(m.geometry);
    }
    o.onMerge?.(mesh, list);
    after -= list.length - 1;
  }
  return { before, after };
}
