/**
 * Lofted skins for the procedural car: a surface through superellipse
 * cross-sections placed along x (each station: centre (y, z), width, height,
 * squareness). The stations are interpolated with a Catmull-Rom spline per
 * parameter, so a handful of stations gives a smooth, credible body.
 * Geometry is owned by the caller (dispose it).
 */
import * as THREE from 'three';

export interface LoftStation {
  /** Longitudinal position [m]. */
  x: number;
  /** Width (z extent) and height (y extent) [m]. */
  w: number;
  h: number;
  /** Centre of the section. */
  y: number;
  z?: number;
  /** Superellipse exponent (2 = ellipse, 4+ = rounded box). Default 3. */
  n?: number;
  /** Flatten the lower half (0 = symmetric, 1 = flat bottom). Default 0. */
  flat?: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Stations resampled with `sub` subdivisions per span (Catmull-Rom per parameter). */
export function resampleStations(st: readonly LoftStation[], sub: number): LoftStation[] {
  if (st.length < 2 || sub <= 1) return st.map((s) => ({ ...s }));
  const out: LoftStation[] = [];
  const get = (i: number): LoftStation =>
    st[Math.min(st.length - 1, Math.max(0, i))] as LoftStation;
  for (let i = 0; i < st.length - 1; i++) {
    const a = get(i - 1);
    const b = get(i);
    const c = get(i + 1);
    const d = get(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const f = (key: 'x' | 'w' | 'h' | 'y'): number => catmull(a[key], b[key], c[key], d[key], t);
      const g = (key: 'z' | 'n' | 'flat', def: number): number =>
        catmull(a[key] ?? def, b[key] ?? def, c[key] ?? def, d[key] ?? def, t);
      out.push({
        x: f('x'),
        w: Math.max(1e-3, f('w')),
        h: Math.max(1e-3, f('h')),
        y: f('y'),
        z: g('z', 0),
        n: Math.max(1.5, g('n', 3)),
        flat: Math.min(1, Math.max(0, g('flat', 0))),
      });
    }
  }
  out.push({ ...(st[st.length - 1] as LoftStation) });
  return out;
}

/**
 * Lofted skin. `radial` = vertices per section; the seam is at the bottom. Both ends
 * are closed with a fan cap. UV: u along x (0…1), v around the section.
 */
export function loftGeometry(
  stations: readonly LoftStation[],
  radial = 24,
  sub = 4,
): THREE.BufferGeometry {
  const st = resampleStations(stations, sub);
  const ns = st.length;
  const nr = radial + 1;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const x0 = (st[0] as LoftStation).x;
  const x1 = (st[ns - 1] as LoftStation).x;
  for (let i = 0; i < ns; i++) {
    const s = st[i] as LoftStation;
    const n = s.n ?? 3;
    const e = 2 / n;
    for (let j = 0; j < nr; j++) {
      const th = -Math.PI / 2 + (j / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const zz = (s.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
      let yy = (s.h / 2) * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      if (yy < 0 && s.flat) yy *= 1 - 0.75 * s.flat * Math.pow(Math.abs(c), 0.5);
      pos.push(s.x, s.y + yy, (s.z ?? 0) + zz);
      uv.push((s.x - x0) / (x1 - x0 || 1), j / radial);
    }
  }
  for (let i = 0; i < ns - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * nr + j;
      const b = (i + 1) * nr + j;
      // outward normals for stations ordered by increasing x (flipped below otherwise)
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // caps
  const cap = (i: number, flip: boolean): void => {
    const s = st[i] as LoftStation;
    const c = pos.length / 3;
    pos.push(s.x, s.y, s.z ?? 0);
    uv.push(i === 0 ? 0 : 1, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = i * nr + j;
      if (flip) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  };
  const decreasing = x1 < x0;
  cap(0, false);
  cap(ns - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (decreasing) {
    // keep outward-facing triangles whatever the station order
    const ix = g.getIndex() as THREE.BufferAttribute;
    for (let k = 0; k < ix.count; k += 3) {
      const t = ix.getX(k + 1);
      ix.setX(k + 1, ix.getX(k + 2));
      ix.setX(k + 2, t);
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Wing element: an airfoil-like section (chord c, thickness ratio t, camber) in the
 * x-y plane extruded along z over `span`, centred. Leading edge at +x.
 */
export function wingGeometry(
  chord: number,
  span: number,
  thickness = 0.12,
  camber = 0.06,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const N = 12;
  const top: Array<[number, number]> = [];
  const bot: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N; // 0 = leading edge
    const xx = chord / 2 - u * chord;
    // NACA-like half-thickness and a parabolic camber line (suction side DOWN: inverted wing)
    const yt =
      5 *
      thickness *
      chord *
      (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4);
    const yc = -camber * chord * 4 * u * (1 - u);
    top.push([xx, yc + yt]);
    bot.push([xx, yc - yt]);
  }
  shape.moveTo(top[0]?.[0] ?? 0, top[0]?.[1] ?? 0);
  for (const [x, y] of top.slice(1)) shape.lineTo(x, y);
  for (const [x, y] of bot.reverse()) shape.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: span,
    bevelEnabled: false,
    curveSegments: 1,
  });
  g.translate(0, 0, -span / 2);
  g.computeVertexNormals();
  return g;
}
