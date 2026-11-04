/**
 * Static apparatus of the `alternator-motor` scene (teardown look): a school demonstration
 * generator-motor on a varnished base board — a laminated-iron stator yoke cut open at the front
 * (half the lamination stack removed, red section caps with the plate stripes), painted pole
 * magnets with iron pole shoes, cast pillow-block bearings, a bakelite brush rocker with carbon
 * brushes in brass boxes and 4 mm sockets, an AC/DC converter with a finned heat sink and an open
 * battery tray with its charge gauge.
 *
 * Reference (one source): 3B Scientific U8496300 "Electric motor and generator"
 * (manual: https://www.manualslib.fr/manual/366651/3B-Scientific-Physics-U8496300.html): a
 * rotating coil between two pole pieces, slip rings with brushes, 4 mm connectors, a belt pulley,
 * all on a base board of 200 × 140 × 60 mm. The coil side L and width w come from the sim's model
 * (`model.ts`, DRAW = 8 scene units per metre), so the rig is drawn at the model's scale, not the
 * 200 mm of the school model. ILLUSTRATIVE (not from the source): every other size — stator yoke,
 * plate pitch, pole shoes, pedestals, brush gear, converter, battery tray, board.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chamferBox, type MaterialKind, type Stage } from '../../render';
import { applyTints as applyLenzTints, plug, PLUG_H, type PartsSink } from '../lenz/parts';
import { ringZ } from '../mguk-teardown/parts';

export type { PartsSink };

// --- machine (model frame: B along +x, rotor axis +y) ----------------------------------------------
export const GAP_HALF = 1.0; // pole faces at model x = ±1
export const FACE_HY = 1.4; // along the shaft
export const FACE_HZ = 1.05;
export const SHOE_T = 0.34;
export const RING_IN = 1.78;
export const RING_OUT = 2.12;
export const RING_HALF = 1.55;
export const MAG_T = RING_IN - GAP_HALF - SHOE_T - 0.02;
/** Lamination pitch of the stator stack (illustrative: drawn plates, not 0,5 mm sheets). */
export const PLATE_PITCH = 0.1;

// --- bench (world: shaft along x, N on top) ---------------------------------------------------------
export const BASE_TOP = -2.42;
export const BOARD_T = 0.2;
export const FLOOR_Y = BASE_TOP - BOARD_T - 0.1;
/** Slip rings outboard of the left bearing (model y = world x); 0,32 apart. */
export const SLIP_Y = [-2.42, -2.74] as const;
export const SLIP_R = 0.2;
export const BEARING_X = 1.95;
export const FLY_X = 2.6;
export const END_X = 3.4;
export const SHAFT_END = -3.0;
/** Top of the brush rocker arm (world y). */
export const ARM_TOP = 0.66;
export const CONVERTER_POS = new THREE.Vector3(-3.55, BASE_TOP, 1.45);
export const BATTERY_POS = new THREE.Vector3(-5.3, BASE_TOP, -1.0);

/** Teardown tints of the kit materials (re-applied every frame: tier switches replace them). */
const TINTS: Array<[MaterialKind, string, number, number]> = [
  ['magnet', 'n', 0xa8302a, 0.45],
  ['magnet', 's', 0x2d7d4a, 0.45],
  ['iron', 'lam', 0x8d939b, 0.42],
  ['iron', 'shoe', 0x7b828b, 0.45],
  ['iron', 'cast', 0x3c4a5a, 0.62],
  ['darkSteel', 'anodised', 0x2b3038, 0.5],
  ['plastic', 'cellwrap', 0x2d4580, 0.5],
  ['plastic', 'fan', 0x3a3f47, 0.55],
  ['steel', 'nut', 0xaeb5bd, 0.45],
];

export function applyTints(stage: Stage): void {
  applyLenzTints(stage);
  const kit = stage.materials;
  for (const [kind, key, color, rough] of TINTS) {
    const m = kit.get(kind, key) as THREE.MeshStandardMaterial;
    m.color.setHex(color);
    if ('roughness' in m) m.roughness = rough;
    if ('envMapIntensity' in m) m.envMapIntensity = 0.6;
  }
}

