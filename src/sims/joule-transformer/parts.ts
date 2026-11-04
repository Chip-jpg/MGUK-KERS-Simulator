/**
 * Static apparatus of the `joule-transformer` diorama (teardown look): a technical-museum
 * table model of the transport chain — power-station hall with the turbine-generator set,
 * an oil-immersed step-up transformer opened at the front (laminated E/I core, clamps,
 * radiator bank, conservator, porcelain bushings), lattice pylons with glass insulator
 * strings, the step-down transformer and a small town.
 *
 * Reference (one source for the transformer envelope): US Power Co. technical specification
 * "Transformer Tech Spec Winder 16MVA" (ONAF power transformer, oil-immersed),
 * https://www.uspowerco.com/__images/transformer/Transformer_Tech_Spec_Winder_16MVA.pdf —
 * overall ≈ 5440 × 4260 × 4030 mm, ≈ 25,2 t, 9080 l of oil. The tank + radiators + conservator
 * footprint below keeps those proportions (1 unit ≈ 1,55 m for the transformers: 3,5 × 2,75
 * units). ILLUSTRATIVE (not from the source): the core and winding interior (enlarged so the
 * N₁ : N₂ turns read), the tank height (raised so the cutaway shows the whole core), the pylons
 * (form of a single-circuit 380 kV lattice tower with a horizontal cross-arm, two earth-wire
 * peaks and glass cap-and-pin strings, height compressed), the hall and the town.
 */
import * as THREE from 'three';
import { chamferBox, type MaterialKind, type Stage } from '../../render';
import { latheZ } from '../mguk-teardown/parts';

