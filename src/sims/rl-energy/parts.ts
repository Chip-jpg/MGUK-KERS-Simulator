/**
 * Static apparatus of the `rl-energy` bench (teardown look): a school RL demonstration —
 * a tray of 1,5 V D cells, a knife switch on a slate base, a wire-wound slide rheostat and a
 * long air-core field coil on two painted stands, all on a varnished bench board.
 *
 * Reference (one source): LD Didactic / Leybold 516 244 "Field coil, d = 120 mm"
 * (https://www.leybold-shop.com/field-coil-d-120-mm-516244.html): 120 mm diameter,
 * 120 turns, coil length 42 cm, 10 A rating; turns wound on a transparent tube on two feet.
 * Scale: 1 scene unit = 10 cm. The coil diameter and length below follow that source; the
 * D cells follow IEC LR20 (Ø 34,2 mm × 61,5 mm). ILLUSTRATIVE (not from the source): the
 * drawn turn count (`SOLENOID_TURNS`, fewer and thicker so the winding reads at bench
 * distance), the battery tray, switch, rheostat, stands and board sizes.
 */
import * as THREE from 'three';
import { chamferBox, type MaterialKind, type Stage } from '../../render';
import type { PartsSink } from '../lenz/parts';

export type { PartsSink };

export const BENCH_TOP = 0;
export const BOARD_T = 0.24;
export const FLOOR_Y = BENCH_TOP - BOARD_T - 0.08;

/** Field coil (Leybold 516 244): Ø 120 mm → r = 0,6; winding length 42 cm → 4,2. */
export const SOL = { x: 0.95, y: 1.08, z: -0.85, r: 0.6, len: 4.2, tube: 4.5 } as const;
/** Battery tray of D cells (LR20: r = 0,171, h = 0,615), 2 rows of 8. */
export const BAT = { x: -3.75, z: 1.0, pitch: 0.37, r: 0.165, h: 0.615, y0: 0.08 } as const;
/** Knife switch: hinge and jaw x, blade height. */
export const SW = { x: -0.95, z: 1.55, hinge: -1.5, jaw: -0.45, y: 0.29 } as const;
/** Wire-wound rheostat: ceramic tube axis along x. */
export const RES = { x: 2.45, z: 1.45, y: 0.52, len: 2.0, r: 0.19 } as const;

