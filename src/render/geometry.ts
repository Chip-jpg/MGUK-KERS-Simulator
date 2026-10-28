/**
 * Small procedural geometry helpers shared by the sims (original geometry only).
 * Every returned geometry is owned by the caller (dispose it).
 */
import * as THREE from 'three';

/**
 * Box of size w × h × d (centred) with chamfered/rounded edges of radius r —
 * reads as machined metal instead of a CG cube. `segments` = bevel segments.
 */
export function chamferBox(
  w: number,
  h: number,
  d: number,
  r: number,
  segments = 2,
): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const x = w / 2 - rr;
  const y = h / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-x, -y);
  s.lineTo(x, -y);
  s.lineTo(x, y);
  s.lineTo(-x, y);
  s.lineTo(-x, -y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(1e-3, d - 2 * rr),
    bevelEnabled: true,
    bevelSize: rr,
    bevelThickness: rr,
    bevelSegments: segments,
    curveSegments: 1,
  });
  g.translate(0, 0, -(d - 2 * rr) / 2);
  g.computeVertexNormals();
  boxProjectUVs(g, w, h, d);
  return g;
}

/**
 * Points of a rounded rectangle in a 2D (u, v) plane with half sizes a (u) and
 * b (v) and corner radius rc, starting at (0, −b) (bottom centre) and running
 * towards −u first (i.e. counter-clockwise about +n when u = z, v = y, n = x —
 * see the Faraday coil). `perSide` samples per straight side, `perCorner` per corner.
 */
export function roundedRectPoints(
  a: number,
  b: number,
  rc: number,
  perSide = 6,
  perCorner = 6,
): Array<[number, number]> {
  const r = Math.max(0, Math.min(rc, a, b));
  const out: Array<[number, number]> = [];
  const line = (
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    n: number,
    skipLast = true,
  ): void => {
    for (let i = 0; i < n + (skipLast ? 0 : 1); i++) {
      const t = i / n;
      out.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]);
    }
  };
  // Clockwise in (u, v) = counter-clockwise about +n for (u = z, v = y, n = x).
  line(0, -b, -(a - r), -b, perSide);
  for (let i = 0; i < perCorner; i++) {
    const th = -Math.PI / 2 - (i / perCorner) * (Math.PI / 2);
    out.push([-(a - r) + r * Math.cos(th), -(b - r) + r * Math.sin(th)]);
  }
  line(-a, -(b - r), -a, b - r, perSide * 2);
  for (let i = 0; i < perCorner; i++) {
    const th = Math.PI - (i / perCorner) * (Math.PI / 2);
    out.push([-(a - r) + r * Math.cos(th), b - r + r * Math.sin(th)]);
  }
  line(-(a - r), b, a - r, b, perSide * 2);
  for (let i = 0; i < perCorner; i++) {
    const th = Math.PI / 2 - (i / perCorner) * (Math.PI / 2);
    out.push([a - r + r * Math.cos(th), b - r + r * Math.sin(th)]);
  }
  line(a, b - r, a, -(b - r), perSide * 2);
  for (let i = 0; i < perCorner; i++) {
    const th = 0 - (i / perCorner) * (Math.PI / 2);
    out.push([a - r + r * Math.cos(th), -(b - r) + r * Math.sin(th)]);
  }
  line(a - r, -b, 0, -b, perSide);
  return out;
}

/**
 * Replace the UVs with a box projection normalised to [0, 1] on every face
 * (dominant normal axis → the other two coordinates over the box size), so a
 * texture (engraving, laminations) spans each face exactly once.
 */
export function boxProjectUVs(g: THREE.BufferGeometry, w: number, h: number, d: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w + 0.5;
    const y = pos.getY(i) / h + 0.5;
    const z = pos.getZ(i) / d + 0.5;
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = nor.getX(i) > 0 ? 1 - z : z;
      v = y;
    } else if (ay >= az) {
      u = x;
      v = nor.getY(i) > 0 ? 1 - z : z;
    } else {
      u = nor.getZ(i) > 0 ? x : 1 - x;
      v = y;
    }
    uv[2 * i] = u;
    uv[2 * i + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
