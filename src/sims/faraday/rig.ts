/**
 * Static apparatus of the `faraday` scene: a school-lab rotating-coil generator built on a
 * laminated U-core electromagnet (teardown look).
 *
 * Reference (real dimensions, one source): LEYBOLD 562 11 "U-core with yoke", instruction
 * sheet 562 11 (https://www.famaf.unc.edu.ar/~pury/famaf.gui/modern1/leybold/56211e.pdf):
 * limb cross-section 4 cm × 4 cm, width of the U-core 15 cm, height 13 cm. Those three
 * numbers set the iron (1 scene unit = 2,5 cm). ILLUSTRATIVE (not from the sheet): the pole
 * shoes and the 7,5 cm gap, the field-coil bobbins, the rotating-coil former, the aluminium
 * bridge with bearing, slip rings, brush holder, lamp board and pulley.
 *
 * The field coils on the limbs are shown opened (front half removed by a clipping plane,
 * z > 0) with flat section caps: copper turns in cross-section around the laminated limb.
 * Nothing here moves; the rotating coil lives in `scene.ts`.
 */
import * as THREE from 'three';
import { chamferBox, type MaterialKind, type Stage } from '../../render';
import { latheZ } from '../mguk-teardown/parts';

/** Scene units per centimetre (1 unit = 2,5 cm). */
export const UNIT_CM = 2.5;
const cm = (v: number): number => v / UNIT_CM;

// --- iron from the reference (562 11) ---------------------------------------------------
export const LIMB = cm(4); // 1,6
export const CORE_W = cm(15); // 6
export const CORE_H = cm(13); // 5,2
export const LIMB_X = CORE_W / 2 - LIMB / 2; // limb axes at x = ±2,2
// --- illustrative pole shoes and gap ------------------------------------------------------
export const GAP_HALF = 1.5; // pole faces at x = ±1,5 (7,5 cm gap)
export const FACE_HY = 1.45;
export const FACE_HZ = 1.45;
export const LIMB_TOP = -FACE_HY; // shoes sit on the limb ends
export const CORE_BOT = LIMB_TOP - CORE_H; // −6,65
export const YOKE_TOP = CORE_BOT + LIMB;
export const BASE_TOP = CORE_BOT;
export const FLOOR_Y = BASE_TOP - 0.3;
// --- bridge, slip rings, brushes, lamp (illustrative) --------------------------------------
export const BRIDGE_Y = FACE_HY; // underside of the aluminium bridge
export const BRIDGE_T = 0.12;
export const RING_Y = [1.98, 2.34] as const;
export const RING_R = 0.2;
export const SHAFT_TOP = 2.86;
export const SHAFT_BOT = YOKE_TOP + 0.42;
export const BLOCK_Z = [0.56, 0.96] as const; // brush-holder block, front of the shaft
/** Lamp board on the top of the N pole shoe, in front of the bridge. */
export const LAMP_POS = new THREE.Vector3(-2.25, FACE_HY, 0.93);

/** Geometry / material sink with resource tracking (owned by the scene). */
export interface RigSink {
  geo<G extends THREE.BufferGeometry>(g: G): G;
  mat<M extends THREE.Material>(m: M): M;
  tex<T extends THREE.Texture>(t: T): T;
  mesh(g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh;
}

export interface Rig {
  readonly root: THREE.Group;
  /** Lamp parts (glow driven by the scene). */
  readonly lamp: {
    group: THREE.Group;
    bulb: THREE.Mesh;
    light: THREE.PointLight;
  };
  /** Brush blocks (glow ∝ |f.e.m.|). */
  readonly brushes: THREE.Mesh[];
  /** External circuit for f.e.m. > 0: brush 2 → socket → lead → lamp → lead → socket → brush 1. */
  readonly leadPath: THREE.Vector3[];
  readonly occluders: THREE.Object3D[];
  readonly anchors: {
    n: THREE.Vector3;
    s: THREE.Vector3;
    brushes: THREE.Vector3;
    lamp: THREE.Vector3;
  };
}

/** Rounded-square outline (half side h, corner radius r) with an optional square hole. */
export function squareRing(h: number, r: number, hole = 0, holeR = 0): THREE.Shape {
  const s = new THREE.Shape();
  // both loops counter-clockwise: ExtrudeGeometry normalises the hole winding
  const box = (p: THREE.Path, a: number, rc: number): void => {
    const q = a - rc;
    p.moveTo(q, -a);
    p.absarc(q, -q, rc, -Math.PI / 2, 0, false);
    p.absarc(q, q, rc, 0, Math.PI / 2, false);
    p.absarc(-q, q, rc, Math.PI / 2, Math.PI, false);
    p.absarc(-q, -q, rc, Math.PI, 1.5 * Math.PI, false);
    p.closePath();
  };
  box(s, h, Math.max(1e-3, r));
  if (hole > 0) {
    const p = new THREE.Path();
    box(p, hole, Math.max(1e-3, holeR));
    s.holes.push(p);
  }
  return s;
}

/** Prism of a 2D shape extruded along +y from y0 to y1. */
function prismY(shape: THREE.Shape, y0: number, y1: number, segs = 6): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: y1 - y0,
    bevelEnabled: false,
    curveSegments: segs,
  });
  g.rotateX(-Math.PI / 2); // extrusion z → +y, shape y → −z
  g.translate(0, y0, 0);
  return g;
}