/** Resource sink of the scene (tracked geometries / materials). */
export interface PartsSink {
  geo<G extends THREE.BufferGeometry>(g: G): G;
  mat<M extends THREE.Material>(m: M): M;
  mesh(g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh;
  assign(m: THREE.InstancedMesh, kind: MaterialKind, key?: string): void;
}

// --- layout (scene units; diorama, not to scale) -------------------------------------------
export const GROUND = 0;
export const BASE_T = 0.32;
export const UP_X = -6.0;
export const DOWN_X = 8.4;
export const PYLONS = [-2.9, -0.1, 2.7, 5.5] as const;
export const PLANT_POS = new THREE.Vector3(-10.4, GROUND, -3.3);
export const PYLON_H = 6.0;
export const ARM_Y = 5.45;
export const INSUL_L = 0.8;
export const ATTACH_Y = ARM_Y - INSUL_L;
export const PHASE_Z = 0.95;
export const PEAK_Z = 0.62;

/** Core of the E/I (shell-type) transformer, local frame of the transformer group. */
export const CORE = {
  /** outer half-width, centre-limb half-width, window outer x, yoke thickness */
  hw: 1.19,
  cx: 0.34,
  wx: 0.85,
  t: 0.34,
  /** stack depth (z) and number of drawn lamination packets */
  d: 0.7,
  plates: 14,
  /** bottom of the I yoke, window bottom / top, top of the E */
  y0: 0.5,
  wy0: 0.84,
  wy1: 2.64,
  y1: 2.98,
};
export const COIL_H = 1.5;
export const COIL_Y = (CORE.wy0 + CORE.wy1) / 2;
/** Radius of the winding former around the centre limb. */
export const FORMER_R = 0.52;
/** Tank interior half-sizes, lid underside. */
export const TANK = { hx: 1.4, hz: 0.95, floor: 0.22, lid: 3.2, wall: 0.05 };
export const LID_TOP = TANK.lid + 0.08;
/** Bushings on the lid: x = side·BUSH_X, z ∈ BUSH_Z; HV and LV heights. */
export const BUSH_X = 0.95;
export const BUSH_Z = [-0.3, -0.75] as const;
export const BUSH_HV = 1.25;
export const BUSH_LV = 0.62;

/** Teardown tints of the kit materials (re-applied every frame: tier switches replace them). */
const TINTS: Array<[MaterialKind, string, number, number]> = [
  ['plastic', 'terrain', 0x2c3329, 0.92],
  ['plastic', 'baseEdge', 0x3a2a1e, 0.6],
  ['plastic', 'concrete', 0x77766f, 0.88],
  ['plastic', 'hall', 0x8d8a80, 0.82],
  ['plastic', 'tank', 0x5b6670, 0.5],
  ['plastic', 'town', 0xb3a58e, 0.82],
  ['plastic', 'townB', 0x8f9aa0, 0.82],
  ['plastic', 'roofTile', 0x7c3a26, 0.72],
  ['plastic', 'tree', 0x2e5530, 0.9],
  ['plastic', 'trunk', 0x4a3423, 0.9],
  ['plastic', 'road', 0x222326, 0.92],
  ['plastic', 'pressboard', 0xb39668, 0.8],
  ['ceramic', 'bushing', 0x6e3a22, 0.32],
  ['steel', 'pylon', 0x9aa1a7, 0.55],
  ['steel', 'conductor', 0xbfc5cb, 0.45],
  ['darkSteel', 'clamp', 0x3a3f46, 0.5],
];

export function applyTints(stage: Stage): void {
  const kit = stage.materials;
  for (const [kind, key, color, rough] of TINTS) {
    const m = kit.get(kind, key) as THREE.MeshStandardMaterial;
    m.color.setHex(color);
    if ('roughness' in m) m.roughness = rough;
    if ('envMapIntensity' in m) m.envMapIntensity = 0.6;
  }
}

const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Gable roof prism: ridge along x, width w (x), depth d (z), height h; base at y = 0. */
function gableGeo(w: number, d: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Diorama base: a varnished board edge with a terrain top, a road along the front. */
export function buildBase(k: PartsSink): THREE.Group {
  const root = new THREE.Group();
  const top = k.mesh(k.geo(chamferBox(28.4, BASE_T, 10.4, 0.05)), 'plastic', 'terrain');
  top.position.set(1.5, GROUND - BASE_T / 2, -0.8);
  const edge = k.mesh(k.geo(chamferBox(28.8, 0.2, 10.8, 0.06)), 'plastic', 'baseEdge');
  edge.position.set(1.5, GROUND - BASE_T - 0.1, -0.8);
  const road = k.mesh(k.geo(new THREE.BoxGeometry(28.2, 0.012, 0.7)), 'plastic', 'road');
  road.position.set(1.5, GROUND + 0.006, 3.6);
  top.receiveShadow = edge.receiveShadow = road.receiveShadow = true;
  root.add(top, edge, road);
  return root;
}

/** Power station: hall, stack, turbine-generator set on its plinth. Returns terminal points. */
export function buildPlant(k: PartsSink, tess: (n: number) => number) {
  const root = new THREE.Group();
  root.position.copy(PLANT_POS);
  const hall = k.mesh(k.geo(chamferBox(3.4, 2.6, 2.4, 0.05)), 'plastic', 'hall');
  hall.position.set(-0.4, 1.3, -1.0);
  const roof = k.mesh(k.geo(chamferBox(3.6, 0.14, 2.6, 0.04)), 'darkSteel', 'clamp');
  roof.position.set(-0.4, 2.67, -1.0);
  const band = k.mesh(k.geo(chamferBox(3.0, 0.42, 0.02, 0.01)), 'glass', 'hall');
  band.position.set(-0.4, 1.9, 0.21);
  const door = k.mesh(k.geo(chamferBox(0.9, 1.1, 0.03, 0.01)), 'darkSteel', 'clamp');
  door.position.set(0.7, 0.55, 0.21);
  const stack = k.mesh(
    k.geo(new THREE.CylinderGeometry(0.17, 0.26, 2.6, tess(20))),
    'plastic',
    'concrete',
  );
  stack.position.set(-1.6, 3.9, -1.7);
  const plinth = k.mesh(k.geo(chamferBox(3.0, 0.3, 1.2, 0.04)), 'plastic', 'concrete');
  plinth.position.set(-0.2, 0.15, 0.95);
  // generator stator with cooling ribs, turbine casing, shaft (axis x)
  const prof: Array<[number, number]> = [[0, -0.8]];
  for (let i = 0; i <= 8; i++) {
    const y = -0.72 + (i * 1.44) / 8;
    prof.push([0.5, y - 0.05], [0.56, y], [0.5, y + 0.05]);
  }
  prof.push([0.44, 0.8], [0, 0.8]);
  const gen = k.mesh(k.geo(latheZ(prof, tess(40)).rotateY(Math.PI / 2)), 'iron', 'gen');
  gen.position.set(0.35, 0.92, 0.95);
  const turb = k.mesh(
    k.geo(
      latheZ(
        [
          [0, -0.6],
          [0.3, -0.6],
          [0.48, 0.2],
          [0.42, 0.6],
          [0, 0.6],
        ],
        tess(32),
      ).rotateY(Math.PI / 2),
    ),
    'darkSteel',
    'turbine',
  );
  turb.position.set(-1.0, 0.92, 0.95);
  const shaft = k.mesh(
    k.geo(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 16).rotateZ(Math.PI / 2)),
    'steel',
  );
  shaft.position.set(-0.15, 0.92, 0.95);
  const tbox = k.mesh(k.geo(chamferBox(0.46, 0.28, 0.4, 0.03)), 'darkSteel', 'clamp');
  tbox.position.set(0.65, 1.6, 0.95);
  root.add(hall, roof, band, door, stack, plinth, gen, turb, shaft, tbox);
  const termA = v(0.75, 1.76, 0.85).add(PLANT_POS);
  const termB = v(0.75, 1.76, 1.05).add(PLANT_POS);
  return { root, terminals: [termA, termB] as [THREE.Vector3, THREE.Vector3] };
}

/**
 * Static part of one transformer (local frame, origin on the ground at the tank centre):
 * laminated E/I core as a stack of plates, clamp frames, tank opened at the front (removable
 * group `tank`), radiator bank, conservator, bushings. `hv` = side of the HV bushings (±1).
 */
export function buildTransformer(k: PartsSink, hv: 1 | -1, tess: (n: number) => number) {
  const root = new THREE.Group();
  // --- core: E (top yoke + three limbs) over I (bottom yoke), packets of laminations ---
  const { hw, cx, wx, d, plates, y0, wy0, wy1, y1 } = CORE;
  const e = new THREE.Shape();
  e.moveTo(-hw, y1);
  e.lineTo(hw, y1);
  e.lineTo(hw, wy0 + 0.006);
  e.lineTo(wx, wy0 + 0.006);
  e.lineTo(wx, wy1);
  e.lineTo(cx, wy1);
  e.lineTo(cx, wy0 + 0.006);
  e.lineTo(-cx, wy0 + 0.006);
  e.lineTo(-cx, wy1);
  e.lineTo(-wx, wy1);
  e.lineTo(-wx, wy0 + 0.006);
  e.lineTo(-hw, wy0 + 0.006);
  e.closePath();
  const pd = d / plates;
  const eGeo = k.geo(
    new THREE.ExtrudeGeometry(e, { depth: pd * 0.86, bevelEnabled: false, curveSegments: 1 }),
  );
  const iGeo = k.geo(new THREE.BoxGeometry(2 * hw, wy0 - y0 - 0.006, pd * 0.86));
  iGeo.translate(0, (y0 + wy0 - 0.006) / 2, (pd * 0.86) / 2);
  const core = new THREE.Group();
  core.name = 'core';
  for (let i = 0; i < plates; i++) {
    const z = -d / 2 + i * pd;
    // interleaved joints of real stacks: alternate packets slightly offset
    const me = k.mesh(eGeo, 'iron', 'core');
    me.position.z = z;
    const mi = k.mesh(iGeo, 'iron', 'core');
    mi.position.z = z;
    core.add(me, mi);
  }
  root.add(core);
  // core feet and clamp frames (steel channels front/back of both yokes) with tie studs
  const clampGeo = k.geo(chamferBox(2 * hw + 0.16, 0.22, 0.07, 0.015));
  const studGeo = k.geo(new THREE.CylinderGeometry(0.022, 0.022, d + 0.26, 8).rotateX(Math.PI / 2));
  const nutGeo = k.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6).rotateX(Math.PI / 2));
  for (const yc of [(y0 + wy0) / 2, (wy1 + y1) / 2]) {
    for (const sz of [-1, 1]) {
      const c = k.mesh(clampGeo, 'darkSteel', 'clamp');
      c.position.set(0, yc, sz * (d / 2 + 0.04));
      root.add(c);
    }
    for (const sx of [-1, 1]) {
      const s = k.mesh(studGeo, 'steel');
      s.position.set(sx * (hw + 0.04), yc, 0);
      root.add(s);
      for (const sz of [-1, 1]) {
        const n = k.mesh(nutGeo, 'steel');
        n.position.set(sx * (hw + 0.04), yc, sz * (d / 2 + 0.1));
        root.add(n);
      }
    }
  }
  const footGeo = k.geo(chamferBox(0.3, y0 - TANK.floor, d + 0.2, 0.02));
  for (const sx of [-0.85, 0.85]) {
    const f = k.mesh(footGeo, 'darkSteel', 'clamp');
    f.position.set(sx, (y0 + TANK.floor) / 2, 0);
    root.add(f);
  }

  // --- tank (front opened): floor, back, sides, low front sill, half lid, skid ---
  const tank = new THREE.Group();
  tank.name = 'tank';
  const { hx, hz, floor, lid, wall } = TANK;
  const H = lid - floor;
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, key = 'tank') => {
    const m = k.mesh(k.geo(g), 'plastic', key);
    m.position.set(x, y, z);
    tank.add(m);
    return m;
  };
  add(chamferBox(2 * hx + 2 * wall, 0.1, 2 * hz + 2 * wall, 0.02), 0, floor - 0.05, 0);
  add(chamferBox(2 * hx + 2 * wall, H, wall, 0.012), 0, floor + H / 2, -hz - wall / 2);
  for (const sx of [-1, 1])
    add(chamferBox(wall, H, 2 * hz, 0.012), sx * (hx + wall / 2), floor + H / 2, 0);
  add(chamferBox(2 * hx, 0.24, wall, 0.012), 0, floor + 0.12, hz - wall / 2);
  add(chamferBox(2 * hx + 0.16, 0.08, hz + 0.08, 0.015), 0, lid + 0.04, -(hz + 0.08) / 2);
  // stiffener ribs on the sides
  for (const sx of [-1, 1])
    for (const z of [-0.5, 0.2])
      add(chamferBox(0.05, H - 0.3, 0.07, 0.01), sx * (hx + wall + 0.025), floor + H / 2, z);
  // skid
  for (const z of [-0.6, 0.6]) {
    const s = k.mesh(k.geo(chamferBox(2 * hx + 0.5, 0.12, 0.18, 0.02)), 'darkSteel', 'clamp');
    s.position.set(0, 0.06, z);
    root.add(s);
  }
  // radiator bank on the back: panels + headers + flanged pipes
  const panelGeo = k.geo(chamferBox(0.035, 2.0, 0.5, 0.008));
  for (let i = 0; i < 9; i++) {
    const p = k.mesh(panelGeo, 'plastic', 'tank');
    p.position.set(-1.12 + i * 0.28, 1.55, -hz - wall - 0.33);
    tank.add(p);
  }
  const headerGeo = k.geo(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 12).rotateZ(Math.PI / 2));
  for (const y of [0.5, 2.6]) {
    const h = k.mesh(headerGeo, 'plastic', 'tank');
    h.position.set(0, y, -hz - wall - 0.33);
    tank.add(h);
    const stub = k.mesh(
      k.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 12).rotateX(Math.PI / 2)),
      'plastic',
      'tank',
    );
    stub.position.set(0, y, -hz - wall - 0.15);
    tank.add(stub);
  }
  // conservator on two brackets, pipe to the lid (Buchholz relay box on it)
  const cons = k.mesh(
    k.geo(
      latheZ(
        [
          [0, -0.95],
          [0.27, -0.95],
          [0.29, -0.9],
          [0.29, 0.9],
          [0.27, 0.95],
          [0, 0.95],
        ],
        tess(28),
      ).rotateY(Math.PI / 2),
    ),
    'plastic',
    'tank',
  );
  cons.position.set(-hv * 0.25, LID_TOP + 0.55, -hz + 0.05);
  tank.add(cons);
  for (const bx of [-0.6, 0.6]) {
    const br = k.mesh(k.geo(chamferBox(0.06, 0.32, 0.36, 0.01)), 'darkSteel', 'clamp');
    br.position.set(-hv * 0.25 + bx, LID_TOP + 0.16, -hz + 0.05);
    tank.add(br);
  }
  const pipe = k.mesh(k.geo(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 10)), 'steel');
  pipe.position.set(-hv * 0.25 + hv * 0.75, LID_TOP + 0.16, -hz + 0.25);
  const buch = k.mesh(k.geo(chamferBox(0.14, 0.12, 0.12, 0.015)), 'darkSteel', 'clamp');
  buch.position.set(-hv * 0.25 + hv * 0.75, LID_TOP + 0.12, -hz + 0.25);
  tank.add(pipe, buch);
  root.add(tank);

  // --- bushings: HV (tall, line side), LV (short); brown glazed porcelain, brass caps ---
  const prof = (n: number, h: number): Array<[number, number]> => {
    const p: Array<[number, number]> = [
      [0, 0],
      [0.12, 0],
      [0.12, 0.08],
    ];
    for (let i = 0; i < n; i++) {
      const y = 0.1 + (i * (h - 0.2)) / n;
      p.push([0.07, y], [0.14, y + 0.03], [0.07, y + (h - 0.2) / n]);
    }
    p.push([0.05, h], [0, h]);
    return p;
  };
  const hvGeo = k.geo(latheZ(prof(10, BUSH_HV), tess(20)).rotateX(-Math.PI / 2));
  const lvGeo = k.geo(latheZ(prof(4, BUSH_LV), tess(20)).rotateX(-Math.PI / 2));
  const capGeo = k.geo(new THREE.CylinderGeometry(0.045, 0.06, 0.1, 12));
  for (const [side, g, h] of [
    [hv, hvGeo, BUSH_HV],
    [-hv, lvGeo, BUSH_LV],
  ] as const) {
    for (const z of BUSH_Z) {
      const b = k.mesh(g, 'ceramic', 'bushing');
      b.position.set(side * BUSH_X, LID_TOP, z);
      const c = k.mesh(capGeo, 'brass');
      c.position.set(side * BUSH_X, LID_TOP + h + 0.04, z);
      root.add(b, c);
    }
  }
  return { root, tank, core };
}