/** Teardown tints of the kit materials (re-applied every frame: tier switches replace them). */
const TINTS: Array<[MaterialKind, string, number, number]> = [
  ['plastic', 'wood', 0x5e3f26, 0.62],
  ['plastic', 'bakelite', 0x2c2724, 0.5],
  ['plastic', 'slate', 0x34383d, 0.7],
  ['plastic', 'socketRed', 0xa8261e, 0.42],
  ['plastic', 'socketBlack', 0x17181b, 0.45],
  ['plastic', 'cell', 0x1f2a36, 0.5],
  ['plastic', 'ceramic', 0x9a8e76, 0.8],
  ['plastic', 'stand', 0x4a535d, 0.55],
  ['steel', 'nickel', 0xc4cad1, 0.4],
  ['steel', 'rod', 0xb9c0c8, 0.45],
  ['brass', 'post', 0xd2a84e, 0.4],
  ['copper', 'blade', 0xc98a5a, 0.35],
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

/** Lathe of an (r, y) profile about the y axis. */
export function latheY(profile: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/** Knurled 4 mm binding post (brass), base at the origin; returns the cable point on top. */
function bindingPost(k: PartsSink, red: boolean): THREE.Group {
  const g = new THREE.Group();
  const collar = k.mesh(
    k.geo(
      latheY([
        [0, 0],
        [0.075, 0],
        [0.075, 0.05],
        [0.05, 0.06],
      ]),
    ),
    'plastic',
    red ? 'socketRed' : 'socketBlack',
  );
  const nut = k.mesh(
    k.geo(
      latheY(
        [
          [0, 0.06],
          [0.06, 0.06],
          [0.065, 0.08],
          [0.065, 0.14],
          [0.055, 0.16],
          [0.022, 0.17],
          [0, 0.17],
        ],
        12,
      ),
    ),
    'brass',
    'post',
  );
  g.add(collar, nut);
  return g;
}
/** Height of the cable point above a binding post base. */
export const POST_TOP = 0.15;

export interface Apparatus {
  root: THREE.Group;
  occluders: THREE.Object3D[];
  /** World cable points. */
  batPlus: THREE.Vector3;
  batMinus: THREE.Vector3;
  swHingePost: THREE.Vector3;
  swJawPost: THREE.Vector3;
  resLeftPost: THREE.Vector3;
  resRightPost: THREE.Vector3;
  /** Field-coil socket cable points (left = black, right = red). */
  solLeft: THREE.Vector3;
  solRight: THREE.Vector3;
  /** Resistance-wire helix (left → right), world. */
  resHelix: THREE.Vector3[];
  /** Cell positions (base centre) of the 16 tray slots, in series order. */
  cellPos: THREE.Vector3[];
  /** Knife-switch blade (rotates about z at the hinge). */
  blade: THREE.Group;
  /** Instanced cells, their caps and the series straps (count driven by E). */
  cells: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  straps: THREE.InstancedMesh;
  /** Resistance wire meshes: normal / false colour. */
  resWire: THREE.Mesh;
  resThermal: THREE.Mesh;
}

export function buildApparatus(k: PartsSink, maxCells: number): Apparatus {
  const root = new THREE.Group();
  root.name = 'bench';
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const add = <T extends THREE.Object3D>(m: T, x = 0, y = 0, z = 0): T => {
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    kind: MaterialKind,
    key: string,
    x: number,
    y: number,
    z: number,
    c = 0.02,
  ): THREE.Mesh => add(k.mesh(k.geo(chamferBox(w, h, d, c)), kind, key), x, y, z);
  const post = (red: boolean, x: number, y: number, z: number): THREE.Vector3 => {
    add(bindingPost(k, red), x, y, z);
    return v(x, y + POST_TOP, z);
  };

  // --- bench board ---------------------------------------------------------------------------
  const board = box(
    10.4,
    BOARD_T,
    4.9,
    'plastic',
    'wood',
    -0.75,
    BENCH_TOP - BOARD_T / 2,
    0.2,
    0.04,
  );
  board.receiveShadow = true;

  // --- battery tray: bakelite walls, 16 slots, terminal block on the right ----------------------
  const trayW = 8 * BAT.pitch + 0.16;
  const trayD = 2 * BAT.pitch + 0.16;
  box(trayW, 0.06, trayD, 'plastic', 'bakelite', BAT.x, 0.03, BAT.z);
  for (const s of [-1, 1]) {
    box(trayW, 0.3, 0.05, 'plastic', 'bakelite', BAT.x, 0.15, BAT.z + (s * (trayD - 0.05)) / 2);
    box(0.05, 0.3, trayD, 'plastic', 'bakelite', BAT.x + (s * (trayW - 0.05)) / 2, 0.15, BAT.z);
  }
  // divider between the rows
  box(trayW - 0.1, 0.18, 0.025, 'plastic', 'bakelite', BAT.x, 0.09, BAT.z);
  const tbX = BAT.x + trayW / 2 + 0.17;
  box(0.3, 0.16, trayD, 'plastic', 'bakelite', tbX, 0.08, BAT.z);
  const batMinus = post(false, tbX, 0.16, BAT.z - 0.2);
  const batPlus = post(true, tbX, 0.16, BAT.z + 0.2);
  const cellPos: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const row0 = i < 8;
    const col = row0 ? i : 15 - i;
    cellPos.push(
      v(
        BAT.x - (7 * BAT.pitch) / 2 + col * BAT.pitch,
        BAT.y0,
        BAT.z + (row0 ? -1 : 1) * (BAT.pitch / 2),
      ),
    );
  }
  const cellGeo = k.geo(
    latheY(
      [
        [0, 0],
        [BAT.r - 0.01, 0],
        [BAT.r, 0.012],
        [BAT.r, BAT.h - 0.012],
        [BAT.r - 0.012, BAT.h],
        [0, BAT.h],
      ],
      24,
    ),
  );
  const capGeo = k.geo(
    latheY(
      [
        [0, BAT.h],
        [0.05, BAT.h],
        [0.05, BAT.h + 0.035],
        [0, BAT.h + 0.04],
      ],
      12,
    ),
  );
  const cells = new THREE.InstancedMesh(cellGeo, undefined, maxCells);
  const caps = new THREE.InstancedMesh(capGeo, undefined, maxCells);
  const straps = new THREE.InstancedMesh(
    k.geo(chamferBox(1, 0.018, 0.07, 0.005)),
    undefined,
    maxCells,
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < maxCells; i++) {
    const p = cellPos[i % 16] as THREE.Vector3;
    cells.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    caps.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
    const n = cellPos[(i + 1) % 16] as THREE.Vector3;
    const d = n.clone().sub(p);
    q.setFromAxisAngle(v(0, 1, 0), -Math.atan2(d.z, d.x));
    sc.set(d.length() + 0.08, 1, 1);
    m4.compose(v((p.x + n.x) / 2, BAT.y0 + BAT.h + 0.045, (p.z + n.z) / 2), q, sc);
    straps.setMatrixAt(i, m4);
  }
  root.add(cells, caps, straps);

  // --- knife switch: slate base, brass blocks, copper clips, hinged blade ------------------------
  box(1.55, 0.1, 0.66, 'plastic', 'slate', SW.x, 0.05, SW.z, 0.025);
  const screwGeo = k.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      add(k.mesh(screwGeo, 'steel', 'nickel'), SW.x + sx * 0.66, 0.105, SW.z + sz * 0.24);
  for (const x of [SW.hinge, SW.jaw]) {
    box(0.2, 0.07, 0.26, 'brass', 'post', x, 0.135, SW.z, 0.012);
    for (const dz of [-0.055, 0.055])
      box(0.12, 0.2, 0.018, 'copper', 'blade', x, 0.26, SW.z + dz, 0.005);
  }
  add(
    k.mesh(
      k.geo(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 12).rotateX(Math.PI / 2)),
      'steel',
      'nickel',
    ),
    SW.hinge,
    SW.y,
    SW.z,
  );
  const swHingePost = post(true, SW.hinge - 0.3, 0.1, SW.z + 0.08);
  const swJawPost = post(true, SW.jaw + 0.3, 0.1, SW.z + 0.08);
  box(0.24, 0.02, 0.05, 'brass', 'post', SW.hinge - 0.18, 0.11, SW.z + 0.08, 0.005);
  box(0.24, 0.02, 0.05, 'brass', 'post', SW.jaw + 0.18, 0.11, SW.z + 0.08, 0.005);
  const blade = new THREE.Group();
  blade.position.set(SW.hinge, SW.y, SW.z);
  const bladeLen = SW.jaw - SW.hinge;
  const bladeBar = k.mesh(
    k.geo(
      chamferBox(bladeLen + 0.2, 0.09, 0.07, 0.01).translate((bladeLen + 0.2) / 2 - 0.04, 0, 0),
    ),
    'copper',
    'blade',
  );
  const stem = k.mesh(k.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10)), 'steel', 'nickel');
  stem.position.set(bladeLen + 0.1, 0.09, 0);
  const handle = k.mesh(
    k.geo(
      latheY(
        [
          [0, 0],
          [0.05, 0],
          [0.075, 0.08],
          [0.07, 0.2],
          [0.05, 0.25],
          [0, 0.26],
        ],
        16,
      ),
    ),
    'plastic',
    'bakelite',
  );
  handle.position.set(bladeLen + 0.1, 0.14, 0);
  blade.add(bladeBar, stem, handle);
  root.add(blade);

  // --- rheostat: ceramic tube, end plates, slider rod, resistance wire ---------------------------
  const ceramic = add(
    k.mesh(
      k.geo(new THREE.CylinderGeometry(RES.r, RES.r, RES.len, 32).rotateZ(Math.PI / 2)),
      'plastic',
      'ceramic',
    ),
    RES.x,
    RES.y,
    RES.z,
  );
  for (const s of [-1, 1]) {
    const x = RES.x + s * (RES.len / 2 + 0.05);
    box(0.08, RES.y + 0.42, 0.5, 'plastic', 'stand', x, (RES.y + 0.42) / 2, RES.z, 0.02);
    box(0.28, 0.04, 0.6, 'plastic', 'stand', x + s * 0.06, 0.02, RES.z, 0.01);
  }
  const rodY = RES.y + RES.r + 0.17;
  box(RES.len + 0.2, 0.05, 0.05, 'steel', 'rod', RES.x, rodY, RES.z, 0.008);
  const sliderX = RES.x + RES.len / 2 - 0.28;
  box(0.16, 0.12, 0.14, 'brass', 'post', sliderX, rodY, RES.z, 0.015);
  box(0.03, 0.15, 0.05, 'copper', 'blade', sliderX, rodY - 0.12, RES.z, 0.005);
  add(
    k.mesh(
      k.geo(
        latheY(
          [
            [0, 0],
            [0.04, 0],
            [0.04, 0.12],
            [0, 0.13],
          ],
          12,
        ),
      ),
      'plastic',
      'bakelite',
    ),
    sliderX,
    rodY + 0.06,
    RES.z,
  );
  const resLeftPost = post(false, RES.x - RES.len / 2 - 0.18, 0.04, RES.z + 0.18);
  const resRightPost = post(true, RES.x + RES.len / 2 + 0.18, 0.04, RES.z + 0.18);
  const resHelix: THREE.Vector3[] = [];
  {
    const turns = 44;
    const per = 16;
    const n = turns * per;
    const x0 = RES.x - RES.len / 2 + 0.1;
    const x1 = RES.x + RES.len / 2 - 0.1;
    for (let i = 0; i <= n; i++) {
      const a = (i / per) * 2 * Math.PI;
      resHelix.push(
        v(
          x0 + ((x1 - x0) * i) / n,
          RES.y + (RES.r + 0.012) * Math.cos(a),
          RES.z + (RES.r + 0.012) * Math.sin(a),
        ),
      );
    }
  }
  const resGeo = k.geo(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(resHelix), resHelix.length, 0.014, 6),
  );
  const resWire = k.mesh(resGeo, 'steel', 'resWire');
  const resThermal = k.mesh(resGeo, 'plastic', 'resThermal');
  resThermal.visible = false;
  root.add(resWire, resThermal);

  // --- field-coil stands: painted base plates, posts, saddles, 4 mm sockets -----------------------
  const sockets: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const x = SOL.x + s * (SOL.tube / 2 - 0.12);
    box(0.44, 0.05, 1.3, 'plastic', 'stand', x, 0.025, SOL.z, 0.012);
    const top = SOL.y - SOL.r - 0.05;
    box(0.14, top - 0.05, 0.14, 'plastic', 'stand', x, 0.05 + (top - 0.05) / 2, SOL.z, 0.02);
    box(0.2, 0.1, 0.6, 'plastic', 'stand', x, top, SOL.z, 0.02);
    // socket on the foot, toward the bench front
    sockets.push(post(s > 0, x, 0.05, SOL.z + 0.5));
  }

  return {
    root,
    occluders: [ceramic],
    batPlus,
    batMinus,
    swHingePost,
    swJawPost,
    resLeftPost,
    resRightPost,
    solLeft: sockets[0] as THREE.Vector3,
    solRight: sockets[1] as THREE.Vector3,
    resHelix,
    cellPos,
    blade,
    cells,
    caps,
    straps,
    resWire,
    resThermal,
  };
}
