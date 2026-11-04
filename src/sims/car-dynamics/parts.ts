/**
 * Limit-axle cue of the `car-dynamics` scene: a thin accent ring laid on the asphalt
 * around the contact patch of the axle that has reached its peak slip (κ = κ*), with
 * four short inward ticks like a target. One accent colour (the braking-point teal of
 * the track), the only accent in the scene. Sizes are illustrative display sizes [m].
 */
import * as THREE from 'three';

/** Teal of the braking-point line (`shared/car/track.ts`), slightly lifted for a dark floor. */
export const ACCENT = 0x2fb8ac;

const RING_R = 0.44;
const RING_W = 0.025;

export interface LimitCue {
  readonly group: THREE.Group;
  /** Centre on the limiting contact patch; `pulse` 0..1 drives the breathing. */
  place(at: THREE.Vector3, pulse: number): void;
  dispose(): void;
}

export function createLimitCue(lowPoly: boolean): LimitCue {
  const seg = lowPoly ? 32 : 72;
  const parts: THREE.BufferGeometry[] = [
    new THREE.RingGeometry(RING_R - RING_W, RING_R, seg),
    // four ticks pointing at the patch
    ...[0, 1, 2, 3].map((i) => {
      const g = new THREE.PlaneGeometry(0.11, 0.022).translate(RING_R - 0.07, 0, 0);
      return g.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
    }),
  ];
  const merged = mergeFlat(parts);
  merged.rotateX(-Math.PI / 2);
  for (const p of parts) p.dispose();
  const mat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ring = new THREE.Mesh(merged, mat);
  ring.renderOrder = 3;
  const group = new THREE.Group();
  group.name = 'limitCue';
  group.add(ring);
  return {
    group,
    place(at, pulse) {
      group.position.set(at.x, 0.006, at.z);
      const s = 1 + 0.06 * pulse;
      // ellipse: the patch is longer across the tyre (z) than along it
      ring.scale.set(s * 1.05, 1, s * 0.82);
      mat.opacity = 0.65 + 0.3 * pulse;
    },
    dispose() {
      merged.dispose();
      mat.dispose();
    },
  };
}

/** Merge non-indexed-compatible flat geometries (position only) into one. */
function mergeFlat(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of gs) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...Array.from(ng.getAttribute('position').array as ArrayLike<number>));
    if (ng !== g) ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}