/** World point at the top of a bushing of a transformer at x = gx. */
export function bushingTop(gx: number, side: number, z: number, hv: boolean): THREE.Vector3 {
  return v(gx + side * BUSH_X, LID_TOP + (hv ? BUSH_HV : BUSH_LV) + 0.09, z);
}

/** Lattice pylons (instanced members), footings, glass insulator strings. */
export function buildPylons(k: PartsSink, tess: (n: number) => number): THREE.Group {
  const root = new THREE.Group();
  const members: Array<[THREE.Vector3, THREE.Vector3, number]> = [];
  const waist = 4.3;
  const legAt = (y: number): number =>
    y < waist ? 0.66 - (0.4 * y) / waist : 0.26 - (0.06 * (y - waist)) / (ARM_Y - waist);
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const levels = [0, 0.8, 1.55, 2.25, 2.9, 3.6, waist, 4.9, ARM_Y];
  for (const px of PYLONS) {
    const c = (sx: number, sz: number, y: number): THREE.Vector3 =>
      v(px + sx * legAt(y), GROUND + y, sz * legAt(y));
    for (let l = 0; l < levels.length - 1; l++) {
      const ya = levels[l] as number;
      const yb = levels[l + 1] as number;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i] as [number, number];
        const [bx, bz] = corners[(i + 1) % 4] as [number, number];
        members.push([c(ax, az, ya), c(ax, az, yb), 0.05]);
        members.push([c(ax, az, yb), c(bx, bz, yb), 0.022]);
        members.push([c(ax, az, ya), c(bx, bz, yb), 0.016]);
        members.push([c(bx, bz, ya), c(ax, az, yb), 0.016]);
      }
    }
    // cross-arm (along z): two chords top and bottom, lattice bracing
    const aw = 0.16;
    const L = PHASE_Z + 0.25;
    for (const sx of [-1, 1]) {
      members.push([v(px + sx * aw, ARM_Y, -L), v(px + sx * aw, ARM_Y, L), 0.035]);
      members.push([
        v(px + sx * aw * 0.6, ARM_Y + 0.32, -L * 0.75),
        v(px + sx * aw * 0.6, ARM_Y + 0.32, L * 0.75),
        0.025,
      ]);
      for (let i = -4; i < 4; i++) {
        const za = (i / 4) * L;
        const zb = ((i + 1) / 4) * L;
        members.push([
          v(px + sx * aw, ARM_Y, za),
          v(px + sx * aw * 0.6, ARM_Y + 0.32, zb * 0.75),
          0.014,
        ]);
      }
      members.push([v(px - aw, ARM_Y, sx * L), v(px + aw, ARM_Y, sx * L), 0.02]);
    }
    // earth-wire peaks
    for (const sz of [-1, 1]) {
      members.push([
        v(px - 0.1, ARM_Y + 0.32, sz * PEAK_Z * 0.6),
        v(px, PYLON_H + 0.25, sz * PEAK_Z),
        0.025,
      ]);
      members.push([
        v(px + 0.1, ARM_Y + 0.32, sz * PEAK_Z * 0.6),
        v(px, PYLON_H + 0.25, sz * PEAK_Z),
        0.025,
      ]);
    }
  }
  const lattice = new THREE.InstancedMesh(
    k.geo(new THREE.BoxGeometry(1, 1, 1)),
    undefined,
    members.length,
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = v(0, 1, 0);
  const dir = v();
  const mid = v();
  const sc = v();
  members.forEach(([a, b, w], i) => {
    dir.subVectors(b, a);
    const len = dir.length();
    q.setFromUnitVectors(yAxis, dir.normalize());
    mid.addVectors(a, b).multiplyScalar(0.5);
    sc.set(w, len, w);
    lattice.setMatrixAt(i, m4.compose(mid, q, sc));
  });
  lattice.instanceMatrix.needsUpdate = true;
  lattice.computeBoundingSphere();
  lattice.castShadow = true;
  k.assign(lattice, 'steel', 'pylon');
  root.add(lattice);
  // footings
  const footGeo = k.geo(chamferBox(0.32, 0.16, 0.32, 0.03));
  for (const px of PYLONS)
    for (const [sx, sz] of corners) {
      const f = k.mesh(footGeo, 'plastic', 'concrete');
      f.position.set(px + sx * 0.66, GROUND + 0.06, sz * 0.66);
      root.add(f);
    }
  // insulator strings: 12 toughened-glass discs, yoke on top, clamp at the bottom
  const p: Array<[number, number]> = [[0, 0]];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const y = -0.05 - (i * (INSUL_L - 0.12)) / n;
    p.push([0.02, y], [0.085, y - 0.015], [0.03, y - 0.04]);
  }
  p.push([0.02, -INSUL_L + 0.04], [0, -INSUL_L]);
  const ins = new THREE.InstancedMesh(
    k.geo(latheZ(p, tess(16)).rotateX(-Math.PI / 2)),
    undefined,
    PYLONS.length * 2,
  );
  let i = 0;
  for (const px of PYLONS)
    for (const sz of [-1, 1]) ins.setMatrixAt(i++, m4.makeTranslation(px, ARM_Y, sz * PHASE_Z));
  ins.instanceMatrix.needsUpdate = true;
  ins.computeBoundingSphere();
  k.assign(ins, 'glass', 'insulator');
  root.add(ins);
  return root;
}