/** Section texture of the cut stack: red cut-face paint with the plate joints as dark stripes. */
export function laminationCapCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#9a3d2e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#4a1a14';
  g.fillRect(0, 0, 64, 9);
  g.fillStyle = '#b8574a';
  g.fillRect(0, 9, 64, 3);
  return c;
}

const hexNut = (k: PartsSink, r: number, h: number): THREE.Mesh =>
  k.mesh(k.geo(new THREE.CylinderGeometry(r, r, h, 6)), 'steel', 'nut');

/**
 * Stator in the model frame: back half of the laminated yoke (plates 0..π in the shape plane,
 * model z ≤ 0), end clamp plates, through-bolts, red section caps on the cut plane z = 0, pole
 * shoes and painted magnets (N at model −x = world top).
 */
export function buildStator(
  k: PartsSink,
  capMat: THREE.Material,
  curveSegments: number,
): { root: THREE.Group; occluders: THREE.Object3D[] } {
  const root = new THREE.Group();
  root.name = 'stator';
  const occluders: THREE.Object3D[] = [];
  const sector = (r0: number, r1: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, 0, Math.PI, false);
    s.absarc(0, 0, r0, Math.PI, 0, true);
    return s;
  };
  // extrusion z → model y, shape y → model −z (the kept half lies behind the cut, z ≤ 0)
  const plate = (r0: number, r1: number, y0: number, t: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(sector(r0, r1), { depth: t, bevelEnabled: false, curveSegments })
      .rotateX(-Math.PI / 2)
      .translate(0, y0, 0);
  const n = Math.round((2 * RING_HALF) / PLATE_PITCH);
  const t = PLATE_PITCH * 0.84;
  const plates = Array.from({ length: n }, (_, i) =>
    plate(RING_IN, RING_OUT, -RING_HALF + i * PLATE_PITCH + (PLATE_PITCH - t) / 2, t),
  );
  const stackGeo = mergeGeometries(plates) as THREE.BufferGeometry;
  for (const p of plates) p.dispose();
  const stack = k.mesh(k.geo(stackGeo), 'iron', 'lam');
  root.add(stack);
  occluders.push(stack);
  // end clamp plates (slightly proud of the stack) and 3 through-bolts with nuts
  for (const s of [-1, 1]) {
    const cp = k.mesh(
      k.geo(plate(RING_IN + 0.04, RING_OUT + 0.03, s < 0 ? -RING_HALF - 0.06 : RING_HALF, 0.06)),
      'darkSteel',
    );
    root.add(cp);
  }
  const rMid = (RING_IN + RING_OUT) / 2;
  const boltGeo = k.geo(new THREE.CylinderGeometry(0.035, 0.035, 2 * RING_HALF + 0.3, 10));
  for (const a of [0.55, Math.PI / 2, Math.PI - 0.55]) {
    const x = rMid * Math.cos(a);
    const z = -rMid * Math.sin(a);
    const b = k.mesh(boltGeo, 'steel', 'nut');
    b.position.set(x, 0, z);
    root.add(b);
    for (const s of [-1, 1]) {
      const nut = hexNut(k, 0.075, 0.07);
      nut.position.set(x, s * (RING_HALF + 0.095), z);
      root.add(nut);
    }
  }
  // section caps on the cut plane (normal +z, towards the camera); v runs along the stack
  const capGeo = k.geo(new THREE.PlaneGeometry(RING_OUT - RING_IN, 2 * RING_HALF));
  const uv = capGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * n);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(s * rMid, 0, 0.002);
    root.add(cap);
  }
  // pole shoes (laminated iron) and the painted magnets behind them
  const shoeGeo = k.geo(chamferBox(SHOE_T, 2 * FACE_HY, 2 * FACE_HZ, 0.05));
  const magGeo = k.geo(chamferBox(MAG_T, 2 * FACE_HY + 0.1, 1.7, 0.06));
  for (const side of [-1, 1] as const) {
    const shoe = k.mesh(shoeGeo, 'iron', 'shoe');
    shoe.position.x = side * (GAP_HALF + SHOE_T / 2);
    const mag = k.mesh(magGeo, 'magnet', side < 0 ? 'n' : 's');
    mag.position.x = side * (GAP_HALF + SHOE_T + MAG_T / 2);
    root.add(shoe, mag);
    occluders.push(shoe, mag);
  }
  return { root, occluders };
}

