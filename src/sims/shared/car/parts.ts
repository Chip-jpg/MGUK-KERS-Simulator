/**
 * Geometry helpers of the teardown car: faired suspension members, flipped shells and
 * the section band of a lofted skin cut by a plane z = const (the "cut carbon" edge
 * drawn where the cutaway removes half of the engine cover / a sidepod).
 */
import * as THREE from 'three';
import { resampleStations, type LoftStation } from './loft';

/** Flip the faces of a geometry (to see the inside of an open cylinder). */
export function flipFaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    for (let k = 0; k < idx.count; k += 3) {
      const t = idx.getX(k + 1);
      idx.setX(k + 1, idx.getX(k + 2));
      idx.setX(k + 2, t);
    }
  }
  const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/**
 * Member between two points. `fair` > 1 flattens it into an aerofoil-like fairing whose
 * chord lies along the car (x), as on the carbon wishbones of a modern single-seater.
 */
export function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  fair = 1,
  seg = 10,
): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const dir = b.clone().sub(a).normalize();
  if (fair !== 1) {
    // chord along the projection of world x on the plane normal to the member
    g.scale(fair, 1, 1 / fair);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const xLocal = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const want = new THREE.Vector3(1, 0, 0).addScaledVector(dir, -dir.x);
    if (want.lengthSq() > 1e-6) {
      want.normalize();
      const ang = Math.atan2(xLocal.clone().cross(want).dot(dir), xLocal.dot(want));
      g.rotateY(ang);
    }
    g.applyQuaternion(q);
  } else {
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  }
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Tube through points (exhaust primaries, hoses). */
export function pipe(pts: THREE.Vector3[], r: number, seg = 24, radial = 10): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, radial, false);
}

/**
 * Section band of a lofted skin (same superellipse as `loftGeometry`) cut by the plane
 * z = zc: the closed outline of the cut, inset by the skin thickness `t`, as a flat
 * ShapeGeometry lying in that plane. Returns null when the plane misses the skin.
 */
export function sectionBand(
  stations: readonly LoftStation[],
  sub: number,
  zc: number,
  t: number,
): THREE.BufferGeometry | null {
  const st = resampleStations(stations, sub);
  const top: Array<[number, number]> = [];
  const bot: Array<[number, number]> = [];
  for (const s of st) {
    const n = s.n ?? 3;
    const e = 2 / n;
    const zz = zc - (s.z ?? 0);
    const u = (2 * Math.abs(zz)) / s.w;
    if (u >= 0.999) continue;
    const c = Math.pow(u, 1 / e);
    const sn = Math.sqrt(Math.max(0, 1 - c * c));
    const yy = (s.h / 2) * Math.pow(sn, e);
    const yb = yy * (s.flat ? 1 - 0.75 * s.flat * Math.pow(c, 0.5) : 1);
    top.push([s.x, s.y + yy]);
    bot.push([s.x, s.y - yb]);
  }
  if (top.length < 2) return null;
  const outer = new THREE.Shape();
  const ring = [...top, ...[...bot].reverse()];
  outer.setFromPoints(ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const x0 = Math.min(top[0]?.[0] ?? 0, top[top.length - 1]?.[0] ?? 0) + t;
  const x1 = Math.max(top[0]?.[0] ?? 0, top[top.length - 1]?.[0] ?? 0) - t;
  const inTop: THREE.Vector2[] = [];
  const inBot: THREE.Vector2[] = [];
  for (let i = 0; i < top.length; i++) {
    const [x, yt] = top[i] as [number, number];
    const yb = (bot[i] as [number, number])[1];
    if (x < x0 || x > x1 || yt - yb < 2.5 * t) continue;
    inTop.push(new THREE.Vector2(x, yt - t));
    inBot.push(new THREE.Vector2(x, yb + t));
  }
  if (inTop.length >= 2) outer.holes.push(new THREE.Path([...inTop, ...inBot.reverse()]));
  const g = new THREE.ShapeGeometry(outer, 1);
  g.translate(0, 0, zc);
  return g;
}

/** Radial fins/teeth: `n` boxes (radial length rOut − rIn, width w, depth d) around x. */
export function radialTeeth(
  n: number,
  rIn: number,
  rOut: number,
  w: number,
  d: number,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.BoxGeometry(d, rOut - rIn, w);
    g.translate(0, (rIn + rOut) / 2, 0);
    g.rotateX((k / n) * Math.PI * 2);
    out.push(g);
  }
  return out;
}
