/**
 * Static apparatus of the `lenz` scene (teardown look): a school induction demonstration —
 * bar magnet on a rider of a small aluminium optical-bench rail, a coil on a bakelite stand
 * with 4 mm sockets, a centre-zero demonstration galvanometer and red/black 4 mm leads, all on
 * a varnished base board.
 *
 * Reference (one source): LD Didactic / Leybold 562 13 "Coil, 250 turns"
 * (https://www.leybold-shop.com/coil-250-turns-56213.html): 250 turns of 1,5 mm enamelled wire,
 * 4 mm safety sockets on the coil body. The magnet length (8 cm) and the coil radius a come from
 * the sim's model (`model.ts`), 1 scene unit = 5 cm. ILLUSTRATIVE (not from the source): the
 * magnet cross-section, rail profile, rider, coil stand, galvanometer case and board sizes;
 * the drawn wire is thicker than 1,5 mm so the winding reads at bench distance.
 */
import * as THREE from 'three';
import { chamferBox, type MaterialKind, type Stage } from '../../render';
import { latheZ } from '../mguk-teardown/parts';

/** Resource sink of the scene (tracked geometries / materials / textures). */
export interface PartsSink {
  geo<G extends THREE.BufferGeometry>(g: G): G;
  mat<M extends THREE.Material>(m: M): M;
  mesh(g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh;
  tex<T extends THREE.Texture>(t: T): T;
}

export const BENCH_TOP = -2.15;
export const BOARD_T = 0.22;
export const FLOOR_Y = BENCH_TOP - BOARD_T - 0.08;
export const RAIL_X0 = 0.95;
export const RAIL_X1 = 6.35;
export const RAIL_TOP = BENCH_TOP + 0.16;
/** Coil stand: bakelite foot block (top) and its 4 mm sockets (x, z). */
export const STAND_TOP = BENCH_TOP + 0.34;
export const STAND_SOCKETS: ReadonlyArray<[number, number]> = [
  [-0.36, 1.08],
  [0.36, 1.08],
];
export const GALVO_POS = new THREE.Vector3(-2.85, BENCH_TOP, 1.15);
export const GALVO_YAW = 0.3;
export const GALVO_SCALE = 1.25;
/** Plug body height above the socket top (world units at scale 1). */
export const PLUG_H = 0.34;

/** Teardown tints of the kit materials (re-applied every frame: tier switches replace them). */
export const TINTS: Array<[MaterialKind, string, number, number]> = [
  ['plastic', 'bakelite', 0x2c2724, 0.5],
  ['plastic', 'wood', 0x5e3f26, 0.62],
  ['plastic', 'socketRed', 0xa8261e, 0.42],
  ['plastic', 'socketBlack', 0x17181b, 0.45],
  ['plastic', 'scale', 0xa9a395, 0.75],
  ['steel', 'alu', 0xb9c0c8, 0.48],
  ['steel', 'rod', 0xc4cad1, 0.4],
  ['brass', 'ring', 0xd2a84e, 0.4],
];

/** Paper dial of the centre-zero galvanometer (procedural canvas). */
export function dialCanvas(): HTMLCanvasElement {
  const W = 512;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f1ece0');
  grad.addColorStop(1, '#dcd4c2');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = 301;
  const R = 226;
  const toXY = (deg: number, r: number): [number, number] => {
    const t = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
  };
  g.strokeStyle = '#2b2f36';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2 - (50 * Math.PI) / 180, -Math.PI / 2 + (50 * Math.PI) / 180);
  g.stroke();
  // ticks: 20 divisions over ±50° (full scale ±10)
  for (let k = -10; k <= 10; k++) {
    const deg = k * 5;
    const major = k % 5 === 0;
    const [x0, y0] = toXY(deg, R);
    const [x1, y1] = toXY(deg, R - (major ? 26 : 14));
    g.lineWidth = major ? 3.2 : 1.6;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (major) {
      const [tx, ty] = toXY(deg, R - 46);
      g.fillStyle = '#20242a';
      g.font = '600 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(Math.abs(k)), tx, ty);
    }
  }
  g.font = '700 34px system-ui, sans-serif';
  g.fillStyle = '#20242a';
  const [mx, my] = toXY(-56, R + 6);
  const [px, py] = toXY(56, R + 6);
  g.fillText('−', mx, my);
  g.fillText('+', px, py);
  g.font = '600 20px system-ui, sans-serif';
  g.fillStyle = '#4a515c';
  g.fillText('i', cx, cy - 120);
  g.font = '500 15px system-ui, sans-serif';
  g.fillText('fondo scala = 10 divisioni', cx, cy - 92);
  // mirror strip (anti-parallax) under the arc
  g.strokeStyle = 'rgba(120,130,140,0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, R - 62, -Math.PI / 2 - 0.82, -Math.PI / 2 + 0.82);
  g.stroke();
  return c;
}