/** Board, stator saddles, pillow blocks, brush rocker (world). */
export function buildBench(k: PartsSink): {
  root: THREE.Group;
  occluders: THREE.Object3D[];
  /** Cable end at the top of the brush plugs, index as SLIP_Y. */
  brushPlugs: THREE.Vector3[];
  /** Carbon brushes, index as SLIP_Y. */
  brushes: THREE.Mesh[];
} {
  const root = new THREE.Group();
  root.name = 'bench';
  const occluders: THREE.Object3D[] = [];
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => {
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  // varnished board on rubber feet, brass wood screws
  const BX = -0.75;
  const BW = 10.4;
  const BD = 4.4;
  const BZ = 0.45;
  add(
    k.mesh(k.geo(chamferBox(BW, BOARD_T, BD, 0.06)), 'plastic', 'wood'),
    BX,
    BASE_TOP - BOARD_T / 2,
    BZ,
  );
  const footGeo = k.geo(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 20));
  const screwGeo = k.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add(
        k.mesh(footGeo, 'rubber'),
        BX + sx * (BW / 2 - 0.4),
        BASE_TOP - BOARD_T - 0.05,
        BZ + sz * (BD / 2 - 0.4),
      );
      add(
        k.mesh(screwGeo, 'brass', 'ring'),
        BX + sx * (BW / 2 - 0.25),
        BASE_TOP + 0.01,
        BZ + sz * (BD / 2 - 0.25),
      );
    }

  // stator saddles: cast feet whose top follows the yoke's outer radius (behind the cut only)
  {
    const z0 = -1.35;
    const z1 = 0.12;
    const s = new THREE.Shape();
    const yAt = (z: number): number => -Math.sqrt(RING_OUT * RING_OUT - z * z);
    s.moveTo(z0 - 0.15, BASE_TOP);
    s.lineTo(z1 + 0.15, BASE_TOP);
    s.lineTo(z1 + 0.15, yAt(z1) - 0.12);
    s.lineTo(z1, yAt(z1));
    s.absarc(0, 0, RING_OUT, Math.atan2(yAt(z1), z1), Math.atan2(yAt(z0), z0), true);
    s.lineTo(z0 - 0.15, yAt(z0) - 0.12);
    s.closePath();
    const d = 0.42;
    const g = k.geo(
      new THREE.ExtrudeGeometry(s, {
        depth: d,
        bevelEnabled: true,
        bevelSize: 0.02,
        bevelThickness: 0.02,
        bevelSegments: 1,
        curveSegments: 24,
      })
        .rotateY(-Math.PI / 2)
        .translate(d / 2, 0, 0),
    );
    for (const x of [-1.05, 1.05]) {
      const f = k.mesh(g, 'iron', 'cast');
      add(f, x, 0, 0);
      occluders.push(f);
      for (const sz of [z0 - 0.02, z1 + 0.02]) {
        const nut = hexNut(k, 0.07, 0.06);
        add(nut, x, BASE_TOP + 0.03, sz);
      }
    }
  }

  // pillow-block bearings: foot plate, web, housing ring, steel race, cap bolts
  const housingGeo = k.geo(ringZ(0.12, 0.36, -0.17, 0.17, 40, 0.03).rotateY(Math.PI / 2));
  const raceGeo = k.geo(ringZ(0.078, 0.12, -0.13, 0.13, 32, 0.01).rotateY(Math.PI / 2));
  const webH = -0.18 - BASE_TOP;
  const webGeo = k.geo(chamferBox(0.26, webH, 0.66, 0.04));
  const plateGeo = k.geo(chamferBox(0.5, 0.12, 1.15, 0.03));
  for (const x of [-BEARING_X, BEARING_X]) {
    const web = k.mesh(webGeo, 'iron', 'cast');
    add(web, x, BASE_TOP + webH / 2, 0);
    add(k.mesh(plateGeo, 'iron', 'cast'), x, BASE_TOP + 0.06, 0);
    add(k.mesh(housingGeo, 'iron', 'cast'), x, 0, 0);
    add(k.mesh(raceGeo, 'steel'), x, 0, 0);
    for (const sz of [-0.43, 0.43]) add(hexNut(k, 0.07, 0.07), x, BASE_TOP + 0.155, sz);
    add(hexNut(k, 0.06, 0.06), x, 0.385, 0);
    occluders.push(web);
  }

  // brush rocker: bakelite upright behind the rings, an arm over them, brass boxes, carbon brushes
  const xm = (SLIP_Y[0] + SLIP_Y[1]) / 2;
  const upH = ARM_TOP - BASE_TOP;
  add(
    k.mesh(k.geo(chamferBox(0.86, upH, 0.14, 0.03)), 'plastic', 'bakelite'),
    xm,
    BASE_TOP + upH / 2,
    -0.62,
  );
  add(
    k.mesh(k.geo(chamferBox(0.86, 0.14, 0.92, 0.03)), 'plastic', 'bakelite'),
    xm,
    ARM_TOP - 0.07,
    -0.2,
  );
  const boxBot = SLIP_R + 0.13;
  const boxTop = ARM_TOP - 0.14;
  const boxGeo = k.geo(chamferBox(0.16, boxTop - boxBot, 0.2, 0.02));
  const carbonGeo = k.geo(chamferBox(0.11, 0.24, 0.15, 0.015));
  const springGeo = k.geo(chamferBox(0.03, 0.03, 0.22, 0.008, 1));
  const collarGeo = k.geo(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 24));
  const brushes: THREE.Mesh[] = [];
  const brushPlugs: THREE.Vector3[] = [];
  SLIP_Y.forEach((x, i) => {
    add(k.mesh(boxGeo, 'brass', 'ring'), x, (boxBot + boxTop) / 2, 0);
    const c = k.mesh(carbonGeo, 'glowEmf', 'brush');
    add(c, x, SLIP_R + 0.12, 0); // bottom face on the ring top
    brushes.push(c);
    add(k.mesh(springGeo, 'brass', 'ring'), x, boxBot + 0.02, 0.12);
    const red = i === 1;
    const sz = 0.12;
    add(k.mesh(collarGeo, 'plastic', red ? 'socketRed' : 'socketBlack'), x, ARM_TOP + 0.03, sz);
    add(plug(k, red), x, ARM_TOP + 0.03, sz);
    brushPlugs.push(new THREE.Vector3(x, ARM_TOP + 0.03 + PLUG_H, sz));
  });
  return { root, occluders, brushPlugs, brushes };
}

