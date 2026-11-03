/**
 * The MGU-K machine, built in millimetres around the z axis (rear = gear side = −z), after the
 * automotive hairpin PMSM cutaways of refs 05, 06, 08 and 10:
 * - liquid-cooled housing: inner and outer jacket shells with circumferential channel ribs,
 *   coolant ports, end bells with bolt circles and bearing bosses, a rear mounting flange;
 * - laminated stator stack (48 semi-closed slots, lamination grooves), slot-liner paper;
 * - 4-layer hairpin winding: straight bars in the slots, crown end turns at the rear,
 *   twisted legs with welded tips at the front (instanced);
 * - rotor: laminated hub, 8 poles × 4 axial magnet segments (N/S alternating), carbon retaining
 *   sleeve, balancing end plates, speed-sensor target wheel, splined output shaft;
 * - ball bearings (races + balls) at both ends; U/V/W terminal block on top;
 * - the pinion of the single gear pair (the crank gear is built by the assembly).
 * Sizes from dims.ts (mm = metres × 1000); everything internal is ILLUSTRATIVE.
 */
import * as THREE from 'three';
import {
  GEAR_MODULE,
  HAIRPIN_LAYERS,
  HAIRPIN_PITCH,
  HOUSING_L,
  HOUSING_R,
  MAGNET_R_OUT,
  MAGNET_SEGMENTS,
  MAGNET_T,
  PINION_TEETH,
  POLE_COUNT,
  PRESSURE_ANGLE,
  SHAFT_R,
  SLEEVE_T,
  SLOT_COUNT,
  SLOT_R_BOTTOM,
  STACK_L,
  STATOR_R_BORE,
  STATOR_R_OUT,
} from './dims';
import {
  CapBuilder,
  cylUV,
  extrudeZ,
  involuteGearShape,
  latheZ,
  ringZ,
  sweptRect,
  type CapKind,
} from './parts';

const MM = 1000;
const TAU = Math.PI * 2;

/** How a cut part is dressed: its solid look and whether "Vetro" turns it to glass. */
export type CutLook =
  | 'housing'
  | 'iron'
  | 'copper'
  | 'carbon'
  | 'steel'
  | 'paper'
  | 'copperTip'
  | 'plastic'
  | 'coolant';

/** Every look a part can wear (materials are made by the assembly). */
export type Look =
  | CutLook
  | 'darkSteel'
  | 'magnetN'
  | 'magnetS'
  | 'alu'
  | 'ceramic'
  | 'die'
  | 'insulator'
  | 'rubber'
  | 'orange'
  | 'pcb'
  | 'brass';

/** Callbacks the assembly gives the builders, so materials stay in one place. */
export interface PartSink {
  /** A part that is never cut: material by look. */
  solid(o: THREE.Mesh | THREE.InstancedMesh, look: Look): void;
  /** A part cut by the quarter section ("Spaccato"); `glass`: it turns to glass in "Vetro". */
  cut(o: THREE.Mesh | THREE.InstancedMesh, look: CutLook, glass: boolean): void;
  /** A lid / cover: solid (and opened by the caller) in "Spaccato", closed glass in "Vetro". */
  cover(o: THREE.Mesh, look: Look): void;
  /** Geometry to dispose with the scene. */
  geo<T extends THREE.BufferGeometry>(g: T): T;
}

export interface Mguk {
  /** Machine frame [mm]; scaled by the assembly. */
  readonly root: THREE.Group;
  /** Turns with the rotor angle about z. */
  readonly rotor: THREE.Group;
  /** Ball sets: turn at the cage speed. */
  readonly cages: THREE.Group[];
  /** Section caps (visible in "Spaccato" only). */
  readonly caps: Map<CapKind, THREE.BufferGeometry>;
  /** Terminal lugs U, V, W [mm, machine frame]. */
  readonly lugs: THREE.Vector3[];
  /** Points for labels and the energy path [mm, machine frame]. */
  readonly at: {
    stator: THREE.Vector3;
    hairpin: THREE.Vector3;
    magnets: THREE.Vector3;
    bearing: THREE.Vector3;
    jacket: THREE.Vector3;
    terminal: THREE.Vector3;
    pinion: THREE.Vector3;
  };
  /** Pinion z range [mm]. */
  readonly pinionZ: readonly [number, number];
}