/** Town blocks [x, z, w, d, h, gable]. */
export const BLOCKS: Array<[number, number, number, number, number, boolean]> = [
  [11.4, -1.3, 1.0, 1.0, 2.9, false],
  [12.8, -1.5, 1.2, 0.9, 1.5, true],
  [14.2, -1.2, 0.9, 1.1, 3.4, false],
  [11.6, 0.9, 1.1, 0.9, 1.2, true],
  [13.0, 1.0, 1.0, 1.0, 2.3, false],
  [14.4, 1.05, 1.0, 0.9, 1.3, true],
];

/** Town: blocks with roofs, a substation kiosk, trees. Returns window slots (shuffled). */
export function buildTown(k: PartsSink) {
  const root = new THREE.Group();
  const blockGeo = k.geo(chamferBox(1, 1, 1, 0.03));
  const slots: THREE.Matrix4[] = [];
  BLOCKS.forEach(([bx, bz, w, d, h, gable], idx) => {
    const b = k.mesh(blockGeo, 'plastic', idx % 2 ? 'townB' : 'town');
    b.scale.set(w, h, d);
    b.position.set(bx, GROUND + h / 2, bz);
    root.add(b);
    if (gable) {
      const r = k.mesh(k.geo(gableGeo(w + 0.1, d + 0.12, 0.45)), 'plastic', 'roofTile');
      r.position.set(bx, GROUND + h, bz);
      root.add(r);
    } else {
      const r = k.mesh(blockGeo, 'darkSteel', 'clamp');
      r.scale.set(w + 0.06, 0.08, d + 0.06);
      r.position.set(bx, GROUND + h + 0.04, bz);
      root.add(r);
    }
    const rows = Math.floor((h - 0.3) / 0.34);
    const colsF = Math.floor((w - 0.16) / 0.22);
    const colsS = Math.floor((d - 0.16) / 0.22);
    for (let r = 0; r < rows; r++) {
      const y = GROUND + 0.38 + r * 0.34;
      for (let c = 0; c < colsF; c++) {
        const x = bx - ((colsF - 1) * 0.22) / 2 + c * 0.22;
        slots.push(new THREE.Matrix4().makeTranslation(x, y, bz + d / 2 + 0.006));
      }
      for (let c = 0; c < colsS; c++) {
        const z = bz - ((colsS - 1) * 0.22) / 2 + c * 0.22;
        slots.push(
          new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(bx - w / 2 - 0.006, y, z),
        );
      }
    }
  });
  // trees (cones on trunks) behind the town and along the back of the board
  const crown = k.geo(new THREE.ConeGeometry(0.28, 0.8, 8));
  const trunk = k.geo(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6));
  const trees: Array<[number, number, number]> = [
    [10.6, -3.0, 1.0],
    [12.0, -3.3, 1.2],
    [13.5, -2.9, 0.9],
    [15.0, -3.2, 1.1],
    [15.4, -0.3, 1.0],
    [10.4, 2.6, 0.8],
    [-8.4, -4.4, 1.1],
    [-4.8, -4.6, 1.0],
    [-1.3, -4.3, 1.2],
    [2.1, -4.6, 0.9],
    [5.2, -4.4, 1.1],
    [8.4, -4.5, 1.0],
  ];
  for (const [x, z, s] of trees) {
    const c = k.mesh(crown, 'plastic', 'tree');
    c.scale.setScalar(s);
    c.position.set(x, GROUND + 0.3 * s + 0.4 * s, z);
    const t = k.mesh(trunk, 'plastic', 'trunk');
    t.scale.setScalar(s);
    t.position.set(x, GROUND + 0.15 * s, z);
    root.add(c, t);
  }
  return { root, slots };
}