/** AC/DC converter: anodised case, heat-sink fins, a panel with 4 sockets and a status LED. */
export function buildConverter(k: PartsSink): {
  root: THREE.Group;
  body: THREE.Mesh;
  led: THREE.Mesh;
  /** Plug tops: [AC black, AC red, DC red, DC black] (world). */
  plugs: THREE.Vector3[];
} {
  const root = new THREE.Group();
  root.position.copy(CONVERTER_POS);
  const W = 1.1;
  const H = 0.6;
  const D = 0.8;
  const body = k.mesh(k.geo(chamferBox(W, H, D, 0.05)), 'darkSteel', 'anodised');
  body.position.y = H / 2;
  root.add(body);
  const finGeo = k.geo(chamferBox(0.035, 0.2, 0.42, 0.008, 1));
  for (let i = 0; i < 9; i++) {
    const f = k.mesh(finGeo, 'darkSteel', 'anodised');
    f.position.set(-0.46 + i * 0.115, H + 0.1, -0.17);
    root.add(f);
  }
  const panel = k.mesh(k.geo(chamferBox(W - 0.06, 0.03, 0.3, 0.01, 1)), 'plastic', 'bakelite');
  panel.position.set(0, H + 0.015, 0.22);
  root.add(panel);
  const led = k.mesh(k.geo(new THREE.SphereGeometry(0.045, 14, 10)), 'glowI', 'led');
  led.position.set(0, H * 0.62, D / 2 + 0.01);
  root.add(led);
  const collarGeo = k.geo(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 20));
  const xs: Array<[number, boolean]> = [
    [0.4, false],
    [0.2, true],
    [-0.2, true],
    [-0.4, false],
  ];
  const plugs = xs.map(([x, red]) => {
    const c = k.mesh(collarGeo, 'plastic', red ? 'socketRed' : 'socketBlack');
    c.position.set(x, H + 0.055, 0.24);
    const p = plug(k, red);
    p.position.set(x, H + 0.08, 0.24);
    root.add(c, p);
    return new THREE.Vector3(x, H + 0.08 + PLUG_H, 0.24).add(CONVERTER_POS);
  });
  return { root, body, led, plugs };
}