/** Wire cross-sections (copper discs in varnish) for the coil's section caps; one disc per tile. */
export function wireSectionCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#3a1e12';
    x.fillRect(0, 0, 32, 32);
    const g = x.createRadialGradient(13, 13, 2, 16, 16, 14);
    g.addColorStop(0, '#f3b07a');
    g.addColorStop(0.7, '#c46a3a');
    g.addColorStop(1, '#7a3a1c');
    x.fillStyle = g;
    x.beginPath();
    x.arc(16, 16, 13.5, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

/** 4 mm banana plug standing in a socket: bottom at the origin, cable leaves from the top. */
export function plug(k: PartsSink, red: boolean): THREE.Group {
  const g = new THREE.Group();
  const key = red ? 'socketRed' : 'socketBlack';
  // shrouded body (lathed), grip ridges, strain relief
  const body = k.mesh(
    k.geo(
      latheZ(
        [
          [0.0, 0.0],
          [0.075, 0.0],
          [0.075, 0.2],
          [0.062, 0.24],
          [0.062, 0.3],
          [0.04, PLUG_H],
          [0.0, PLUG_H],
        ],
        20,
      ).rotateX(-Math.PI / 2),
    ),
    'plastic',
    key,
  );
  g.add(body);
  return g;
}

/** 4 mm socket: brass contact in a coloured collar, flush with a top surface at y = 0. */
function socket(k: PartsSink, red: boolean): THREE.Group {
  const g = new THREE.Group();
  const collar = k.mesh(
    k.geo(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 24)),
    'plastic',
    red ? 'socketRed' : 'socketBlack',
  );
  collar.position.y = 0.03;
  const nut = k.mesh(k.geo(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 6)), 'brass', 'ring');
  nut.position.y = 0.01;
  g.add(nut, collar);
  return g;
}

