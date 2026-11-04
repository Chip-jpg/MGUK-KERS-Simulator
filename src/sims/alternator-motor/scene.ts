/**
 * Three.js scene of the `alternator-motor` simulator (teardown look, `look: 'teardown'`): a
 * school demonstration generator-motor on a base board — laminated-iron stator yoke opened at the
 * front (red section caps), painted N/S magnets with iron pole shoes, the N-turn rectangular rotor
 * coil wound on a bakelite former on a horizontal shaft, slip rings and carbon brushes in a
 * bakelite rocker, two pillow-block bearings, a flywheel (drawn radius ∝ J^¼), a drive pulley
 * (generator: external torque from the wheels) or a fan (motor: load torque), a converter and a
 * battery tray with a charge gauge, joined by red/black 4 mm leads. Static parts and the
 * reference are in `parts.ts`.
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
 * Sizes: coil L, w to scale (DRAW = 8 units/m); the rest of the rig is illustrative (parts.ts).
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
  mergeStatic,
  roundedRectPoints,
  seedRect,
  type CurrentFlow,
  type EnergyRibbon,
  type FieldLines,
  type Label,
  type MaterialKind,
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
import {
  applyTints,
  BASE_TOP,
  BATTERY_POS,
  buildBattery,
  buildBench,
  buildConverter,
  buildStator,
  END_X,
  FACE_HY,
  FACE_HZ,
  FLOOR_Y,
  FLY_X,
  GAP_HALF,
  laminationCapCanvas,
  leadPoints,
  MAG_T,
  SHAFT_END,
  SHOE_T,
  SLIP_R,
  SLIP_Y,
  type PartsSink,
} from './parts';

const WIRE_R = 0.03;
const TURN_CAP = { alta: 24, bilanciata: 16, base: 8 } as const;
const HOME = {
  position: [5.3, 5.8, 12.6] as [number, number, number],
  target: [-0.8, -0.45, 0.15] as [number, number, number],
};
/** The one accent: the shaft (external / load) torque, the quantity the visitor drives. */
const ACCENT = 0x3dd6c6;

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
      'Scena 3D: generatore-motore dimostrativo su una base di legno — statore in ferro laminato aperto in sezione con magneti N (rosso) e S (verde) ed espansioni polari, linee del campo B calcolate nel traferro, bobina rotante di N spire su un telaio in bachelite, albero su due supporti, anelli collettori e spazzole di carbone, volano, puleggia di trascinamento o ventola, convertitore e vaschetta batteria con indicatore di carica, cavi rosso e nero, nastri del flusso di energia.',
    camera: { ...HOME, fov: 34 },
    intro: false,
    controls: { minDistance: 5, maxDistance: 26 },
    floorY: FLOOR_Y,
    shadowRadius: 8,
    look: 'teardown',
  });
  stage.canvas.setAttribute('aria-hidden', 'true');
  const { scene } = stage;
  const kit = stage.materials;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
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
  const tex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const mesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const sink: PartsSink = { geo, mat, mesh, tex };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  applyTints(stage);

  // --- bench, bearings, brush gear (world) ------------------------------------------------------
  const bench = buildBench(sink);
  scene.add(bench.root);

  // --- machine (model frame) ----------------------------------------------------------------------
  const machine = new THREE.Group();
  machine.rotation.z = -Math.PI / 2;
  scene.add(machine);
  const capTex = tex(new THREE.CanvasTexture(laminationCapCanvas()));
  capTex.colorSpace = THREE.SRGBColorSpace;
  capTex.wrapS = capTex.wrapT = THREE.RepeatWrapping;
  const capMat = mat(
    new THREE.MeshStandardMaterial({
      map: capTex,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    }),
  );
  const stator = buildStator(sink, capMat, Math.round(40 * stage.settings.tessellation) + 16);
  machine.add(stator.root);
  stage.occluders.push(...stator.occluders, ...bench.occluders);

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
  const shaftLen = END_X + 0.25 - SHAFT_END;
  const shaft = mesh(geo(new THREE.CylinderGeometry(0.075, 0.075, shaftLen, 24)), 'steel', 'shaft');
  shaft.position.y = SHAFT_END + shaftLen / 2;
  rotor.add(shaft);
  // slip rings: brass rings with bevelled rims on a bakelite insulating sleeve
  const sleeveLen = SLIP_Y[0] - SLIP_Y[1] + 0.34;
  const sleeve = mesh(
    geo(new THREE.CylinderGeometry(0.14, 0.14, sleeveLen, 28)),
    'plastic',
    'bakelite',
  );
  sleeve.position.y = (SLIP_Y[0] + SLIP_Y[1]) / 2;
  rotor.add(sleeve);
  const slipGeo = geo(
    new THREE.LatheGeometry(
      [
        [0.14, -0.08],
        [SLIP_R - 0.015, -0.08],
        [SLIP_R, -0.065],
        [SLIP_R, 0.065],
        [SLIP_R - 0.015, 0.08],
        [0.14, 0.08],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      stage.tier === 'base' ? 28 : 48,
    ),
  );
  for (const y of SLIP_Y) {
    const r = mesh(slipGeo, 'brass', 'ring');
    r.position.y = y;
    rotor.add(r);
  }
  // coil former: bakelite end bars + a square hub clamped on the shaft
  const armGeo = geo(chamferBox(0.12, 0.12, 1, 0.025, 1));
  const arms = [-1, 1].map((s) => {
    const a = mesh(armGeo, 'plastic', 'bakelite');
    a.userData['s'] = s;
    rotor.add(a);
    return a;
  });
  const hubGeo = geo(chamferBox(0.26, 0.2, 0.26, 0.03));
  const hubs = [-1, 1].map((s) => {
    const h = mesh(hubGeo, 'plastic', 'bakelite');
    h.userData['s'] = s;
    rotor.add(h);
    return h;
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
  const flywheel = mesh(
    geo(new THREE.LatheGeometry(flyProfile, stage.tier === 'base' ? 36 : 72)),
    'darkSteel',
    'flywheel',
  );
  flywheel.position.y = FLY_X;
  rotor.add(flywheel);
  const boltGeo = geo(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 6));
  const bolts = [0, 1, 2, 3, 4].map((k) => {
    const b = mesh(boltGeo, 'steel', 'nut');
    b.userData['a'] = (k * 2 * Math.PI) / 5;
    rotor.add(b);
    return b;
  });
  // white index mark on the flywheel rim: shows the rotation even at low ω
  const markGeo = geo(chamferBox(0.05, 0.3, 0.06, 0.01, 1));
  const mark = mesh(markGeo, 'plastic', 'scale');
  rotor.add(mark);
  // generator: drive pulley (two V grooves); motor: fan
  const pulley = new THREE.Group();
  {
    const prof = [
      [0, -0.22],
      [0.44, -0.22],
      [0.44, -0.17],
      [0.32, -0.11],
      [0.44, -0.05],
      [0.44, 0.05],
      [0.32, 0.11],
      [0.44, 0.17],
      [0.44, 0.22],
      [0, 0.22],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = mesh(
      geo(new THREE.LatheGeometry(prof, stage.tier === 'base' ? 28 : 48)),
      'steel',
      'pulley',
    );
    const key = mesh(geo(chamferBox(0.1, 0.44, 0.1, 0.02, 1)), 'brass', 'ring');
    key.position.set(0.12, 0, 0);
    pulley.add(body, key);
    pulley.position.y = END_X;
  }
  rotor.add(pulley);
  const fan = new THREE.Group();
  {
    const hub = mesh(geo(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 24)), 'plastic', 'fan');
    fan.add(hub);
    const bladeGeo = geo(chamferBox(0.05, 0.16, 0.85, 0.02, 1).translate(0, 0, 0.6));
    for (let k = 0; k < 6; k++) {
      const b = mesh(bladeGeo, 'plastic', 'fan');
      b.rotation.y = (k * 2 * Math.PI) / 6;
      b.rotateZ(0.5);
      fan.add(b);
    }
    fan.position.y = END_X;
  }
  rotor.add(fan);

  // coil (rebuilt on L / w / N / tier change): turns packed in columns × layers on the former
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
    const pitch = 2.1 * WIRE_R;
    const perSide = Math.round(8 * stage.settings.tessellation) + 3;
    // leads from slip ring 1 run in the hollow shaft (r ≈ 0,1), out at the former, round the
    // winding, back to slip ring 2
    const pts: THREE.Vector3[] = [v(0, SLIP_Y[0], 0.1), v(0, -halfL - 0.2, 0.1)];
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
    pts.push(v(0, -halfL - 0.2, -0.1), v(0, SLIP_Y[1], -0.1));
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
    const rows = Math.ceil(turns / cols);
    for (const a of arms) {
      a.scale.z = 2 * halfW + 0.1;
      a.position.y = (a.userData['s'] as number) * (halfL + WIRE_R + 0.07);
    }
    for (const h of hubs)
      h.position.y = (h.userData['s'] as number) * (halfL - rows * pitch - 0.12);
  };

  const setFlywheel = (J: number): void => {
    const R = flywheelRadius(J);
    flywheel.scale.set(R, 1, R);
    for (const b of bolts) {
      const a = b.userData['a'] as number;
      b.position.set(0.52 * R * Math.cos(a), FLY_X + 0.08, 0.52 * R * Math.sin(a));
    }
    mark.position.set(0, FLY_X + 0.145, R - 0.18);
  };

  // force arrows (model frame, along ∓z)
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

  // --- torque arcs (world, around the shaft, between flywheel and pulley) -----------------------
  const ARC_SEGS = 64;
  const accentMat = mat(
    new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
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
  const converter = buildConverter(sink);
  scene.add(converter.root);
  const battery = buildBattery(sink);
  scene.add(battery.root);

  // leads: brush plugs → converter AC in, converter DC out → battery (red / black 4 mm leads)
  const [bpBlack, bpRed] = bench.brushPlugs as [THREE.Vector3, THREE.Vector3];
  const [acBlack, acRed, dcRed, dcBlack] = converter.plugs as [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ];
  const [batRed, batBlack] = battery.plugs as [THREE.Vector3, THREE.Vector3];
  const acA = leadPoints(bpRed, acRed, 0.5);
  const acB = leadPoints(bpBlack, acBlack, 0.35);
  const dcA = leadPoints(dcRed, batRed, 0.25);
  const dcB = leadPoints(dcBlack, batBlack, 0.4);
  const lead = (pts: THREE.Vector3[], red: boolean): THREE.Mesh => {
    const m = mesh(
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          64,
          0.036,
          8,
          false,
        ),
      ),
      'plastic',
      red ? 'socketRed' : 'socketBlack',
    );
    scene.add(m);
    return m;
  };
  const leads = [lead(acA, true), lead(acB, false), lead(dcA, true), lead(dcB, false)];
  // Particle loop for a positive (counter-clockwise about n̂) coil current: it leaves the
  // winding at slip ring 2 → red brush → converter → battery → converter → black brush → ring 1.
  const sample = (pts: THREE.Vector3[], rev = false): THREE.Vector3[] => {
    const c = new THREE.CatmullRomCurve3(rev ? pts.slice().reverse() : pts, false, 'centripetal');
    return Array.from({ length: 21 }, (_, k) => c.getPoint(k / 20));
  };
  const leadFlow: CurrentFlow = createCurrentFlow(stage, {
    path: [
      v(SLIP_Y[1], SLIP_R + 0.1, 0.1),
      ...sample(acA),
      ...sample(dcA),
      ...sample(dcB, true),
      ...sample(acB, true),
      v(SLIP_Y[0], SLIP_R + 0.1, 0.1),
    ],
    closed: true,
    count: 90,
    radius: 0.04,
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
      v(END_X - 0.2, 2.2, 0.6),
      v(1.9, 2.8, 0.8),
      v(0.7, 2.5, 0.8),
    ],
  });
  const ribElec: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v(-0.7, 2.5, 0.8),
      v(-2.4, 2.6, 0.7),
      v(-4.1, 1.9, 0.2),
      v(BATTERY_POS.x + 0.2, BASE_TOP + 1.35, BATTERY_POS.z),
    ],
  });
  const ribJoule: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [v(0, 2.35, 0.9), v(0.05, 2.65, 1.05), v(0.2, 3.0, 1.15)],
  });

  stage.castShadows(bench.root);
  stage.castShadows(machine);
  stage.castShadows(converter.root);
  stage.castShadows(battery.root);
  for (const l of leads) stage.castShadows(l);
  stage.occluders.push(battery.case, converter.body, flywheel);
  // base tier: bake the static parts to one mesh per material (draw-call budget)
  if (stage.tier === 'base') {
    const opts = { kit, track: geo, drop: dropGeo };
    mergeStatic(bench.root, { ...opts, keep: [...bench.brushes, ...bench.occluders] });
    mergeStatic(stator.root, { ...opts, keep: stator.occluders });
    mergeStatic(converter.root, { ...opts, keep: [converter.led, converter.body] });
    mergeStatic(battery.root, { ...opts, keep: [battery.gaugeFill, battery.case] });
  }

  // --- labels: callouts at fixed spots off the rotor, leader lines to the parts ------------------
  container.classList.add('am-scene');
  const labels = createLabelLayer(stage, overlay, { pixelSnap: true, finePlacement: true });
  const magY = GAP_HALF + SHOE_T + MAG_T / 2; // world |y| of the magnet centres
  type Key = 'b' | 'electrical' | 'rotor' | 'shaft' | 'battery' | 'heat' | 'flywheel';
  const parts: Record<Key, THREE.Vector3> = {
    b: v(-0.75, 0.7, 0.75),
    electrical: v((SLIP_Y[0] + SLIP_Y[1]) / 2, 0.62, 0.22),
    rotor: v(0.0, 0.0, 0.0),
    shaft: v(END_X, 0.44, 0),
    battery: v(BATTERY_POS.x - 0.3, BASE_TOP + 0.8, BATTERY_POS.z + 0.3),
    heat: v(0, -0.75, 0.3),
    flywheel: v(FLY_X, -0.95, 0.3),
  };
  const ends: Record<Key, THREE.Vector3> = {
    b: v(-2.1, 3.0, 0.5),
    electrical: v(-5.3, 2.0, 0.4),
    rotor: v(2.6, 2.9, -1.4),
    shaft: v(4.6, 1.55, 0.4),
    battery: v(-7.4, 0.2, 1.0),
    heat: v(0.6, -2.35, 2.9),
    flywheel: v(4.4, -1.75, 1.2),
  };
  const KEYS = Object.keys(parts) as Key[];
  const leaderPos = new Float32Array(KEYS.length * 6);
  KEYS.forEach((k, i) => {
    const a = parts[k];
    const b = ends[k];
    leaderPos.set([a.x, a.y, a.z, b.x, b.y, b.z], 6 * i);
  });
  const leaderGeo = geo(new THREE.BufferGeometry());
  leaderGeo.setAttribute('position', new THREE.BufferAttribute(leaderPos, 3));
  const leaderMat = mat(
    new THREE.LineBasicMaterial({ color: 0x9da7b3, transparent: true, opacity: 0.75 }),
  );
  const leaders = new THREE.LineSegments(leaderGeo, leaderMat);
  leaders.frustumCulled = false;
  scene.add(leaders);
  const tag = (
    k: Key,
    o: Omit<Parameters<typeof labels.add>[0], 'anchor' | 'occlude' | 'offset'>,
  ): Label => labels.add({ ...o, anchor: ends[k], occlude: false, offset: [0, 0] });
  const L: Record<Key | 'n' | 's', Label> = {
    n: labels.add({
      text: 'N',
      anchor: v(-1.15, magY, 0.9),
      size: 'lg',
      priority: 10,
      occlude: false,
    }),
    s: labels.add({
      text: 'S',
      anchor: v(-1.15, -magY, 0.9),
      size: 'lg',
      priority: 10,
      occlude: false,
    }),
    b: tag('b', {
      text: 'B',
      quantity: 'b',
      priority: 9,
      sensorWidth: '15ch',
      sensorHeight: '2em',
    }),
    electrical: tag('electrical', {
      text: 'Collettore',
      quantity: 'emf',
      priority: 8,
      sensorWidth: '18ch',
      sensorHeight: '3.3em',
    }),
    rotor: tag('rotor', {
      text: 'Rotore',
      quantity: 'f',
      priority: 8,
      sensorWidth: '21ch',
      sensorHeight: '3.3em',
    }),
    shaft: tag('shaft', {
      text: 'Albero',
      quantity: 'energy',
      priority: 7,
      sensorWidth: '22ch',
      sensorHeight: '3.3em',
    }),
    battery: tag('battery', {
      text: 'Batteria',
      quantity: 'energy',
      priority: 8,
      sensorWidth: '22ch',
      sensorHeight: '3.3em',
    }),
    heat: tag('heat', {
      text: 'Avvolgimento',
      quantity: 'i',
      priority: 7,
      sensorWidth: '20ch',
      sensorHeight: '3.3em',
    }),
    flywheel: tag('flywheel', {
      text: 'Volano',
      priority: 7,
      sensorWidth: '22ch',
      sensorHeight: '3.3em',
    }),
  };
  for (const [key, label] of Object.entries(L)) {
    if (key === 'n' || key === 's') continue;
    label.element.classList.add('am-indicator');
    label.element.dataset['indicator'] = key;
  }

  const offTier = stage.onTierChange(() => {
    coilKey = '';
    void field.setJob(traceJob());
  });

  // --- per-frame ---------------------------------------------------------------------------------------
  let lastMode: MachineMode | null = null;
  const update = (s: SceneView): void => {
    const { p, q } = s;
    applyTints(stage);
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
    kit.get('glowI', 'led').emissiveIntensity =
      0.1 + 1.6 * Math.min(1, Math.abs(q.sideCurrent) / 5);

    // Lorentz forces on the two active sides (model frame): F_A = −s·L·B ẑ, F_B opposite
    const len = logLength(q.forceSide, F_LOG_RANGE[0], F_LOG_RANGE[1], 0.35, 1.35);
    const sx = Math.sin(s.theta) * halfW;
    const sz = Math.cos(s.theta) * halfW;
    const dirA = -Math.sign(q.forceSide);
    setArrow(fA, sx, 0, sz, dirA, len);
    setArrow(fB, -sx, 0, -sz, -dirA, len);
    // torque arcs: τ_em (force colour) and the external/load torque on the shaft (accent)
    setArc(arcEm, q.tauEm, s.tauRef, 0.35);
    setArc(arcSh, q.tauShaft, s.tauRef, 0.35);

    // energy ribbons: oriented mech → machine, machine → battery, machine → air
    const pr = s.pRef > 0 ? s.pRef : 1;
    ribMech.setPower((gen ? s.pConv : -s.pConv) / pr);
    ribElec.setPower((gen ? s.pElec : -s.pElec) / pr);
    ribJoule.setPower(s.pJoule / pr);

    // battery gauge + winding heat glow (none below 700 K)
    battery.gaugeFill.scale.y = Math.max(0.01, battery.gaugeH * s.soc);
    kit.get('glowEnergy', 'gauge').emissiveIntensity = 1.2;
    applyHeatGlow(kit.get('enamel', 'coil'), s.T);

    const t = s.labels;
    L.b.setText(t.b);
    L.electrical.setText(`${t.emf}\n${t.i}`);
    L.rotor.setText(`${t.force}\n${t.tauEm}`);
    L.shaft.setText(`${t.tauShaft}\n${t.pMech}`);
    L.battery.setText(`${t.battery}\n${t.pElec}`);
    L.heat.setText(`${t.heat}\n${t.pJoule}`);
    L.flywheel.setText(t.flywheel);
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
      offTier();
      labels.dispose();
      container.classList.remove('am-scene');
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
      for (const t of textures.splice(0)) t.dispose();
      stage.dispose();
      sceneStats.liveScenes--;
    },
  };
}