/** Open battery tray: 5 × 3 cells with nickel straps, terminal strip, charge gauge on the front. */
export function buildBattery(k: PartsSink): {
  root: THREE.Group;
  case: THREE.Mesh;
  gaugeFill: THREE.Mesh;
  gaugeH: number;
  /** Plug tops: [+ red, − black] (world). */
  plugs: THREE.Vector3[];
} {
  const root = new THREE.Group();
  root.position.copy(BATTERY_POS);
  const W = 1.7;
  const H = 0.82;
  const D = 1.15;
  const T = 0.06;
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh => {
    const m = k.mesh(k.geo(chamferBox(w, h, d, 0.02)), 'plastic', 'bakelite');
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };
  wall(W, T, D, 0, T / 2, 0);
  const front = wall(W, H, T, 0, H / 2, D / 2 - T / 2);
  wall(W, H, T, 0, H / 2, -D / 2 + T / 2);
  wall(T, H, D, -W / 2 + T / 2, H / 2, 0);
  wall(T, H, D, W / 2 - T / 2, H / 2, 0);
  const cellGeo = k.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.66, 24));
  const capGeo = k.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16));
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const x = -0.6 + i * 0.3;
      const z = -0.32 + j * 0.3;
      const c = k.mesh(cellGeo, 'plastic', 'cellwrap');
      c.position.set(x, T + 0.33, z);
      const cap = k.mesh(capGeo, 'steel', 'cells');
      cap.position.set(x, T + 0.675, z);
      root.add(c, cap);
    }
  const strapGeo = k.geo(chamferBox(0.08, 0.012, 0.86, 0.004, 1));
  for (let i = 0; i < 5; i++) {
    const s = k.mesh(strapGeo, 'steel', 'alu');
    s.position.set(-0.6 + i * 0.3, T + 0.695, -0.02);
    root.add(s);
  }
  // terminal strip along the front wall top
  const strip = wall(W - 0.1, 0.06, 0.24, 0, H + 0.03, D / 2 - 0.12);
  void strip;
  const collarGeo = k.geo(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 20));
  const plugs = (
    [
      [0.55, true],
      [0.3, false],
    ] as Array<[number, boolean]>
  ).map(([x, red]) => {
    const c = k.mesh(collarGeo, 'plastic', red ? 'socketRed' : 'socketBlack');
    c.position.set(x, H + 0.085, D / 2 - 0.12);
    const p = plug(k, red);
    p.position.set(x, H + 0.11, D / 2 - 0.12);
    root.add(c, p);
    return new THREE.Vector3(x, H + 0.11 + PLUG_H, D / 2 - 0.12).add(BATTERY_POS);
  });
  // charge gauge on the front face (fill scaled by the state of charge)
  const gaugeH = 0.6;
  const bg = k.mesh(k.geo(chamferBox(0.24, gaugeH + 0.08, 0.03, 0.01, 1)), 'rubber');
  bg.position.set(-0.55, H / 2, D / 2 + 0.012);
  const gaugeFill = k.mesh(
    k.geo(new THREE.BoxGeometry(0.16, 1, 0.02).translate(0, 0.5, 0)),
    'glowEnergy',
    'gauge',
  );
  gaugeFill.position.set(-0.55, H / 2 - gaugeH / 2, D / 2 + 0.03);
  root.add(bg, gaugeFill);
  return { root, case: front, gaugeFill, gaugeH, plugs };
}

/** A 4 mm lead from plug top a to plug top b, drooping between them. */
export function leadPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number): THREE.Vector3[] {
  const m = a.clone().lerp(b, 0.5);
  m.y = Math.min(a.y, b.y) - sag;
  return [
    a.clone(),
    a.clone().add(new THREE.Vector3(0, 0.25, 0)),
    a
      .clone()
      .lerp(m, 0.6)
      .setY(Math.max(m.y, BASE_TOP + 0.06)),
    new THREE.Vector3(m.x, Math.max(m.y, BASE_TOP + 0.06), m.z),
    b
      .clone()
      .lerp(m, 0.6)
      .setY(Math.max(m.y, BASE_TOP + 0.06)),
    b.clone().add(new THREE.Vector3(0, 0.25, 0)),
    b.clone(),
  ];
}