/** Base board, rail with its printed scale, coil stand. */
export function buildBench(
  k: PartsSink,
  stage: Stage,
): {
  root: THREE.Group;
  occluders: THREE.Object3D[];
  standPost: THREE.Mesh;
  /** World positions of the cable end at the top of each coil-stand plug (A = −, B = +). */
  standPlugs: THREE.Vector3[];
} {
  const root = new THREE.Group();
  root.name = 'bench';
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => {
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  // varnished board on rubber feet, darker edge band, brass wood screws
  const BX = 1.15;
  const BZ = 0.75;
  add(
    k.mesh(k.geo(chamferBox(11.6, BOARD_T, 4.1, 0.06)), 'plastic', 'wood'),
    BX,
    BENCH_TOP - BOARD_T / 2,
    BZ,
  );
  add(
    k.mesh(k.geo(chamferBox(11.5, 0.05, 4.0, 0.02)), 'plastic', 'bakelite'),
    BX,
    BENCH_TOP - BOARD_T - 0.025,
    BZ,
  );
  const footGeo = k.geo(new THREE.CylinderGeometry(0.22, 0.26, 0.04, 20));
  const screwGeo = k.geo(new THREE.CylinderGeometry(0.08, 0.065, 0.03, 20));
  for (const fx of [-5.3, 5.3])
    for (const fz of [-1.6, 1.6]) {
      add(k.mesh(footGeo, 'rubber'), BX + fx, FLOOR_Y + 0.02, BZ + fz);
      add(k.mesh(screwGeo, 'brass', 'ring'), BX + fx + 0.12, BENCH_TOP + 0.01, BZ + fz + 0.12);
    }

  // aluminium bench rail: base flange, raised track with a centre slot, end stops
  const RL = RAIL_X1 - RAIL_X0;
  const RX = (RAIL_X0 + RAIL_X1) / 2;
  add(k.mesh(k.geo(chamferBox(RL, 0.05, 0.5, 0.015)), 'steel', 'alu'), RX, BENCH_TOP + 0.025, 0);
  for (const sz of [-1, 1])
    add(
      k.mesh(k.geo(chamferBox(RL, 0.11, 0.14, 0.02)), 'steel', 'alu'),
      RX,
      BENCH_TOP + 0.05 + 0.055,
      sz * 0.11,
    );
  add(
    k.mesh(k.geo(chamferBox(RL - 0.02, 0.02, 0.08, 0.005)), 'darkSteel'),
    RX,
    BENCH_TOP + 0.06,
    0,
  );
  const stopGeo = k.geo(chamferBox(0.12, 0.26, 0.56, 0.03));
  const capScrew = k.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16).rotateZ(Math.PI / 2));
  for (const [x, s] of [
    [RAIL_X0 - 0.06, -1],
    [RAIL_X1 + 0.06, 1],
  ] as const) {
    add(k.mesh(stopGeo, 'darkSteel'), x, BENCH_TOP + 0.13, 0);
    for (const z of [-0.14, 0.14])
      add(k.mesh(capScrew, 'steel'), x + s * 0.07, BENCH_TOP + 0.13, z);
  }

  // printed cm scale beside the rail (distance z of the magnet centre, to scale)
  add(
    k.mesh(k.geo(chamferBox(RL + 0.3, 0.02, 0.3, 0.008, 1)), 'plastic', 'scale'),
    RX,
    BENCH_TOP + 0.01,
    0.5,
  );
  const SCALE = 20;
  const tickGeo = k.geo(new THREE.BoxGeometry(0.014, 0.008, 1));
  const firstCm = Math.ceil((RAIL_X0 / SCALE) * 100);
  const nTicks = Math.floor((RAIL_X1 / SCALE) * 100) - firstCm + 1;
  const ticks = new THREE.InstancedMesh(tickGeo, undefined, nTicks);
  stage.materials.assign(ticks, 'darkSteel', 'ticks');
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nTicks; i++) {
    const cm = firstCm + i;
    const len = cm % 5 === 0 ? 0.17 : 0.08;
    m4.makeScale(1, 1, len);
    m4.setPosition((cm / 100) * SCALE, BENCH_TOP + 0.024, 0.37 + len / 2);
    ticks.setMatrixAt(i, m4);
  }
  root.add(ticks);

  // coil stand: bakelite foot block with two sockets, and a cradle post under the flanges
  const foot = k.mesh(
    k.geo(chamferBox(1.5, STAND_TOP - BENCH_TOP, 2.3, 0.07)),
    'plastic',
    'bakelite',
  );
  add(foot, 0, (STAND_TOP + BENCH_TOP) / 2, 0.15);
  const standPost = k.mesh(k.geo(chamferBox(0.9, 1, 0.56, 0.04)), 'plastic', 'bakelite');
  root.add(standPost);
  const standPlugs: THREE.Vector3[] = [];
  for (const [i, [sx, sz]] of STAND_SOCKETS.entries()) {
    const red = i === 1;
    add(socket(k, red), sx, STAND_TOP, sz);
    add(plug(k, red), sx, STAND_TOP + 0.06, sz);
    standPlugs.push(new THREE.Vector3(sx, STAND_TOP + 0.06 + PLUG_H - 0.01, sz));
    // grommet where the winding tail enters the foot
    add(
      k.mesh(k.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16)), 'rubber'),
      sx * 0.55,
      STAND_TOP + 0.015,
      0.78,
    );
  }
  return { root, occluders: [foot], standPost, standPlugs };
}

