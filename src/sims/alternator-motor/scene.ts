/**
 * Three.js scene of the `alternator-motor` simulator, built on the render
 * foundation (`src/render`, D14): a cut-away permanent-magnet machine on a test
 * bench — laminated-iron stator ring with two pole shoes, the N-turn rectangular
 * rotor coil on a horizontal shaft with slip rings and brushes, two bearings, a
 * flywheel (drawn radius ∝ J^¼), a drive pulley (generator: external torque from
 * the wheels) or a fan (motor: load torque), a converter and a battery pack with
 * a charge gauge.
 *
 * Model frame (model.ts: B along +x, rotor axis +y) is mapped into the world by
 * the `machine` group, rotated −90° about z: model +y → world +x (horizontal
 * shaft), model +x (B) → world −y (N pole on top, B pointing down), z unchanged.
 * Every physical vector is drawn in the model frame inside that group.
 *
 * What is physics and what is illustration:
 *  - field lines: COMPUTED in the gap with `gapField` (two-sheet pole model,
 *    uniform in the core, fringing at the edges), flow ∝ B;
 *  - rotor angle θ, emf, current, Lorentz force (from `lorentzForce`), torques
 *    τ_em and τ_shaft, powers and energies: from the model (`instant`, RK4 state);
 *  - force arrows: length ∝ log₁₀|F| (1 N … 1 kN), direction from the sign of the
 *    current (F = i L × B); torque arcs: sweep ∝ |τ| / τ_ref (τ_ref = the larger of
 *    the two, held), direction = sign;
 *  - current particles: speed = {@link PARTICLE_SPEED_PER_AMP} units/s per ampere
 *    (capped), direction = sign of the current;
 *  - energy ribbons (purple): radius ∝ cycle-averaged power, P_ref on the legend,
 *    direction flips with the mode;
 *  - winding temperature: lumped model `createHeatBody` with an ILLUSTRATIVE
 *    thermal mass (model.ts WINDING_THERMAL); black-body glow only above 700 K
 *    (never reached at these powers — not faked);
 *  - battery state of charge: energy integrals of the model over an illustrative
 *    capacity (BATTERY_CAPACITY_J).
 * Sizes: coil L, w to scale (DRAW = 8 units/m); the rest of the rig is not to scale.
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import { DRAW, F_LOG_RANGE, PARTICLE_SPEED_PER_AMP, sceneStats } from './constants';
import {
  applyHeatGlow,
  chamferBox,
  createCurrentFlow,
  createEnergyRibbon,
  createFieldLines,
  createLabelLayer,
  createStage,
  roundedRectPoints,
  seedRect,
  type CurrentFlow,
  type EnergyRibbon,
  type FieldLines,
  type Label,
  type Stage,
  type StageInfo,
  type TraceJob,
} from '../../render';
import {
  flywheelRadius,
  params,
  type Instant,
  type MachineMode,
  type MachineParams,
} from './model';

const GAP_HALF = 1.0; // pole faces at model x = ±1
const FACE_HY = 1.4; // along the shaft
const FACE_HZ = 1.05;
const RING_IN = 1.78;
const RING_OUT = 2.12;
const RING_HALF = 1.55;
const BASE_TOP = -2.42;
const FLOOR_Y = BASE_TOP - 0.22;
const SLIP_Y = [-2.15, -2.5] as const; // model y of the two slip rings
const SLIP_R = 0.2;
const BEARING_X = 1.95;
const FLY_X = 2.6;
const END_X = 3.35;
const WIRE_R = 0.026;
const TURN_CAP = { alta: 24, bilanciata: 16, base: 8 } as const;
const BATTERY_POS = new THREE.Vector3(-4.7, BASE_TOP, 0.9);
const CONVERTER_POS = new THREE.Vector3(-3.25, BASE_TOP, 1.75);
const HOME = {
  position: [5.0, 2.9, 10.3] as [number, number, number],
  target: [-0.75, 0.0, 0.3] as [number, number, number],
};

export interface SceneLabelsIT {
  b: string;
  emf: string;
  i: string;
  force: string;
  tauEm: string;
  tauShaft: string;
  battery: string;
  heat: string;
  flywheel: string;
  pMech: string;
  pElec: string;
  pJoule: string;
}

export interface SceneView {
  mode: MachineMode;
  theta: number;
  omega: number;
  p: MachineParams;
  q: Instant;
  /** Cycle-averaged powers [W] (≥ 0). */
  pConv: number;
  pElec: number;
  pJoule: number;
  /** Reference power of the ribbons [W] (1-2-5 auto range). */
  pRef: number;
  /** Reference torque of the arcs [N·m]. */
  tauRef: number;
  /** Winding temperature [K]. */
  T: number;
  /** Battery state of charge [0, 1]. */
  soc: number;
  labels: SceneLabelsIT;
}

