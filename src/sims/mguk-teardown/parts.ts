/**
 * Geometry helpers of the MGU-K teardown: involute gear outlines, lathe rings, rectangular
 * wire swept along a path, and the flat section caps that close the cutaway.
 */
import * as THREE from 'three';

/** Involute function inv(α) = tan α − α. */
const inv = (a: number): number => Math.tan(a) - a;

/**
 * Outline of a spur gear with involute flanks: z teeth, module m, pressure angle pa, optional
 * bore. Tooth centre k sits at angle 2πk/z. Units follow m.
 */
export function involuteGearShape(z: number, m: number, pa: number, boreR = 0): THREE.Shape {
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(pa);
  const ra = rp + m;
  const rf = rp - 1.25 * m;
  const half = Math.PI / (2 * z) + inv(pa);
  const psi = (r: number): number => half - inv(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  const N = 7;
  const pts: THREE.Vector2[] = [];
  const at = (r: number, a: number): THREE.Vector2 =>
    new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  const r0 = Math.max(rb, rf);
  for (let k = 0; k < z; k++) {
    const c = (2 * Math.PI * k) / z;
    // root fillet to the base circle, involute flank up, tip land, flank down
    pts.push(at(rf, c - psi(r0) - 0.12 / z));
    for (let i = 0; i <= N; i++) {
      const r = r0 + ((ra - r0) * i) / N;
      pts.push(at(r, c - psi(r)));
    }
    for (let i = N; i >= 0; i--) {
      const r = r0 + ((ra - r0) * i) / N;
      pts.push(at(r, c + psi(r)));
    }
    pts.push(at(rf, c + psi(r0) + 0.12 / z));
    // root arc to the next tooth
    const a1 = c + psi(r0) + 0.12 / z;
    const a2 = c + (2 * Math.PI) / z - psi(r0) - 0.12 / z;
    for (let i = 1; i < 3; i++) pts.push(at(rf, a1 + ((a2 - a1) * i) / 3));
  }
  const s = new THREE.Shape(pts);
  if (boreR > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

/** Extrude a shape along +z from z0 to z0 + depth, with a small bevel. */
export function extrudeZ(
  shape: THREE.Shape,
  z0: number,
  depth: number,
  bevel = 0,
  curveSegments = 12,
): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  g.translate(0, 0, z0 + bevel);
  return g;
}

/** Closed lathe ring around the z axis: radial r0..r1, axial z0..z1 (a tube with flat ends). */
export function ringZ(
  r0: number,
  r1: number,
  z0: number,
  z1: number,
  seg = 64,
  chamfer = 0,
): THREE.BufferGeometry {
  const c = Math.min(chamfer, (r1 - r0) / 3, (z1 - z0) / 3);
  const p = [
    [r0, z0],
    [r1 - c, z0],
    [r1, z0 + c],
    [r1, z1 - c],
    [r1 - c, z1],
    [r0, z1],
    [r0, z0],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  // lathe turns about y; map y → z
  return new THREE.LatheGeometry(p, seg).rotateX(Math.PI / 2);
}

/** Lathe of an open (r, z) profile around the z axis. */
export function latheZ(profile: Array<[number, number]>, seg = 64): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    seg,
  ).rotateX(Math.PI / 2);
}

/** A rectangular-section conductor (w × h) swept along a 3D path (hairpins, busbars). */
export function sweptRect(
  points: THREE.Vector3[],
  w: number,
  h: number,
  steps = 24,
): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    steps,
    bevelEnabled: false,
    extrudePath: new THREE.CatmullRomCurve3(points, false, 'centripetal'),
  });
}

/** Section-cap colours (flat, matte). */
export type CapKind = 'cast' | 'iron' | 'steel' | 'carbon' | 'copper' | 'coolant';

/**
 * Collects the flat section faces of axisymmetric parts cut by the quarter cutaway
 * (removed: x > 0 and y > 0 in the machine frame). An (r, z) rectangle of a lathe part
 * appears on both cut planes: on x = 0 (y = r) and on y = 0 (x = r).
 */
export class CapBuilder {
  private readonly quads = new Map<CapKind, number[]>();

  rect(kind: CapKind, r0: number, r1: number, z0: number, z1: number): void {
    const a = this.quads.get(kind) ?? [];
    // plane x = 0, the face looks toward +x
    a.push(0, r0, z0, 0, r0, z1, 0, r1, z1, 0, r0, z0, 0, r1, z1, 0, r1, z0);
    // plane y = 0, the face looks toward +y
    a.push(r0, 0, z0, r1, 0, z1, r0, 0, z1, r0, 0, z0, r1, 0, z0, r1, 0, z1);
    this.quads.set(kind, a);
  }

  /** One geometry per cap kind. */
  build(): Map<CapKind, THREE.BufferGeometry> {
    const out = new Map<CapKind, THREE.BufferGeometry>();
    for (const [k, a] of this.quads) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
      g.computeVertexNormals();
      out.set(k, g);
    }
    return out;
  }
}

/** Set planar-cylindrical UVs on a geometry around z: u = angle, v = z / period. */
export function cylUV(g: THREE.BufferGeometry, period: number): void {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[2 * i] = (Math.atan2(p.getY(i), p.getX(i)) / (2 * Math.PI)) * 8;
    uv[2 * i + 1] = p.getZ(i) / period;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