/** Demonstration galvanometer (centre zero): plinth, bakelite case, bezel, dial, glass, needle. */
export function buildGalvanometer(
  k: PartsSink,
  dialMap: THREE.Texture,
): {
  root: THREE.Group;
  needlePivot: THREE.Group;
  caseMesh: THREE.Mesh;
  /** World positions of the cable end at the top of each plug (0 = −, 1 = +). */
  terminals: THREE.Vector3[];
  /** World points of the path inside the meter, from + back to −. */
  inner: THREE.Vector3[];
} {
  const root = new THREE.Group();
  root.position.copy(GALVO_POS);
  root.rotation.y = GALVO_YAW;
  root.scale.setScalar(GALVO_SCALE);
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => {
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  const PLY = 0.2;
  add(k.mesh(k.geo(chamferBox(1.9, PLY, 1.1, 0.05)), 'plastic', 'bakelite'), 0, PLY / 2, 0.1);
  const footGeo = k.geo(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 16));
  for (const fx of [-0.8, 0.8])
    for (const fz of [-0.35, 0.55]) add(k.mesh(footGeo, 'rubber'), fx, -0.01, fz);
  const caseMesh = k.mesh(k.geo(chamferBox(1.66, 1.3, 0.64, 0.1)), 'plastic', 'bakelite');
  add(caseMesh, 0, PLY + 0.65, -0.12);
  const DY = PLY + 0.72;
  const FZ = -0.12 + 0.32;
  add(k.mesh(k.geo(chamferBox(1.5, 0.98, 0.04, 0.02, 1)), 'steel', 'rod'), 0, DY, FZ + 0.005);
  const dialMat = k.mat(
    new THREE.MeshStandardMaterial({
      map: dialMap,
      emissiveMap: dialMap,
      emissive: 0xffffff,
      emissiveIntensity: 0.16,
      roughness: 0.8,
      metalness: 0,
    }),
  );
  add(new THREE.Mesh(k.geo(new THREE.PlaneGeometry(1.36, 0.86)), dialMat), 0, DY, FZ + 0.03);
  const cover = k.mesh(k.geo(new THREE.PlaneGeometry(1.4, 0.9)), 'glass', 'galvo');
  cover.castShadow = false;
  cover.renderOrder = 5;
  add(cover, 0, DY, FZ + 0.06);
  const needlePivot = new THREE.Group();
  add(needlePivot, 0, DY - 0.38, FZ + 0.045);
  needlePivot.add(
    k.mesh(
      k.geo(new THREE.BoxGeometry(0.016, 0.66, 0.008).translate(0, 0.33, 0)),
      'glowI',
      'needle',
    ),
    k.mesh(
      k.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24).rotateX(Math.PI / 2)),
      'darkSteel',
    ),
  );
  // zero-adjust screw and bezel screws
  const sGeo = k.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16).rotateX(Math.PI / 2));
  add(k.mesh(sGeo, 'steel', 'rod'), 0, PLY + 0.13, FZ + 0.01);
  for (const sx of [-0.68, 0.68])
    for (const sy of [-0.42, 0.42]) add(k.mesh(sGeo, 'darkSteel'), sx, DY + sy, FZ + 0.03);
  // sockets on the plinth top, in front of the case: − (black) left, + (red) right
  const terminals: THREE.Vector3[] = [];
  for (const [i, sx] of [-0.55, 0.55].entries()) {
    const red = i === 1;
    add(socket(k, red), sx, PLY, 0.45);
    add(plug(k, red), sx, PLY + 0.06, 0.45);
    terminals.push(new THREE.Vector3(sx, PLY + 0.06 + PLUG_H - 0.01, 0.45));
  }
  root.updateMatrixWorld(true);
  const terminalsW = terminals.map((t) => root.localToWorld(t.clone()));
  const inner = [
    new THREE.Vector3(0.55, PLY + 0.1, 0.3),
    new THREE.Vector3(0, PLY + 0.5, -0.1),
    new THREE.Vector3(-0.55, PLY + 0.1, 0.3),
  ].map((p) => root.localToWorld(p));
  return { root, needlePivot, caseMesh, terminals: terminalsW, inner };
}

/** Rider of the rail with a pillar and a cradle for the magnet (moves with it along x). */
export function buildCarriage(k: PartsSink, magSide: number): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(k.mesh(k.geo(chamferBox(0.76, 0.2, 0.62, 0.05)), 'darkSteel'), 0, RAIL_TOP + 0.1, 0);
  // clamping thumbscrew on the front of the rider
  add(
    k.mesh(
      k.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12).rotateX(Math.PI / 2)),
      'steel',
      'rod',
    ),
    0,
    RAIL_TOP + 0.1,
    0.38,
  );
  add(
    k.mesh(k.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18).rotateX(Math.PI / 2)), 'rubber'),
    0,
    RAIL_TOP + 0.1,
    0.47,
  );
  const y0 = RAIL_TOP + 0.2;
  const y1 = -magSide / 2 - 0.08;
  const rod = k.mesh(k.geo(new THREE.CylinderGeometry(0.05, 0.05, y1 - y0, 16)), 'steel', 'rod');
  add(rod, 0, (y0 + y1) / 2, 0);
  // brass collar and the cradle: plate + two cheeks hugging the magnet
  add(
    k.mesh(k.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 18)), 'brass', 'ring'),
    0,
    y0 + 0.08,
    0,
  );
  add(
    k.mesh(k.geo(chamferBox(0.5, 0.06, magSide + 0.16, 0.02)), 'darkSteel'),
    0,
    -magSide / 2 - 0.04,
    0,
  );
  const cheek = k.geo(chamferBox(0.5, 0.2, 0.05, 0.015));
  for (const s of [-1, 1])
    add(k.mesh(cheek, 'darkSteel'), 0, -magSide / 2 + 0.06, s * (magSide / 2 + 0.035));
  return g;
}

/** Re-apply the teardown tints (kit materials are replaced on a tier/theme switch). */
export function applyTints(stage: Stage): void {
  const kit = stage.materials;
  for (const [kind, key, color, rough] of TINTS) {
    const m = kit.get(kind, key) as THREE.MeshStandardMaterial;
    m.color.setHex(color);
    if ('roughness' in m) m.roughness = rough;
    if ('envMapIntensity' in m) m.envMapIntensity = 0.6;
  }
}