/** Canvas texture: horizontal turns of enamelled wire (one dark seam per turn). */
function turnsTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 16;
  const x = c.getContext('2d');
  if (x) {
    const g = x.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, '#5a2a14');
    g.addColorStop(0.25, '#c9773f');
    g.addColorStop(0.5, '#e79a5e');
    g.addColorStop(0.75, '#b8642f');
    g.addColorStop(1, '#5a2a14');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 16);
  }
  return c;
}

/** Canvas texture: wire cross-sections (copper discs in varnish) for the section caps. */
function wireSectionTexture(): HTMLCanvasElement {
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

export function buildRig(stage: Stage, k: RigSink): Rig {
  const root = new THREE.Group();
  root.name = 'rig';
  const occluders: THREE.Object3D[] = [];
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Object3D => {
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  // --- base board (bakelite on rubber feet) -------------------------------------------------
  add(
    k.mesh(k.geo(chamferBox(8.4, 0.26, 4.6, 0.05)), 'plastic', 'bakelite'),
    0,
    BASE_TOP - 0.13,
    0.25,
  );
  const footGeo = k.geo(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 20));
  for (const fx of [-3.8, 3.8])
    for (const fz of [-1.8, 2.3]) add(k.mesh(footGeo, 'rubber'), fx, FLOOR_Y + 0.02, fz);

  // --- U-core: yoke + two limbs, laminated iron (562 11 proportions) -------------------------
  const yoke = k.mesh(k.geo(chamferBox(CORE_W, LIMB, LIMB, 0.03, 1)), 'iron', 'core');
  add(yoke, 0, CORE_BOT + LIMB / 2, 0);
  occluders.push(yoke);
  const limbH = LIMB_TOP - YOKE_TOP;
  const limbGeo = k.geo(chamferBox(LIMB, limbH, LIMB, 0.03, 1));
  for (const sx of [-1, 1]) {
    const limb = k.mesh(limbGeo, 'iron', 'core');
    add(limb, sx * LIMB_X, YOKE_TOP + limbH / 2, 0);
    occluders.push(limb);
  }
  // clamping bolts through the lamination stack of the yoke (front + back)
  const boltGeo = k.geo(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 6).rotateX(Math.PI / 2));
  const washerGeo = k.geo(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24).rotateX(Math.PI / 2));
  for (const bx of [-1.4, 1.4])
    for (const bz of [-1, 1]) {
      add(k.mesh(washerGeo, 'steel'), bx, CORE_BOT + LIMB / 2, bz * (LIMB / 2 + 0.01));
      add(k.mesh(boltGeo, 'darkSteel'), bx, CORE_BOT + LIMB / 2, bz * (LIMB / 2 + 0.05));
    }

  // --- pole shoes on the limb ends, N (−x) and S (+x) ---------------------------------------
  const shoeW = LIMB_X + LIMB / 2 - GAP_HALF;
  const shoeGeo = k.geo(chamferBox(shoeW, 2 * FACE_HY, 2 * FACE_HZ, 0.05));
  const plateGeo = k.geo(new THREE.PlaneGeometry(0.62, 0.62));
  const screwGeo = k.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6));
  for (const sx of [-1, 1] as const) {
    const cx = sx * (GAP_HALF + shoeW / 2);
    const shoe = k.mesh(shoeGeo, 'iron', 'shoe');
    add(shoe, cx, 0, 0);
    occluders.push(shoe);
    const plate = k.mesh(plateGeo, sx < 0 ? 'magnetN' : 'magnetS');
    add(plate, cx, 0.35, FACE_HZ + 0.004);
    for (const z of [-0.95]) add(k.mesh(screwGeo, 'darkSteel'), cx, FACE_HY + 0.03, z);
  }

  // --- field coils on both limbs, front half opened ------------------------------------------
  // bobbin: square tube (bore half 0,85) + flanges (half 1,35); winding outer half 1,25
  const BORE = 0.85;
  const WIND_IN = 0.9;
  const WIND_OUT = 1.25;
  const FLANGE = 1.35;
  const FL_T = 0.1;
  const yb = YOKE_TOP + 0.06;
  const yt = LIMB_TOP - 0.12;
  const cut = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
  stage.renderer.localClippingEnabled = true;
  const turnsTex = k.tex(new THREE.CanvasTexture(turnsTexture()));
  turnsTex.colorSpace = THREE.SRGBColorSpace;
  turnsTex.wrapS = turnsTex.wrapT = THREE.RepeatWrapping;
  turnsTex.repeat.set(1, 1 / 0.05); // one visible turn per 0,05 units (1,25 mm wire, illustrative)
  const windMat = k.mat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: turnsTex,
      metalness: 0.3,
      roughness: 0.48,
      envMapIntensity: 0.6,
      emissive: 0x2a1206, // lifts the copper out of the dark studio, below bloom
      clippingPlanes: cut,
      clipShadows: true,
      side: THREE.DoubleSide,
    }),
  );
  const bobbinMat = k.mat(
    new THREE.MeshStandardMaterial({
      color: 0x2b2f35,
      metalness: 0,
      roughness: 0.55,
      clippingPlanes: cut,
      clipShadows: true,
      side: THREE.DoubleSide,
    }),
  );
  const windGeo = k.geo(prismY(squareRing(WIND_OUT, 0.32, WIND_IN, 0.06), yb + FL_T, yt - FL_T, 8));
  const tubeGeo = k.geo(prismY(squareRing(WIND_IN, 0.06, BORE, 0.04), yb, yt, 4));
  const flangeGeo = k.geo(prismY(squareRing(FLANGE, 0.12, BORE, 0.04), 0, FL_T, 6));
  const capTex = k.tex(new THREE.CanvasTexture(wireSectionTexture()));
  capTex.colorSpace = THREE.SRGBColorSpace;
  capTex.wrapS = capTex.wrapT = THREE.RepeatWrapping;
  const capMat = k.mat(
    new THREE.MeshStandardMaterial({
      map: capTex,
      metalness: 0.4,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const capFlatMat = k.mat(
    new THREE.MeshStandardMaterial({
      color: 0x8a3a2c, // red section colour of cut bakelite, as on exhibition cutaways
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const WIRE = 0.05;
  const capH = yt - yb - 2 * FL_T;
  const capW = WIND_OUT - WIND_IN;
  const windCapGeo = k.geo(new THREE.PlaneGeometry(capW, capH));
  {
    const uv = windCapGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * capW) / WIRE, (uv.getY(i) * capH) / WIRE);
  }
  const flCapGeo = k.geo(new THREE.PlaneGeometry(FLANGE - BORE, FL_T));
  const tubeCapGeo = k.geo(new THREE.PlaneGeometry(WIND_IN - BORE, yt - yb));
  const fieldSocketGeo = k.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 16));
  for (const sx of [-1, 1]) {
    const cx = sx * LIMB_X;
    const w = new THREE.Mesh(windGeo, windMat);
    const t = new THREE.Mesh(tubeGeo, bobbinMat);
    const f0 = new THREE.Mesh(flangeGeo, bobbinMat);
    const f1 = new THREE.Mesh(flangeGeo, bobbinMat);
    add(w, cx, 0, 0);
    add(t, cx, 0, 0);
    add(f0, cx, yb, 0);
    add(f1, cx, yt - FL_T, 0);
    for (const side of [-1, 1]) {
      add(
        new THREE.Mesh(windCapGeo, capMat),
        cx + side * (WIND_IN + capW / 2),
        yb + FL_T + capH / 2,
        0,
      );
      add(
        new THREE.Mesh(tubeCapGeo, capFlatMat),
        cx + side * ((WIND_IN + BORE) / 2),
        (yb + yt) / 2,
        0,
      );
      for (const fy of [yb + FL_T / 2, yt - FL_T / 2])
        add(new THREE.Mesh(flCapGeo, capFlatMat), cx + side * ((FLANGE + BORE) / 2), fy, 0);
    }
    // field-coil terminals (4 mm sockets) on the top flange, outside the pole shoe, back half
    for (const [tz, key] of [
      [-0.45, 'socketRed'],
      [-1.0, 'socketBlack'],
    ] as const)
      add(k.mesh(fieldSocketGeo, 'plastic', key), cx + sx * 1.12, yt + 0.05, tz);
  }

  // --- lower bearing: bakelite block + brass bush on the yoke ----------------------------------
  add(
    k.mesh(k.geo(chamferBox(0.6, SHAFT_BOT - YOKE_TOP - 0.05, 0.6, 0.04)), 'plastic', 'bakelite'),
    0,
    (YOKE_TOP + SHAFT_BOT - 0.05) / 2,
    0,
  );
  add(
    k.mesh(k.geo(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 24)), 'brass'),
    0,
    SHAFT_BOT - 0.02,
    0,
  );

  // --- aluminium bridge across the shoe tops, upper bearing ---------------------------------
  // a narrow bar (the gap stays open from above) with a tongue that carries the brush holder
  const bridgeHalfZ = 0.32;
  const bridge = k.mesh(k.geo(chamferBox(6.0, BRIDGE_T, 2 * bridgeHalfZ, 0.025)), 'steel', 'alu');
  add(bridge, 0, BRIDGE_Y + BRIDGE_T / 2, 0);
  const tongueZ1 = BLOCK_Z[1] + 0.06;
  add(
    k.mesh(k.geo(chamferBox(0.9, BRIDGE_T, tongueZ1 - bridgeHalfZ + 0.04, 0.025)), 'steel', 'alu'),
    0,
    BRIDGE_Y + BRIDGE_T / 2,
    (bridgeHalfZ - 0.04 + tongueZ1) / 2,
  );
  for (const bx of [-2.75, -1.95, 1.95, 2.75])
    add(k.mesh(screwGeo, 'darkSteel'), bx, BRIDGE_Y + BRIDGE_T + 0.03, 0);
  const top = BRIDGE_Y + BRIDGE_T;
  add(
    k.mesh(
      k.geo(
        latheZ(
          [
            [0.05, 0],
            [0.19, 0],
            [0.19, 0.08],
            [0.13, 0.16],
            [0.05, 0.16],
          ],
          32,
        ).rotateX(-Math.PI / 2),
      ),
      'brass',
    ),
    0,
    top,
    0,
  );

  // --- slip-ring stack: bakelite sleeve, two brass rings, grooved pulley on top -------------------
  add(
    k.mesh(
      k.geo(new THREE.CylinderGeometry(0.135, 0.135, RING_Y[1] - RING_Y[0] + 0.42, 28)),
      'plastic',
      'bakelite',
    ),
    0,
    (RING_Y[0] + RING_Y[1]) / 2,
    0,
  );
  const ringGeo = k.geo(
    latheZ(
      [
        [0.13, -0.06],
        [RING_R - 0.015, -0.06],
        [RING_R, -0.045],
        [RING_R, 0.045],
        [RING_R - 0.015, 0.06],
        [0.13, 0.06],
      ],
      48,
    ).rotateX(-Math.PI / 2),
  );
  for (const y of RING_Y) add(k.mesh(ringGeo, 'brass', 'ring'), 0, y, 0);
  add(
    k.mesh(
      k.geo(
        latheZ(
          [
            [0.05, 0],
            [0.34, 0],
            [0.34, 0.03],
            [0.26, 0.08],
            [0.34, 0.13],
            [0.34, 0.16],
            [0.05, 0.16],
          ],
          48,
        ).rotateX(-Math.PI / 2),
      ),
      'steel',
    ),
    0,
    SHAFT_TOP - 0.24,
    0,
  );

  // --- brush holder: bakelite block with two brass leaf springs and carbon brushes -----------------
  const blockY0 = top;
  const blockY1 = RING_Y[1] + 0.32;
  const blockX = 0.82;
  add(
    k.mesh(
      k.geo(chamferBox(blockX, blockY1 - blockY0, BLOCK_Z[1] - BLOCK_Z[0], 0.04)),
      'plastic',
      'bakelite',
    ),
    0,
    (blockY0 + blockY1) / 2,
    (BLOCK_Z[0] + BLOCK_Z[1]) / 2,
  );
  const brushes: THREE.Mesh[] = [];
  const brushGeo = k.geo(chamferBox(0.12, 0.09, 0.2, 0.015, 1));
  const springGeo = k.geo(chamferBox(0.1, 0.018, BLOCK_Z[0] - RING_R - 0.16, 0.006, 1));
  const socketGeo = k.geo(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 20).rotateX(Math.PI / 2));
  const nutGeo = k.geo(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 6).rotateX(Math.PI / 2));
  RING_Y.forEach((y, i) => {
    const b = k.mesh(brushGeo, 'glowEmf', 'brush');
    add(b, 0, y, RING_R + 0.1);
    brushes.push(b);
    add(k.mesh(springGeo, 'brass'), 0, y + 0.055, (RING_R + 0.16 + BLOCK_Z[0]) / 2);
    add(k.mesh(nutGeo, 'brass'), 0.22, y, BLOCK_Z[1] + 0.02);
    add(
      k.mesh(socketGeo, 'plastic', i === 0 ? 'socketBlack' : 'socketRed'),
      -0.18,
      y,
      BLOCK_Z[1] + 0.07,
    );
  });

  // --- lamp board on the bridge (E10 holder, 4 mm sockets) ----------------------------------------
  const lampG = new THREE.Group();
  lampG.position.copy(LAMP_POS);
  root.add(lampG);
  const boardH = 0.22;
  const board = k.mesh(k.geo(chamferBox(0.95, boardH, 0.9, 0.04)), 'plastic', 'bakelite');
  board.position.y = boardH / 2;
  const holder = k.mesh(k.geo(new THREE.CylinderGeometry(0.14, 0.16, 0.24, 28)), 'brass', 'lamp');
  holder.position.y = boardH + 0.12;
  const bulb = k.mesh(k.geo(new THREE.SphereGeometry(0.26, 40, 28)), 'glass', 'lamp');
  bulb.position.y = boardH + 0.5;
  bulb.renderOrder = 4;
  bulb.castShadow = false;
  const filament = k.mesh(
    k.geo(new THREE.TorusGeometry(0.065, 0.012, 8, 32, Math.PI * 1.4)),
    'filament',
    'lamp',
  );
  filament.position.y = boardH + 0.5;
  filament.rotation.z = Math.PI * 0.8;
  const supportGeo = k.geo(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6));
  for (const s of [-1, 1]) {
    const w = k.mesh(supportGeo, 'steel');
    w.position.set(s * 0.055, boardH + 0.37, 0);
    lampG.add(w);
  }
  for (const s of [-1, 1]) {
    const sk = k.mesh(
      k.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16)),
      'plastic',
      s < 0 ? 'socketBlack' : 'socketRed',
    );
    sk.position.set(0.32, boardH + 0.06, s * 0.28);
    lampG.add(sk);
  }
  lampG.add(board, holder, bulb, filament);
  const light = new THREE.PointLight(0xffb86b, 0, 5, 2);
  light.position.y = boardH + 0.5;
  lampG.add(light);

  // --- leads: red from brush 2 socket, black from brush 1 socket, to the lamp board -------------------
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const sockZ = BLOCK_Z[1] + 0.16;
  const lx = LAMP_POS.x + 0.32;
  const ly = LAMP_POS.y + boardH + 0.12;
  const leadPath = [
    v(0, RING_Y[1], RING_R + 0.2),
    v(-0.18, RING_Y[1], sockZ),
    v(-0.45, RING_Y[1] + 0.05, sockZ + 0.35),
    v(-1.1, top + 0.55, LAMP_POS.z + 0.75),
    v(lx + 0.25, ly + 0.2, LAMP_POS.z + 0.42),
    v(lx, ly, LAMP_POS.z + 0.28),
    v(lx - 0.3, ly + 0.25, LAMP_POS.z),
    v(lx, ly, LAMP_POS.z - 0.28),
    v(lx + 0.45, ly + 0.22, LAMP_POS.z - 0.05),
    v(-0.75, top + 0.42, sockZ + 0.2),
    v(-0.18, RING_Y[0], sockZ),
    v(0, RING_Y[0], RING_R + 0.2),
  ];
  const cable = (pts: THREE.Vector3[], key: string): void => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    root.add(k.mesh(k.geo(new THREE.TubeGeometry(c, 64, 0.03, 10, false)), 'plastic', key));
    for (const end of [pts[0]!, pts[pts.length - 1]!]) {
      const plug = k.mesh(k.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12)), 'plastic', key);
      plug.position.copy(end);
      root.add(plug);
    }
  };
  cable(leadPath.slice(1, 6), 'socketRed');
  cable(leadPath.slice(7, 11), 'socketBlack');

  stage.castShadows(root);
  bulb.castShadow = false;
  return {
    root,
    lamp: { group: lampG, bulb, light },
    brushes,
    leadPath,
    occluders,
    anchors: {
      n: v(-(GAP_HALF + shoeW / 2), FACE_HY, FACE_HZ),
      s: v(GAP_HALF + shoeW / 2, FACE_HY, FACE_HZ),
      brushes: v(0.3, (RING_Y[0] + RING_Y[1]) / 2, BLOCK_Z[1]),
      lamp: v(LAMP_POS.x, LAMP_POS.y + 0.8, LAMP_POS.z),
    },
  };
}