/** Angular position of the terminal block (top, left of the cut quarter) [rad]. */
export const TERMINAL_ANGLE = (112 * Math.PI) / 180;

export function buildMguk(sink: PartSink, tess = 1): Mguk {
  const S = (n: number): number => Math.max(16, Math.round(n * tess));
  const root = new THREE.Group();
  root.name = 'mguk';
  const rotor = new THREE.Group();
  root.add(rotor);
  const caps = new CapBuilder();
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry): THREE.Mesh => {
    const m = new THREE.Mesh(sink.geo(g));
    parent.add(m);
    return m;
  };
  const inst = (
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    mats: THREE.Matrix4[],
  ): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(sink.geo(g), undefined, mats.length);
    mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    parent.add(m);
    return m;
  };
  /** Angle not inside the removed quarter (0..90°), with a margin [rad]. */
  const outsideCut = (a: number, margin = 0.12): boolean => {
    const t = ((a % TAU) + TAU) % TAU;
    return !(t < Math.PI / 2 + margin || t > TAU - margin);
  };

  const Rh = HOUSING_R * MM; // 65
  const Lh2 = (HOUSING_L * MM) / 2; // 52.5
  const Ro = STATOR_R_OUT * MM; // 56
  const Rb = STATOR_R_BORE * MM; // 34
  const Rs = SLOT_R_BOTTOM * MM; // 50
  const L2 = (STACK_L * MM) / 2; // 32
  const jIn = Ro + 2.5;
  const jOut = Rh - 2.5;
  const jZ = 40;

  // ---------------------------------------------------------------- housing / cooling jacket
  const housing = (r0: number, r1: number, z0: number, z1: number, ch = 0.6): void => {
    sink.cut(add(root, ringZ(r0, r1, z0, z1, S(96), ch)), 'housing', true);
    caps.rect('cast', r0, r1, z0, z1);
  };
  housing(Ro, jIn, -jZ, jZ, 0);
  housing(jOut, Rh, -jZ, jZ, 0.8);
  // channel walls: the coolant runs in the rings between them (the section shows it blue)
  const walls: Array<[number, number]> = [[-jZ, -jZ + 2]];
  for (let z = -jZ + 7; z <= jZ - 6; z += 8.5) walls.push([z - 1.1, z + 1.1]);
  walls.push([jZ - 2, jZ]);
  walls.forEach(([z0, z1], k) => {
    housing(jIn, jOut, z0, z1, 0);
    const next = walls[k + 1];
    if (next) caps.rect('coolant', jIn, jOut, z1, next[0]);
  });
  // end bells: outer collar, disc, bearing boss (front +z and rear −z)
  for (const s of [1, -1]) {
    const zc0 = s * jZ;
    const zc1 = s * (Lh2 - 6);
    const zd1 = s * Lh2;
    housing(Ro + 4, Rh, Math.min(zc0, zc1), Math.max(zc0, zc1), 0.6);
    housing(25, Rh, Math.min(zc1, zd1), Math.max(zc1, zd1), 1.2);
    housing(21, 25, Math.min(s * 38, zd1), Math.max(s * 38, zd1), 0.4);
  }
  // rear mounting flange
  housing(Rh, Rh + 17, -Lh2, -Lh2 + 7, 1);
  // bolt circles: 12 on each end bell, 8 on the flange (none inside the removed quarter)
  {
    const head = new THREE.CylinderGeometry(2.6, 2.6, 2.4, 6).rotateX(Math.PI / 2);
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU + 0.13;
      if (!outsideCut(a, 0.15)) continue;
      for (const s of [1, -1])
        mats.push(
          new THREE.Matrix4().makeTranslation(
            Math.cos(a) * (Rh - 5),
            Math.sin(a) * (Rh - 5),
            s * (Lh2 + 1.2),
          ),
        );
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      if (!outsideCut(a, 0.15)) continue;
      mats.push(
        new THREE.Matrix4().makeTranslation(
          Math.cos(a) * (Rh + 10),
          Math.sin(a) * (Rh + 10),
          -Lh2 - 1.2,
        ),
      );
    }
    sink.solid(inst(root, head, mats), 'steel');
  }
  // coolant ports (left side, in and out), hex fitting and yellow cap as on the exhibited unit (ref 01)
  const ports = new THREE.Group();
  root.add(ports);
  for (const [a, z] of [
    [(160 * Math.PI) / 180, -24],
    [(160 * Math.PI) / 180, 24],
  ] as const) {
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * Rh, Math.sin(a) * Rh, z);
    g.rotation.z = a - Math.PI / 2;
    ports.add(g);
    const boss = add(g, new THREE.CylinderGeometry(7, 8, 6, S(24)));
    boss.position.y = 2;
    sink.solid(boss, 'housing');
    const pipe = add(g, new THREE.CylinderGeometry(4.2, 4.2, 14, S(20)));
    pipe.position.y = 10;
    sink.solid(pipe, 'steel');
    const hex = add(g, new THREE.CylinderGeometry(6, 6, 4, 6));
    hex.position.y = 8;
    sink.solid(hex, 'steel');
    const cap = add(g, new THREE.CylinderGeometry(5.4, 5.4, 5, S(20)));
    cap.position.y = 18;
    cap.userData['port'] = true;
    sink.solid(cap, 'plastic');
  }

  // ---------------------------------------------------------------- stator stack
  const pitchA = TAU / SLOT_COUNT;
  const slotAng = (i: number): number => i * pitchA; // slot centres at 0 and 90°: the section cuts the copper (ref 10)
  {
    const s = new THREE.Shape();
    s.absarc(0, 0, Ro, 0, TAU, false);
    const hole = new THREE.Path();
    const open = 0.9; // slot opening half-width [mm]
    const half = 1.65; // slot half-width [mm]
    const lip = Rb + 1.3;
    const pt = (r: number, a: number, w: number): [number, number] => {
      const da = Math.asin(w / r);
      return [r * Math.cos(a + da), r * Math.sin(a + da)];
    };
    const path: Array<[number, number]> = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = slotAng(i);
      // tooth tip arc up to the slot
      const aPrev = slotAng(i - 1) + Math.asin(open / Rb);
      const aNext = a - Math.asin(open / Rb);
      for (let k = 0; k <= 3; k++) {
        const t = aPrev + ((aNext - aPrev) * k) / 3;
        path.push([Rb * Math.cos(t), Rb * Math.sin(t)]);
      }
      path.push(pt(lip, a, -open), pt(lip + 0.6, a, -half), pt(Rs, a, -half));
      path.push(pt(Rs + 0.4, a, 0));
      path.push(pt(Rs, a, half), pt(lip + 0.6, a, half), pt(lip, a, open), pt(Rb, a, open));
    }
    path.forEach(([x, y], k) => (k ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath();
    s.holes.push(hole);
    const g = extrudeZ(s, -L2, 2 * L2, 0, S(96));
    cylUV(g, 56);
    sink.cut(add(root, g), 'iron', false);
    caps.rect('iron', Rs + 0.4, Ro, -L2, L2); // yoke only: the cut slot holds copper
  }
  // slot-liner paper sticking out of each slot end (ref 05 "Nutgrundpapier")
  {
    const liner = new THREE.BoxGeometry(3.6, Rs - Rb - 1, 5);
    const mats: THREE.Matrix4[] = [];
    const rm = (Rs + Rb + 1.6) / 2;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = slotAng(i);
      for (const z of [-L2 - 1.8, L2 + 1.8]) {
        mats.push(
          new THREE.Matrix4()
            .makeRotationZ(a - Math.PI / 2)
            .setPosition(Math.cos(a) * rm, Math.sin(a) * rm, z),
        );
      }
    }
    sink.cut(inst(root, liner, mats), 'paper', false);
  }

  // ---------------------------------------------------------------- hairpin winding
  const layerR = Array.from(
    { length: HAIRPIN_LAYERS },
    (_, k) => Rb + 3 + ((Rs - Rb - 4.4) * (k + 0.5)) / HAIRPIN_LAYERS,
  );
  const wireW = 2.5;
  const wireH = ((Rs - Rb - 4.4) / HAIRPIN_LAYERS) * 0.86;
  const span = HAIRPIN_PITCH * pitchA;
  const polar = (r: number, a: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
  const around = (g: THREE.BufferGeometry, look: CutLook, n = SLOT_COUNT): void => {
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < n; i++) mats.push(new THREE.Matrix4().makeRotationZ(slotAng(i)));
    sink.cut(inst(root, g, mats), look, false);
  };
  // straight legs in the slots
  {
    const bars: THREE.BufferGeometry[] = [];
    for (const r of layerR)
      bars.push(new THREE.BoxGeometry(wireH, wireW, 2 * L2 + 5).translate(r, 0, 0));
    for (const g of bars) around(g, 'copper');
    for (const r of layerR) caps.rect('copper', r - wireH / 2, r + wireH / 2, -L2 - 2.5, L2 + 2.5);
  }
  // crown end turns (rear): layer pair (0,1) and (2,3), each spanning one coil pitch
  for (let p = 0; p + 1 < HAIRPIN_LAYERS; p += 2) {
    const r0 = layerR[p] ?? Rb;
    const r1 = layerR[p + 1] ?? Rb;
    const pts: THREE.Vector3[] = [polar(r0, 0, -L2 - 1)];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const lift = Math.sin(Math.PI * t);
      pts.push(polar(r0 + (r1 - r0) * t, span * t, -L2 - 3.5 - 8 * lift - 0.5 * p));
    }
    pts.push(polar(r1, span, -L2 - 1));
    around(sweptRect(pts, wireH * 0.9, wireW, 40), 'copper');
  }
  // twisted legs at the front: alternate layers lean opposite ways and meet half a pitch over
  for (let k = 0; k < HAIRPIN_LAYERS; k++) {
    const r = layerR[k] ?? Rb;
    const dir = k % 2 === 0 ? 1 : -1;
    const pts = [
      polar(r, 0, L2 + 1),
      polar(r, 0, L2 + 3.5),
      polar(r, dir * span * 0.18, L2 + 6),
      polar(r, dir * span * 0.42, L2 + 9.5),
      polar(r, dir * span * 0.5, L2 + 11.2),
      polar(r, dir * span * 0.5, L2 + 12.5),
    ];
    around(sweptRect(pts, wireH * 0.9, wireW, 24), 'copper');
  }
  // welded tips: one blob per joined pair of legs
  {
    const blob = new THREE.SphereGeometry(1, 10, 8);
    for (let p = 0; p + 1 < HAIRPIN_LAYERS; p += 2) {
      const rm = ((layerR[p] ?? Rb) + (layerR[p + 1] ?? Rb)) / 2;
      const g = blob
        .clone()
        .scale(wireH * 1.15, wireW * 0.9, 1.6)
        .translate(rm, 0, L2 + 13.6);
      g.rotateZ(span * 0.5);
      around(g, 'copperTip');
    }
    blob.dispose();
  }
  // neutral/phase connection ring over the welded side (ref 05 "Kontaktring")
  {
    const ringG = ringZ(Rs + 0.6, Rs + 4.2, L2 + 9, L2 + 13.5, S(96), 0.6);
    sink.cut(add(root, ringG), 'plastic', false);
  }

  // ---------------------------------------------------------------- rotor (turns)
  const rHub = MAGNET_R_OUT * MM - MAGNET_T * MM; // 27.5
  const rMag = MAGNET_R_OUT * MM; // 31.5
  const rSl = rMag + SLEEVE_T * MM; // 32.5
  const rSh = SHAFT_R * MM; // 11
  // shaft: front sensor journal, bearing seats, splined rear end
  sink.solid(
    add(
      rotor,
      latheZ(
        [
          [0, 72],
          [6.5, 72],
          [7.5, 71],
          [7.5, 60],
          [9, 58],
          [rSh, 56],
          [rSh, -56],
          [9.6, -58],
          [9.6, -90],
          [8, -92],
          [0, -92],
        ],
        S(48),
      ),
    ),
    'steel',
  );
  // splines between the rear end bell and the pinion
  {
    const tooth = new THREE.BoxGeometry(1.6, 1.4, 14).translate(10.1, 0, -65);
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < 18; k++) mats.push(new THREE.Matrix4().makeRotationZ((k / 18) * TAU));
    sink.solid(inst(rotor, tooth, mats), 'steel');
  }
  // laminated hub
  {
    const g = ringZ(rSh, rHub, -L2, L2, S(64), 0);
    cylUV(g, 56);
    sink.solid(add(rotor, g), 'iron');
  }
  // magnets: POLE_COUNT poles × MAGNET_SEGMENTS axial segments, N/S alternating
  {
    const half = Math.PI / POLE_COUNT - 0.025;
    const s = new THREE.Shape();
    s.absarc(0, 0, rMag - 0.05, -half, half, false);
    s.absarc(0, 0, rHub, half, -half, true);
    s.closePath();
    const segL = (2 * L2 - (MAGNET_SEGMENTS - 1) * 0.8) / MAGNET_SEGMENTS;
    const geoM = extrudeZ(s, 0, segL, 0.25, 8);
    const sets: Record<'magnetN' | 'magnetS', THREE.Matrix4[]> = { magnetN: [], magnetS: [] };
    for (let p = 0; p < POLE_COUNT; p++) {
      for (let k = 0; k < MAGNET_SEGMENTS; k++) {
        const m = new THREE.Matrix4()
          .makeRotationZ((p / POLE_COUNT) * TAU)
          .setPosition(0, 0, -L2 + k * (segL + 0.8));
        (p % 2 === 0 ? sets.magnetN : sets.magnetS).push(m);
      }
    }
    sink.solid(inst(rotor, geoM, sets.magnetN), 'magnetN');
    sink.solid(inst(rotor, geoM.clone(), sets.magnetS), 'magnetS');
  }
  // carbon retaining sleeve (cut: axisymmetric, so the static section stays true as it turns)
  sink.cut(add(rotor, ringZ(rMag + 0.05, rSl, -L2 - 0.5, L2 + 0.5, S(96))), 'carbon', false);
  caps.rect('carbon', rMag + 0.05, rSl, -L2 - 0.5, L2 + 0.5);
  // balancing end plates with drilled balance holes
  for (const s of [1, -1]) {
    const z0 = s > 0 ? L2 + 0.6 : -L2 - 3.2;
    sink.solid(add(rotor, ringZ(rSh, rMag - 0.5, z0, z0 + 2.6, S(64), 0.5)), 'steel');
    const hole = new THREE.CylinderGeometry(1.5, 1.5, 0.8, 12).rotateX(Math.PI / 2);
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      mats.push(
        new THREE.Matrix4().makeTranslation(Math.cos(a) * 24, Math.sin(a) * 24, s * (L2 + 3.25)),
      );
    }
    sink.solid(inst(rotor, hole, mats), 'darkSteel');
  }
  // speed-sensor target wheel at the front
  sink.solid(
    add(rotor, extrudeZ(involuteGearShape(24, 1.4, PRESSURE_ANGLE, 7.5), 61, 3, 0.2, 4)),
    'steel',
  );
  // pinion of the single gear pair, on the splines
  const mGear = GEAR_MODULE * MM;
  const pinionZ: [number, number] = [-88, -74];
  sink.solid(
    add(
      rotor,
      extrudeZ(
        involuteGearShape(PINION_TEETH, mGear, PRESSURE_ANGLE, 9.6),
        pinionZ[0],
        pinionZ[1] - pinionZ[0],
        0.4,
        4,
      ),
    ),
    'darkSteel',
  );

  // ---------------------------------------------------------------- bearings
  const cages: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const z0 = s * 40;
    const z1 = s * 48;
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    sink.cut(add(rotor, ringZ(rSh, 13.6, lo, hi, S(48), 0.5)), 'steel', false);
    sink.cut(add(root, ringZ(18.4, 21, lo, hi, S(48), 0.5)), 'steel', false);
    caps.rect('steel', rSh, 13.6, lo, hi);
    caps.rect('steel', 18.4, 21, lo, hi);
    const cage = new THREE.Group();
    root.add(cage);
    const ball = new THREE.SphereGeometry(2.55, 14, 10);
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      mats.push(new THREE.Matrix4().makeTranslation(Math.cos(a) * 16, Math.sin(a) * 16, s * 44));
    }
    sink.solid(inst(cage, ball, mats), 'steel');
    cages.push(cage);
  }

  // ---------------------------------------------------------------- U/V/W terminal block
  const term = new THREE.Group();
  term.position.set(Math.cos(TERMINAL_ANGLE) * Rh, Math.sin(TERMINAL_ANGLE) * Rh, 14);
  term.rotation.z = TERMINAL_ANGLE - Math.PI / 2;
  root.add(term);
  const tBase = add(term, new THREE.BoxGeometry(26, 9, 40));
  tBase.position.y = 3;
  sink.solid(tBase, 'housing');
  const tIns = add(term, new THREE.BoxGeometry(20, 6, 34));
  tIns.position.y = 10;
  sink.solid(tIns, 'plastic');
  const lugs: THREE.Vector3[] = [];
  for (let k = 0; k < 3; k++) {
    const z = -11 + k * 11;
    const stud = add(term, new THREE.CylinderGeometry(1.8, 1.8, 9, 12));
    stud.position.set(0, 15, z);
    sink.solid(stud, 'steel');
    const lug = add(term, new THREE.BoxGeometry(8, 1.6, 8));
    lug.position.set(0, 14, z);
    sink.solid(lug, 'copper');
    const nut = add(term, new THREE.CylinderGeometry(2.9, 2.9, 2.4, 6));
    nut.position.set(0, 16, z);
    sink.solid(nut, 'steel');
  }
  term.updateMatrix();
  for (let k = 0; k < 3; k++)
    lugs.push(new THREE.Vector3(0, 15, -11 + k * 11).applyMatrix4(term.matrix));
  // the phase leads from the winding up to the block (through the housing, in the cut)
  for (let k = 0; k < 3; k++) {
    const a = TERMINAL_ANGLE + (k - 1) * 0.05;
    const pts = [
      polar(Rs + 2.4, a, L2 + 12),
      polar(Rs + 3, a, L2 + 6),
      polar(Rh - 4, a, 3 + k * 11),
      polar(Rh + 6, TERMINAL_ANGLE, 3 + k * 11),
    ];
    sink.cut(add(root, sweptRect(pts, 2.2, 3.4, 16)), 'copper', false);
  }

  const q = Math.PI / 4;
  return {
    root,
    rotor,
    cages,
    caps: caps.build(),
    lugs,
    pinionZ,
    at: {
      stator: new THREE.Vector3(0, (Rb + Ro) / 2, -12),
      hairpin: polar((Rb + Rs) / 2, q * 0.6, L2 + 10),
      magnets: polar(rMag, q, 4),
      bearing: new THREE.Vector3(0, 19, 44),
      jacket: new THREE.Vector3(0, (jIn + jOut) / 2, -22),
      terminal: lugs[1]?.clone() ?? new THREE.Vector3(),
      pinion: new THREE.Vector3(0, 0, (pinionZ[0] + pinionZ[1]) / 2),
    },
  };
}