export interface SceneInfo extends StageInfo {
  fieldLines: number;
  trace: { ms: number; where: string };
  labels: { labels: number; nudged: number; occluded: number; overlaps: number };
}

export interface MachineScene {
  readonly stage: Stage;
  update(v: SceneView): void;
  render(): void;
  info(): SceneInfo;
  dispose(): void;
}

/** Log-scale length: |q| in [lo, hi] → [a, b] (0 for q = 0). */
export function logLength(q: number, lo: number, hi: number, a: number, b: number): number {
  const x = Math.abs(q);
  if (!(x > 0)) return 0;
  const f = (Math.log10(x) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return a + Math.min(1, Math.max(0, f)) * (b - a);
}

/** Tube along an arc in the (y, z) plane around +x (world), segments ordered along the arc. */
function arcTube(radius: number, tube: number, segs: number): THREE.TubeGeometry {
  const pts = Array.from({ length: 49 }, (_, k) => {
    const a = (k / 48) * Math.PI * 1.75;
    return new THREE.Vector3(0, radius * Math.cos(a), radius * Math.sin(a));
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, tube, 8, false);
}

export function createMachineScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): MachineScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D: macchina a magneti permanenti in sezione — statore in ferro laminato con espansioni polari N e S, linee del campo B calcolate nel traferro, bobina rotante di N spire su un albero con anelli e spazzole, volano, puleggia di trascinamento o ventola, convertitore e pacco batteria con indicatore di carica, nastri del flusso di energia.',
    camera: { ...HOME, fov: 34 },
    controls: { minDistance: 5, maxDistance: 26 },
    floorY: FLOOR_Y,
    shadowRadius: 7.5,
  });
  stage.canvas.setAttribute('aria-hidden', 'true');
  const { scene } = stage;
  const kit = stage.materials;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.add(g);
    sceneStats.liveGeometries++;
    return g;
  };
  const dropGeo = (g: THREE.BufferGeometry): void => {
    if (geometries.delete(g)) {
      g.dispose();
      sceneStats.liveGeometries--;
    }
  };
  const mat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    sceneStats.liveMaterials++;
    return m;
  };
  const mesh = (
    g: THREE.BufferGeometry,
    kind: Parameters<typeof kit.assign>[1],
    key?: string,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- bench (world) -----------------------------------------------------------------------
  const bench = new THREE.Group();
  scene.add(bench);
  const plate = mesh(geo(chamferBox(9.8, 0.22, 4.8, 0.06)), 'darkSteel');
  plate.position.set(-0.85, BASE_TOP - 0.11, 0.55);
  bench.add(plate);
  const footGeo = geo(chamferBox(0.7, 1, 2.0, 0.05));
  for (const x of [-1.0, 1.0]) {
    const f = mesh(footGeo, 'iron', 'foot');
    f.scale.y = -RING_OUT + 0.25 - BASE_TOP;
    f.position.set(x, (BASE_TOP + (-RING_OUT + 0.25)) / 2, 0);
    bench.add(f);
  }
  const pedestalGeo = geo(chamferBox(0.34, 1, 0.9, 0.04));
  const bearingGeo = geo(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 32).rotateZ(Math.PI / 2));
  for (const x of [-BEARING_X, BEARING_X]) {
    const ped = mesh(pedestalGeo, 'darkSteel');
    ped.scale.y = -0.2 - BASE_TOP;
    ped.position.set(x, (BASE_TOP - 0.2) / 2, 0);
    const brg = mesh(bearingGeo, 'steel');
    brg.position.set(x, 0, 0);
    bench.add(ped, brg);
  }

  // --- machine (model frame) ----------------------------------------------------------------------
  const machine = new THREE.Group();
  machine.rotation.z = -Math.PI / 2;
  scene.add(machine);
  // stator ring with a front cut-away (annular sector extruded along the shaft)
  {
    const s = new THREE.Shape();
    const a0 = THREE.MathUtils.degToRad(-38);
    const a1 = THREE.MathUtils.degToRad(218);
    s.absarc(0, 0, RING_OUT, a0, a1, false);
    s.absarc(0, 0, RING_IN, a1, a0, true);
    const ring = new THREE.ExtrudeGeometry(s, {
      depth: 2 * RING_HALF,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 2,
      curveSegments: Math.round(48 * stage.settings.tessellation) + 16,
    });
    // extrusion z → model y; shape v → model −z, so the gap (v < 0) faces the camera (+z)
    ring.rotateX(-Math.PI / 2).translate(0, -RING_HALF, 0);
    ring.computeVertexNormals();
    const stator = mesh(geo(ring), 'iron', 'stator');
    machine.add(stator);
    stage.occluders.push(stator);
  }
  const shoeGeo = geo(chamferBox(0.34, 2 * FACE_HY, 2 * FACE_HZ, 0.05));
  const magGeo = geo(chamferBox(RING_IN - GAP_HALF - 0.34 - 0.02, 2 * FACE_HY + 0.1, 1.7, 0.06));
  const plateGeo = geo(new THREE.PlaneGeometry(0.56, 0.56));
  const magThick = RING_IN - GAP_HALF - 0.34 - 0.02;
  for (const side of [-1, 1] as const) {
    const shoe = mesh(shoeGeo, 'iron');
    shoe.position.x = side * (GAP_HALF + 0.17);
    const mag = mesh(magGeo, 'magnet');
    mag.position.x = side * (GAP_HALF + 0.34 + magThick / 2);
    const nameplate = mesh(plateGeo, side < 0 ? 'magnetN' : 'magnetS');
    nameplate.position.set(mag.position.x, -0.95, 0.851);
    nameplate.rotation.z = Math.PI / 2; // upright in the world
    machine.add(shoe, mag, nameplate);
    stage.occluders.push(shoe, mag);
  }

  // field lines in the gap (computed)
  const field: FieldLines = createFieldLines(stage, { linewidth: 2.0, spacing: 0.9, speed: 1.0 });
  machine.add(field.object);
  const traceJob = (): TraceJob => {
    const n = Math.max(12, Math.round(36 * stage.settings.lineDensity));
    return {
      field: {
        kind: 'gap',
        geometry: { gap: 2 * GAP_HALF, width: 2 * FACE_HY, depth: 2 * FACE_HZ },
        B0: 1,
      },
      seeds: seedRect(
        [-GAP_HALF + 0.03, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        FACE_HY - 0.08,
        FACE_HZ - 0.08,
        n,
      ),
      options: {
        bounds: { min: [-1.7, -2.6, -2.4], max: [1.7, 2.6, 2.4] },
        stopBoxes: [
          {
            min: [GAP_HALF - 0.02, -FACE_HY - 0.05, -FACE_HZ - 0.05],
            max: [2, FACE_HY + 0.05, FACE_HZ + 0.05],
          },
        ],
        maxAngle: 0.05,
      },
    };
  };
  void field.setJob(traceJob());

  // --- rotor (rotates about model y) ----------------------------------------------------------------
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  machine.add(rotor);
  const shaft = mesh(
    geo(new THREE.CylinderGeometry(0.075, 0.075, END_X + 2.85, 24)),
    'steel',
    'shaft',
  );
  shaft.position.y = (END_X - 2.85) / 2;
  rotor.add(shaft);
  const sleeve = mesh(geo(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 24)), 'plastic');
  sleeve.position.y = (SLIP_Y[0] + SLIP_Y[1]) / 2;
  rotor.add(sleeve);
  const slipGeo = geo(new THREE.CylinderGeometry(SLIP_R, SLIP_R, 0.13, 40));
  for (const y of SLIP_Y) {
    const r = mesh(slipGeo, 'brass');
    r.position.y = y;
    rotor.add(r);
  }
  const armGeo = geo(chamferBox(0.08, 0.1, 1, 0.02, 1));
  const arms = [-1, 1].map((s) => {
    const a = mesh(armGeo, 'darkSteel');
    a.userData['s'] = s;
    rotor.add(a);
    return a;
  });
  // flywheel (lathe profile, unit radius, scaled by R ∝ J^¼)
  const flyProfile = [
    v(0.0, -0.17),
    v(0.2, -0.17),
    v(0.22, -0.06),
    v(0.8, -0.05),
    v(0.84, -0.14),
    v(1.0, -0.14),
    v(1.0, 0.14),
    v(0.84, 0.14),
    v(0.8, 0.05),
    v(0.22, 0.06),
    v(0.2, 0.17),
    v(0.0, 0.17),
  ].map((p) => new THREE.Vector2(p.x, p.y));
  const flywheel = mesh(geo(new THREE.LatheGeometry(flyProfile, 72)), 'darkSteel', 'flywheel');
  flywheel.position.y = FLY_X;
  rotor.add(flywheel);
  const boltGeo = geo(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12));
  const bolts = [0, 1, 2, 3, 4].map((k) => {
    const b = mesh(boltGeo, 'darkSteel');
    b.userData['a'] = (k * 2 * Math.PI) / 5;
    rotor.add(b);
    return b;
  });
  // generator: drive pulley; motor: fan
  const pulley = new THREE.Group();
  {
    const prof = [
      v(0, -0.2),
      v(0.42, -0.2),
      v(0.42, -0.14),
      v(0.3, -0.02),
      v(0.3, 0.02),
      v(0.42, 0.14),
      v(0.42, 0.2),
      v(0, 0.2),
    ].map((p) => new THREE.Vector2(p.x, p.y));
    const body = mesh(geo(new THREE.LatheGeometry(prof, 48)), 'darkSteel', 'pulley');
    const key = mesh(geo(chamferBox(0.1, 0.42, 0.1, 0.02, 1)), 'brass');
    key.position.set(0.32, 0, 0);
    pulley.add(body, key);
    pulley.position.y = END_X;
  }
  rotor.add(pulley);
  const fan = new THREE.Group();
  {
    const hub = mesh(geo(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 24)), 'plastic', 'fan');
    fan.add(hub);
    const bladeGeo = geo(chamferBox(0.06, 0.14, 0.9, 0.02, 1).translate(0, 0, 0.6));
    for (let k = 0; k < 5; k++) {
      const b = mesh(bladeGeo, 'plastic', 'fan');
      b.rotation.y = (k * 2 * Math.PI) / 5;
      b.rotateZ(0.5);
      fan.add(b);
    }
    fan.position.y = END_X;
  }
  rotor.add(fan);

  // coil (rebuilt on L / w / N / tier change)
  let coilWire: THREE.Mesh | null = null;
  let coilKey = '';
  let halfL = 0.8;
  let halfW = 0.4;
  const coilFlow: CurrentFlow = createCurrentFlow(stage, {
    path: [v(), v(0, 1, 0)],
    closed: true,
    count: 54,
    radius: 0.034,
    speedPerAmp: PARTICLE_SPEED_PER_AMP,
    vMax: 2.2,
    smooth: false,
  });
  rotor.add(coilFlow.object);
  const buildCoil = (L: number, w: number, N: number): void => {
    const turns = Math.max(1, Math.min(TURN_CAP[stage.tier], Math.round(N)));
    const key = `${L}|${w}|${turns}|${stage.tier}`;
    if (key === coilKey) return;
    coilKey = key;
    halfL = (L * DRAW) / 2;
    halfW = (w * DRAW) / 2;
    const cols = Math.min(turns, 6);
    const pitch = 2.15 * WIRE_R;
    const perSide = Math.round(8 * stage.settings.tessellation) + 3;
    const pts: THREE.Vector3[] = [v(0, SLIP_Y[0], 0.14), v(0, -halfL - 0.18, 0.08)];
    for (let k = 0; k < turns; k++) {
      const ix = k % cols;
      const ir = Math.floor(k / cols);
      const x0 = (ix - (cols - 1) / 2) * pitch;
      const nx = ((k + 1) % cols) - (cols - 1) / 2;
      const x1 = (k + 1 < turns ? nx : ix - (cols - 1) / 2) * pitch;
      const a = halfW - ir * pitch;
      const b = halfL - ir * pitch;
      const ring = roundedRectPoints(
        a,
        b,
        Math.min(0.12, a * 0.4),
        perSide,
        Math.max(3, perSide >> 1),
      );
      ring.forEach(([u, vv], i) => {
        const t = i / ring.length;
        const x = t < 0.85 ? x0 : x0 + (x1 - x0) * ((t - 0.85) / 0.15);
        pts.push(v(x, vv, u));
      });
    }
    pts.push(v(0, -halfL - 0.18, -0.08), v(0, SLIP_Y[1], -0.14));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const g = geo(
      new THREE.TubeGeometry(curve, pts.length * 2, WIRE_R, stage.tier === 'base' ? 5 : 7, false),
    );
    if (coilWire) {
      dropGeo(coilWire.geometry);
      coilWire.geometry = g;
    } else {
      coilWire = mesh(g, 'enamel', 'coil');
      rotor.add(coilWire);
      stage.castShadows(coilWire);
    }
    const ao = halfW + WIRE_R * 1.8;
    const bo = halfL + WIRE_R * 1.8;
    coilFlow.setPath(
      roundedRectPoints(ao, bo, Math.min(0.14, ao * 0.4), 8, 4).map(([u, vv]) => v(0, vv, u)),
      true,
    );
    for (const a of arms) {
      a.scale.z = 2 * halfW;
      a.position.y = (a.userData['s'] as number) * (halfL + 0.06);
    }
  };

  const setFlywheel = (J: number): void => {
    const R = flywheelRadius(J);
    flywheel.scale.set(R, 1, R);
    for (const b of bolts) {
      const a = b.userData['a'] as number;
      b.position.set(0.52 * R * Math.cos(a), FLY_X, 0.52 * R * Math.sin(a));
    }
  };

  // brushes (non-rotating, model frame) on the front of the slip rings
  const brushGroup = new THREE.Group();
  machine.add(brushGroup);
  const holder = mesh(geo(chamferBox(1, 0.62, 0.16, 0.03)), 'plastic', 'holder');
  holder.scale.x = 2.42 - 0.0;
  holder.position.set(2.42 / 2 - 0.0 + 0.05, (SLIP_Y[0] + SLIP_Y[1]) / 2, SLIP_R + 0.42);
  brushGroup.add(holder);
  const brushGeo = geo(chamferBox(0.12, 0.1, 0.2, 0.015, 1));
  const brushes: THREE.Mesh[] = [];
  for (const y of SLIP_Y) {
    const b = mesh(brushGeo, 'glowEmf', 'brush');
    b.position.set(0, y, SLIP_R + 0.1);
    const spring = mesh(geo(chamferBox(0.05, 0.05, 0.16, 0.01, 1)), 'brass');
    spring.position.set(0, y, SLIP_R + 0.28);
    brushGroup.add(b, spring);
    brushes.push(b);
  }

  // force arrows (model frame, along ∓z) and their materials
  const arrowShaftGeo = geo(
    new THREE.CylinderGeometry(0.05, 0.05, 1, 14).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  );
  const arrowHeadGeo = geo(new THREE.ConeGeometry(0.14, 0.32, 20).rotateX(Math.PI / 2));
  const makeArrow = (): { g: THREE.Group; s: THREE.Mesh; h: THREE.Mesh } => {
    const g = new THREE.Group();
    const s = mesh(arrowShaftGeo, 'glowF', 'force');
    const h = mesh(arrowHeadGeo, 'glowF', 'force');
    g.add(s, h);
    machine.add(g);
    return { g, s, h };
  };
  const fA = makeArrow();
  const fB = makeArrow();
  const setArrow = (
    a: typeof fA,
    x: number,
    y: number,
    z: number,
    dir: number,
    len: number,
  ): void => {
    a.g.visible = len > 0 && dir !== 0;
    if (!a.g.visible) return;
    const head = 0.32;
    const sh = Math.max(0.04, len - head);
    a.g.position.set(x, y, z);
    a.g.rotation.y = dir > 0 ? 0 : Math.PI;
    a.s.scale.z = sh;
    a.h.position.z = sh + head / 2;
  };

  // --- torque arcs (world, around the shaft, in front of the flywheel) ---------------------------
  const ARC_SEGS = 64;
  const accentMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x3dd6c6,
      emissive: 0x3dd6c6,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    }),
  );
  const makeArc = (
    radius: number,
    m: 'em' | 'shaft',
  ): { g: THREE.Group; tube: THREE.Mesh; head: THREE.Mesh } => {
    const g = new THREE.Group();
    const tg = geo(arcTube(radius, 0.04, ARC_SEGS));
    const tube = m === 'em' ? mesh(tg, 'glowF', 'tau') : new THREE.Mesh(tg, accentMat);
    const hg = geo(new THREE.ConeGeometry(0.11, 0.28, 16));
    const head = m === 'em' ? mesh(hg, 'glowF', 'tau') : new THREE.Mesh(hg, accentMat);
    head.userData['r'] = radius;
    g.add(tube, head);
    g.position.x = FLY_X + 0.42;
    scene.add(g);
    return { g, tube, head };
  };
  const arcEm = makeArc(0.62, 'em');
  const arcSh = makeArc(0.86, 'shaft');
  const RADIAL = 8;
  const setArc = (a: typeof arcEm, tau: number, ref: number, offset: number): void => {
    const frac = ref > 0 ? Math.min(1, Math.abs(tau) / ref) : 0;
    a.g.visible = frac > 0.01;
    if (!a.g.visible) return;
    const k = Math.max(1, Math.round(frac * ARC_SEGS));
    a.tube.geometry.setDrawRange(0, k * RADIAL * 6);
    const ang = (k / ARC_SEGS) * Math.PI * 1.75;
    const r = a.head.userData['r'] as number;
    a.head.position.set(0, r * Math.cos(ang), r * Math.sin(ang));
    // cone axis (+y) along the tangent (0, −sin, cos) = +y rotated by ang + 90° about x
    a.head.rotation.set(ang + Math.PI / 2, 0, 0);
    // positive τ about +x (= +θ, rotor axis): counter-clockwise seen from +x; mirror for negative
    a.g.rotation.set(offset, 0, 0);
    a.g.scale.set(1, 1, tau >= 0 ? 1 : -1);
  };

  // --- converter + battery (world) ---------------------------------------------------------------
  const converter = new THREE.Group();
  converter.position.copy(CONVERTER_POS);
  scene.add(converter);
  const convBody = mesh(geo(chamferBox(0.95, 0.6, 0.7, 0.06)), 'darkSteel', 'conv');
  convBody.position.y = 0.3;
  const finGeo = geo(chamferBox(0.04, 0.16, 0.62, 0.01, 1));
  for (let k = 0; k < 7; k++) {
    const f = mesh(finGeo, 'darkSteel', 'fins');
    f.position.set(-0.36 + k * 0.12, 0.68, 0);
    converter.add(f);
  }
  converter.add(convBody);
  const battery = new THREE.Group();
  battery.position.copy(BATTERY_POS);
  scene.add(battery);
  const packGeo = geo(chamferBox(1.5, 1.05, 1.0, 0.08));
  const pack = mesh(packGeo, 'plastic', 'pack');
  pack.position.y = 0.525;
  const cellGeo = geo(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20));
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const c = mesh(cellGeo, 'steel', 'cells');
      c.position.set(-0.56 + i * 0.28, 1.09, -0.3 + j * 0.3);
      battery.add(c);
    }
  const termGeo = geo(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 16));
  const tPlus = mesh(termGeo, 'brass');
  tPlus.position.set(0.55, 1.13, 0.38);
  const tMinus = mesh(termGeo, 'darkSteel');
  tMinus.position.set(0.3, 1.13, 0.38);
  const gaugeBg = mesh(geo(chamferBox(0.22, 0.8, 0.03, 0.01, 1)), 'rubber');
  gaugeBg.position.set(-0.45, 0.53, 0.51);
  const gaugeFill = mesh(
    geo(new THREE.BoxGeometry(0.15, 1, 0.02).translate(0, 0.5, 0)),
    'glowEnergy',
    'gauge',
  );
  gaugeFill.position.set(-0.45, 0.17, 0.53);
  battery.add(pack, tPlus, tMinus, gaugeBg, gaugeFill);

  // leads: brushes → converter → battery, and the particle loop through them
  machine.updateMatrixWorld(true);
  const brushW = SLIP_Y.map((y) => machine.localToWorld(v(0, y, SLIP_R + 0.5)));
  const convIn = [v(0.48, 0.25, 0.2), v(0.48, 0.25, -0.2)].map((p) => p.add(CONVERTER_POS));
  const convOut = [v(-0.48, 0.25, 0.2), v(-0.48, 0.25, -0.2)].map((p) => p.add(CONVERTER_POS));
  const battIn = [
    tPlus.position.clone().add(BATTERY_POS),
    tMinus.position.clone().add(BATTERY_POS),
  ];
  const b0 = brushW[0] as THREE.Vector3;
  const b1 = brushW[1] as THREE.Vector3;
  const lead = (pts: THREE.Vector3[], r = 0.034): THREE.Mesh => {
    const m = mesh(
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          48,
          r,
          8,
          false,
        ),
      ),
      'rubber',
    );
    scene.add(m);
    return m;
  };
  const acA = [
    b1.clone(),
    v(b1.x, BASE_TOP + 0.6, b1.z + 0.3),
    v(b1.x - 0.4, BASE_TOP + 0.06, b1.z + 0.6),
    (convIn[0] as THREE.Vector3).clone(),
  ];
  const acB = [
    b0.clone(),
    v(b0.x + 0.1, BASE_TOP + 0.5, b0.z + 0.15),
    v(b0.x - 0.3, BASE_TOP + 0.06, b0.z + 0.3),
    (convIn[1] as THREE.Vector3).clone(),
  ];
  const dcA = [
    (convOut[0] as THREE.Vector3).clone(),
    v(-3.95, BASE_TOP + 0.3, 1.8),
    v(-4.1, BASE_TOP + 1.25, 1.35),
    (battIn[0] as THREE.Vector3).clone(),
  ];
  const dcB = [
    (convOut[1] as THREE.Vector3).clone(),
    v(-3.95, BASE_TOP + 0.2, 1.45),
    v(-4.3, BASE_TOP + 1.25, 1.2),
    (battIn[1] as THREE.Vector3).clone(),
  ];
  const leads = [lead(acA), lead(acB), lead(dcA, 0.045), lead(dcB, 0.045)];
  // Particle loop for a positive (counter-clockwise about n̂) coil current: it leaves the
  // winding at slip ring 2 → brush 2 → converter → battery → converter → brush 1 → ring 1.
  const sample = (pts: THREE.Vector3[], rev = false): THREE.Vector3[] => {
    const c = new THREE.CatmullRomCurve3(rev ? pts.slice().reverse() : pts, false, 'centripetal');
    return Array.from({ length: 21 }, (_, k) => c.getPoint(k / 20));
  };
  const leadFlow: CurrentFlow = createCurrentFlow(stage, {
    path: [...sample(acA), ...sample(dcA), ...sample(dcB, true), ...sample(acB, true)],
    closed: true,
    count: 90,
    radius: 0.036,
    speedPerAmp: PARTICLE_SPEED_PER_AMP,
    vMax: 2.2,
    smooth: false,
  });

  // --- energy ribbons (world) -----------------------------------------------------------------------
  const ribbonOpts = { widthPerWatt: 0.2, minRadius: 0.012, maxRadius: 0.32, pRef: 1, speed: 1.0 };
  const ribMech: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v(END_X + 0.05, 0.75, 0.3),
      v(END_X - 0.25, 2.2, 0.6),
      v(1.9, 2.75, 0.8),
      v(0.7, 2.45, 0.8),
    ],
  });
  const ribElec: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v(-0.7, 2.45, 0.8),
      v(-2.2, 2.55, 1.0),
      v(-4.0, 1.7, 1.0),
      v(BATTERY_POS.x + 0.2, BASE_TOP + 1.4, BATTERY_POS.z),
    ],
  });
  const ribJoule: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [v(0, 2.3, 0.9), v(0.05, 2.6, 1.05), v(0.2, 2.95, 1.15)],
  });

  stage.castShadows(bench);
  stage.castShadows(machine);
  stage.castShadows(converter);
  stage.castShadows(battery);
  for (const l of leads) stage.castShadows(l);
  stage.occluders.push(pack, convBody, flywheel);

  // --- labels ------------------------------------------------------------------------------------------
  const labels = createLabelLayer(stage, overlay);
  const A = {
    n: v(-0.9, 2.45, 1.0),
    s: v(0.9, -1.9, 1.7),
    b: v(-0.95, 0.3, 1.25),
    emf: v(),
    i: v(-3.0, BASE_TOP + 1.1, 1.75),
    force: v(),
    tauEm: v(FLY_X + 0.45, -1.15, 0.6),
    tauShaft: v(FLY_X + 0.45, 1.25, 0.6),
    battery: v(BATTERY_POS.x, BASE_TOP + 1.75, BATTERY_POS.z + 0.4),
    heat: v(0.45, -1.15, 1.6),
    flywheel: v(FLY_X, -1.7, 1.4),
    pMech: v(2.1, 2.85, 0.8),
    pElec: v(-2.3, 2.85, 1.0),
    pJoule: v(0.25, 3.2, 1.2),
  };
  const L: Record<keyof typeof A, Label> = {
    n: labels.add({ text: 'N', anchor: A.n, size: 'lg', priority: 10, occlude: false }),
    s: labels.add({ text: 'S', anchor: A.s, size: 'lg', priority: 10, occlude: false }),
    b: labels.add({ text: 'B', anchor: A.b, quantity: 'b', priority: 6, occlude: false }),
    emf: labels.add({ text: 'ε', anchor: A.emf, quantity: 'emf', priority: 8, occlude: false }),
    i: labels.add({ text: 'i', anchor: A.i, quantity: 'i', priority: 8, occlude: false }),
    force: labels.add({ text: 'F', anchor: A.force, quantity: 'f', priority: 7, occlude: false }),
    tauEm: labels.add({
      text: 'τ',
      anchor: A.tauEm,
      quantity: 'f',
      priority: 7,
      occlude: false,
      size: 'sm',
    }),
    tauShaft: labels.add({
      text: 'τ',
      anchor: A.tauShaft,
      quantity: 'accent',
      priority: 6,
      occlude: false,
      size: 'sm',
    }),
    battery: labels.add({
      text: 'batteria',
      anchor: A.battery,
      quantity: 'energy',
      priority: 7,
      occlude: false,
    }),
    heat: labels.add({ text: 'T', anchor: A.heat, priority: 3, occlude: false, size: 'sm' }),
    flywheel: labels.add({
      text: 'J',
      anchor: A.flywheel,
      priority: 3,
      occlude: false,
      size: 'sm',
    }),
    pMech: labels.add({
      text: 'P',
      anchor: A.pMech,
      quantity: 'energy',
      priority: 5,
      occlude: false,
      size: 'sm',
    }),
    pElec: labels.add({
      text: 'P',
      anchor: A.pElec,
      quantity: 'energy',
      priority: 5,
      occlude: false,
      size: 'sm',
    }),
    pJoule: labels.add({
      text: 'P',
      anchor: A.pJoule,
      quantity: 'energy',
      priority: 4,
      occlude: false,
      size: 'sm',
    }),
  };

  const applyTheme = (): void => {
    const c = stage.theme === 'dark' ? 0x3dd6c6 : 0x0f7c72;
    accentMat.color.setHex(c);
    accentMat.emissive.setHex(c);
  };
  applyTheme();
  const offTheme = stage.onThemeChange(() => applyTheme());
  const offTier = stage.onTierChange(() => {
    coilKey = '';
    void field.setJob(traceJob());
  });

  // --- per-frame ---------------------------------------------------------------------------------------
  let lastMode: MachineMode | null = null;
  const update = (s: SceneView): void => {
    const { p, q } = s;
    buildCoil(p.L, p.w, p.N);
    setFlywheel(p.J);
    const gen = s.mode === 'generator';
    if (s.mode !== lastMode) {
      lastMode = s.mode;
      pulley.visible = gen;
      fan.visible = !gen;
    }
    rotor.rotation.y = s.theta;
    field.setFlow((1.6 * p.B) / params.B.max);

    // currents: coil path is counter-clockwise about n̂; the reference side carries s along +y,
    // which is the clockwise sense ⇒ CCW current = −s.
    const ccw = -q.sideCurrent;
    coilFlow.setCurrent(ccw);
    leadFlow.setCurrent(ccw);
    kit.get('glowEmf', 'brush').emissiveIntensity = 0.05 + 2.2 * Math.min(1, Math.abs(q.emf) / 40);

    // Lorentz forces on the two active sides (model frame): F_A = −s·L·B ẑ, F_B opposite
    const len = logLength(q.forceSide, F_LOG_RANGE[0], F_LOG_RANGE[1], 0.35, 1.35);
    const sx = Math.sin(s.theta) * halfW;
    const sz = Math.cos(s.theta) * halfW;
    const dirA = -Math.sign(q.forceSide);
    setArrow(fA, sx, 0, sz, dirA, len);
    setArrow(fB, -sx, 0, -sz, -dirA, len);
    // label at the tip of the arrow on the side nearer the camera
    const front = sz >= 0 ? 1 : -1;
    A.force.set(front * sx, -0.25, front * sz + front * dirA * (len + 0.25));
    machine.localToWorld(A.force);
    A.emf.set(0, SLIP_Y[1] - 0.15, SLIP_R + 0.9);
    machine.localToWorld(A.emf);

    // torque arcs: τ_em (green) and the external/load torque on the shaft (accent)
    setArc(arcEm, q.tauEm, s.tauRef, 0.35);
    setArc(arcSh, q.tauShaft, s.tauRef, 0.35);

    // energy ribbons: oriented mech → machine, machine → battery, machine → air
    const pr = s.pRef > 0 ? s.pRef : 1;
    ribMech.setPower((gen ? s.pConv : -s.pConv) / pr);
    ribElec.setPower((gen ? s.pElec : -s.pElec) / pr);
    ribJoule.setPower(s.pJoule / pr);

    // battery gauge + winding heat glow (none below 700 K)
    gaugeFill.scale.y = Math.max(0.01, 0.72 * s.soc);
    kit.get('glowEnergy', 'gauge').emissiveIntensity = 1.2;
    applyHeatGlow(kit.get('enamel', 'coil'), s.T);

    L.tauShaft.setVisible(Math.abs(q.tauShaft) > 1e-6 || !gen);
    const t = s.labels;
    L.b.setText(t.b);
    L.emf.setText(t.emf);
    L.i.setText(t.i);
    L.force.setText(t.force);
    L.force.setVisible(len > 0);
    L.tauEm.setText(t.tauEm);
    L.tauShaft.setText(t.tauShaft);
    L.battery.setText(t.battery);
    L.heat.setText(t.heat);
    L.flywheel.setText(t.flywheel);
    L.pMech.setText(t.pMech);
    L.pElec.setText(t.pElec);
    L.pJoule.setText(t.pJoule);
  };

  sceneStats.liveScenes++;
  let disposed = false;
  return {
    stage,
    update,
    render: () => stage.render(),
    info: () => ({
      ...stage.info(),
      fieldLines: field.count,
      trace: field.lastTrace,
      labels: labels.stats(),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      offTheme();
      offTier();
      labels.dispose();
      field.dispose();
      coilFlow.dispose();
      leadFlow.dispose();
      ribMech.dispose();
      ribElec.dispose();
      ribJoule.dispose();
      for (const g of [...geometries]) dropGeo(g);
      for (const m of materials.splice(0)) {
        m.dispose();
        sceneStats.liveMaterials--;
      }
      stage.dispose();
      sceneStats.liveScenes--;
    },
  };
}
