/**
 * Three.js scene of the `lenz` simulator (teardown look, `look: 'teardown'`): a school
 * induction demonstration (`./parts`, reference and real dimensions there) — a painted bar
 * magnet (N red, S green) on a rider of an aluminium bench rail, moving toward / away from a
 * layer-wound enamelled-copper coil on a bakelite stand, wired with red/black 4 mm leads to a
 * centre-zero demonstration galvanometer. The coil is opened (front-top quadrant cut away by
 * two clipping planes, flat section caps) so the magnet's flux can be seen threading the bore.
 *
 * What is physics and what is illustration:
 *  - magnet field lines: COMPUTED (RK4 tracer) for a finite dipole — the bar is
 *    a line of {@link MAGNET_DIPOLES} point dipoles m/K (`dipoleField`), whose far
 *    field is exactly the point dipole of the flux model. Lines are seeded with
 *    EQUAL FLUX each on the face toward the coil, so the number of lines that
 *    thread the coil grows with Φ as the magnet approaches. They are traced once
 *    in the magnet's frame and move rigidly with it (the field is rigid);
 *  - induced field lines: COMPUTED for the coil carrying the induced current
 *    (coaxial loops, exact elliptic-integral field `loopField`). They appear only
 *    while i ≠ 0; their pulse speed/brightness = min(1,2; G·|B_ind|/|B̄|) with the
 *    stated visual gain G = {@link INDUCED_VISUAL_GAIN} (the real induced field is
 *    ~10⁻³ of the magnet's: the labels show the real values);
 *  - galvanometer needle: 2nd-order damped response to i (model.ts `galvoStep`)
 *    with an auto-ranging full scale; current particles: speed ∝ i/i_fs
 *    (full scale → {@link PARTICLE_SPEED_FS} scene units/s), direction = sign of i;
 *  - force arrow: the computed F on the magnet, length ∝ log₁₀|F| (1 nN … 1 N).
 * Sizes: 1 scene unit = 5 cm (SCALE = 20 /m); magnet length and coil radius to scale,
 * drawn turns ∝ N up to a cap (the label shows the real N); the rest is illustrative.
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  chamferBox,
  createCurrentFlow,
  createFieldLines,
  createLabelLayer,
  createStage,
  seedByFlux,
  seedDisc,
  fieldFromSpec,
  mergeStatic,
  type CurrentFlow,
  type FieldLines,
  type FieldSpec,
  type Label,
  type MaterialKind,
  type Stage,
  type StageInfo,
  type TraceJob,
} from '../../render';
import {
  INDUCED_VISUAL_GAIN,
  MAGNET_LENGTH,
  dipoleChain,
  visualTurns,
  windingLayout,
  type Pole,
} from './model';
import {
  BENCH_TOP,
  FLOOR_Y,
  STAND_SOCKETS,
  STAND_TOP,
  applyTints,
  buildBench,
  buildCarriage,
  buildGalvanometer,
  dialCanvas,
  wireSectionCanvas,
  type PartsSink,
} from './parts';

/** Scene units per metre (1 unit = 5 cm). */
export const SCALE = 20;
/** Particle speed at full scale of the galvanometer [scene units / s]. */
export const PARTICLE_SPEED_FS = 1.6;

const MAG_LEN = MAGNET_LENGTH * SCALE; // 1,6
const MAG_SIDE = 0.6; // illustrative cross-section (3 cm)
const WIRE_R = 0.03;
const PITCH = 2.1 * WIRE_R;
const PER_LAYER_MAX = 12;
const FORMER_HALF = 0.48;
const FLANGE_T = 0.06;
/** Drawn turns: ∝ N up to this cap per tier. */
const TURN_CAP = { alta: 48, bilanciata: 32, base: 16 } as const;
/** Default framing: whole apparatus, slight 3/4 from the front, magnet side. */
const FOV = 34;
const VIEW_TARGET: [number, number, number] = [1.05, -1.0, 0.6];
const VIEW_DIST = 12.6;
const VIEW_EL = (26 * Math.PI) / 180;
const VIEW_AZ = (-5 * Math.PI) / 180;
const HOME = {
  position: [
    VIEW_TARGET[0] + VIEW_DIST * Math.cos(VIEW_EL) * Math.sin(VIEW_AZ),
    VIEW_TARGET[1] + VIEW_DIST * Math.sin(VIEW_EL),
    VIEW_TARGET[2] + VIEW_DIST * Math.cos(VIEW_EL) * Math.cos(VIEW_AZ),
  ] as [number, number, number],
  target: VIEW_TARGET,
};

/** Live counters of the sim's own GPU resources (non-kit; leak check). */
const live = { geometries: 0, materials: 0, textures: 0, scenes: 0 };
export function liveResources(): Readonly<typeof live> {
  return { ...live };
}

/** Log-scale arrow length: maps |q| in [lo, hi] to [minLen, maxLen] (0 for q = 0). */
export function logLength(q: number, lo: number, hi: number, minLen: number, maxLen: number) {
  const aq = Math.abs(q);
  if (!(aq > 0)) return 0;
  const f = (Math.log10(aq) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return minLen + Math.min(1, Math.max(0, f)) * (maxLen - minLen);
}

export interface LenzLabels {
  face: string;
  coil: string;
  bMag: string;
  bInd: string;
  current: string;
  force: string;
}

/** What the scene draws for one frame (SI units). */
export interface LenzFrame {
  /** Magnet centre distance [m]. */
  z: number;
  pole: Pole;
  /** Coil radius [m] and turns. */
  a: number;
  N: number;
  /** Mean field of the magnet at the coil along +x [T]. */
  B: number;
  /** Induced field at the coil centre along +x [T]. */
  Bind: number;
  /** lenzSign: +1 counter-clockwise seen from the magnet, −1 clockwise, 0 none. */
  sign: -1 | 0 | 1;
  /** Induced current [A] and the galvanometer full scale [A]. */
  i: number;
  range: number;
  /** Needle deflection [rad] (+ = right). */
  needle: number;
  /** Force on the magnet along +x [N]. */
  F: number;
  labels: LenzLabels;
}

export interface LenzScene {
  readonly canvas: HTMLCanvasElement;
  readonly stage: Stage;
  render(frame: LenzFrame): void;
  /** Does the pointer (client coords) hit the magnet? */
  hitMagnet(clientX: number, clientY: number): boolean;
  /** x [m] of the point of the magnet axis under the pointer (null if undefined). */
  axisX(clientX: number, clientY: number): number | null;
  info(): StageInfo & {
    fieldLines: number;
    inducedLines: number;
    threading: number;
    trace: { ms: number; where: string };
    labels: ReturnType<ReturnType<typeof createLabelLayer>['stats']>;
  };
  dispose(): void;
}

/** Closed (r, x) section revolved about the x axis (former tube, flanges). */
function ringX(
  rIn: number,
  rOut: number,
  x0: number,
  x1: number,
  seg: number,
): THREE.BufferGeometry {
  const pts = [
    [rIn, x0],
    [rOut, x0],
    [rOut, x1],
    [rIn, x1],
    [rIn, x0],
  ].map(([r, x]) => new THREE.Vector2(r, x));
  return new THREE.LatheGeometry(pts, seg).rotateZ(-Math.PI / 2);
}

export function createLenzScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): LenzScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D: banco con un magnete a barra (N rosso, S verde) su un cavaliere scorrevole, una bobina di rame avvolta a strati aperta in sezione su un supporto in bachelite, collegata con cavi rosso e nero a un galvanometro a zero centrale, linee del campo del magnete e del campo indotto calcolate.',
    camera: { ...HOME, fov: FOV },
    controls: { minDistance: 5, maxDistance: 28 },
    floorY: FLOOR_Y,
    shadowRadius: 8,
    look: 'teardown',
  });
  const { scene } = stage;
  const kit = stage.materials;

  // --- resource tracking (non-kit) -----------------------------------------------------
  const geometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.add(g);
    live.geometries++;
    return g;
  };
  const dropGeo = (g: THREE.BufferGeometry): void => {
    if (geometries.delete(g)) {
      g.dispose();
      live.geometries--;
    }
  };
  const mat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    live.materials++;
    return m;
  };
  const tex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    live.textures++;
    return t;
  };
  const mesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const sink: PartsSink = { geo, mat, mesh, tex };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- static apparatus: board, rail, coil stand, galvanometer ---------------------------
  const bench = buildBench(sink, stage);
  scene.add(bench.root);
  const pedestal = bench.standPost;
  const dialTex = tex(new THREE.CanvasTexture(dialCanvas()));
  dialTex.colorSpace = THREE.SRGBColorSpace;
  dialTex.anisotropy = 4;
  const galvo = buildGalvanometer(sink, dialTex);
  scene.add(galvo.root);
  const needlePivot = galvo.needlePivot;
  const termW = galvo.terminals;

  // --- coil: bakelite former + flanges, layered winding, opened front-top quadrant -------
  stage.renderer.localClippingEnabled = true;
  // removes y > 0 AND z > 0 (clipIntersection): the quarter facing the camera, above the axis
  const cut = [new THREE.Plane(v(0, -1, 0), 0), new THREE.Plane(v(0, 0, -1), 0)];
  const clipped = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial =>
    mat(
      new THREE.MeshStandardMaterial({
        ...p,
        clippingPlanes: cut,
        clipIntersection: true,
        clipShadows: true,
        side: THREE.DoubleSide,
      }),
    );
  const wireMat = clipped({
    color: 0xd07a45,
    metalness: 0.55,
    roughness: 0.36,
    envMapIntensity: 1.0,
    emissive: 0x2a1206, // lifts the copper out of the dark studio, below bloom
  });
  const formerMat = clipped({ color: 0x2e3238, metalness: 0, roughness: 0.55 });
  const capOpts = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  } as const;
  const capTex = tex(new THREE.CanvasTexture(wireSectionCanvas()));
  capTex.colorSpace = THREE.SRGBColorSpace;
  capTex.wrapS = capTex.wrapT = THREE.RepeatWrapping;
  const windCapMat = mat(
    new THREE.MeshStandardMaterial({ map: capTex, metalness: 0.4, roughness: 0.5, ...capOpts }),
  );
  // red section colour of cut bakelite, as on exhibition cutaways
  const flatCapMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x8a3a2c, roughness: 0.85, ...capOpts }),
  );
  const coil = new THREE.Group();
  coil.name = 'coil';
  scene.add(coil);
  const coilParts = new THREE.Group(); // rebuilt with a / N / tier
  coil.add(coilParts);
  let wire: THREE.Mesh | null = null;
  let coilKey = '';
  let rWire0 = 0.8; // radius of the first layer
  let rOut = 0.9; // outer radius of the winding
  let rFlange = 1.0;
  const wireStart = v();
  const wireEnd = v();
  const tails: THREE.Vector3[][] = [[], []];

  // --- magnet (painted halves) on its rider ---------------------------------------------------
  const magnet = new THREE.Group();
  magnet.name = 'magnet';
  scene.add(magnet);
  const paint = {
    N: mat(new THREE.MeshStandardMaterial({ color: 0xb42f28, metalness: 0.15, roughness: 0.42 })),
    S: mat(new THREE.MeshStandardMaterial({ color: 0x2f7a52, metalness: 0.15, roughness: 0.42 })),
  };
  const halfGeo = geo(chamferBox(MAG_LEN / 2 - 0.012, MAG_SIDE, MAG_SIDE, 0.05));
  const near = new THREE.Mesh(halfGeo, paint.N);
  near.position.x = -MAG_LEN / 4;
  const far = new THREE.Mesh(halfGeo, paint.S);
  far.position.x = MAG_LEN / 4;
  const seam = mesh(geo(chamferBox(0.03, MAG_SIDE - 0.08, MAG_SIDE - 0.08, 0.01, 1)), 'darkSteel');
  magnet.add(near, far, seam);
  // engraved nameplates (front, top, end face) for both possible orientations
  const plateGeo = geo(new THREE.PlaneGeometry(0.4, 0.4));
  const plates: Record<'N' | 'S', THREE.Mesh[]> = { N: [], S: [] };
  for (const half of [-1, 1] as const) {
    for (const letter of ['N', 'S'] as const) {
      const set: THREE.Mesh[] = [];
      const x = (half * MAG_LEN) / 4;
      const kind = letter === 'N' ? 'magnetN' : 'magnetS';
      const front = mesh(plateGeo, kind);
      front.position.set(x, 0, MAG_SIDE / 2 + 0.004);
      const topP = mesh(plateGeo, kind);
      topP.position.set(x, MAG_SIDE / 2 + 0.004, 0);
      topP.rotation.x = -Math.PI / 2;
      const end = mesh(plateGeo, kind);
      end.position.set(half * (MAG_LEN / 2 + 0.004), 0, 0);
      end.rotation.y = half * (Math.PI / 2);
      set.push(front, topP, end);
      for (const s of set) {
        s.userData['half'] = half;
        magnet.add(s);
      }
      plates[letter].push(...set);
    }
  }
  const carriage = buildCarriage(sink, MAG_SIDE);
  scene.add(carriage);

  // --- force arrow --------------------------------------------------------------------------
  const arrow = new THREE.Group();
  scene.add(arrow);
  const arrowShaft = mesh(
    geo(new THREE.CylinderGeometry(0.05, 0.05, 1, 16).rotateZ(-Math.PI / 2).translate(0.5, 0, 0)),
    'glowF',
    'force',
  );
  const arrowHead = mesh(
    geo(new THREE.ConeGeometry(0.15, 0.36, 24).rotateZ(-Math.PI / 2)),
    'glowF',
    'force',
  );
  arrow.add(arrowShaft, arrowHead);

  stage.castShadows(bench.root);
  stage.castShadows(coil);
  stage.castShadows(galvo.root);
  stage.castShadows(magnet);
  stage.castShadows(carriage);
  stage.castShadows(arrow, false);
  stage.occluders.push(near, far, galvo.caseMesh, ...bench.occluders);
  // base tier: bake the static parts to one mesh per material (draw-call budget)
  if (stage.tier === 'base') {
    const opts = { kit, track: geo, drop: dropGeo };
    mergeStatic(bench.root, { ...opts, keep: [pedestal, ...bench.occluders] });
    mergeStatic(galvo.root, { ...opts, keep: [galvo.needlePivot, galvo.caseMesh] });
    mergeStatic(carriage, opts);
  }

  // --- leads: red/black 4 mm cables from the coil stand to the galvanometer (static) -----------
  const sA = bench.standPlugs[0] as THREE.Vector3;
  const sB = bench.standPlugs[1] as THREE.Vector3;
  const t0 = termW[0] as THREE.Vector3;
  const t1 = termW[1] as THREE.Vector3;
  // lead A: coil stand − (black) → galvanometer −; lead B: coil stand + (red) → galvanometer +
  const ptsA = [
    sA.clone(),
    v(sA.x - 0.05, sA.y + 0.25, sA.z + 0.2),
    v(sA.x - 0.4, BENCH_TOP + 0.05, sA.z + 1.05),
    v(-1.6, BENCH_TOP + 0.04, 2.15),
    v(t0.x + 0.15, t0.y + 0.15, t0.z + 0.55),
    v(t0.x, t0.y + 0.18, t0.z + 0.05),
    t0.clone(),
  ];
  const ptsB = [
    sB.clone(),
    v(sB.x + 0.05, sB.y + 0.3, sB.z + 0.2),
    v(sB.x - 0.1, BENCH_TOP + 0.05, sB.z + 1.35),
    v(-1.2, BENCH_TOP + 0.04, 2.5),
    v(t1.x + 0.25, t1.y + 0.2, t1.z + 0.6),
    v(t1.x, t1.y + 0.2, t1.z + 0.05),
    t1.clone(),
  ];
  const cable = (pts: THREE.Vector3[], key: string): THREE.Mesh => {
    const m = mesh(
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          stage.tier === 'base' ? 48 : 80,
          0.032,
          stage.tier === 'base' ? 5 : 10,
        ),
      ),
      'plastic',
      key,
    );
    scene.add(m);
    stage.castShadows(m);
    return m;
  };
  cable(ptsA, 'socketBlack');
  cable(ptsB, 'socketRed');
  const leadA = new THREE.CatmullRomCurve3(ptsA, false, 'centripetal');
  const leadB = new THREE.CatmullRomCurve3(ptsB, false, 'centripetal');

  const flow: CurrentFlow = createCurrentFlow(stage, {
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: 130,
    radius: 0.036,
    speedPerAmp: PARTICLE_SPEED_FS,
    vMax: 2.2,
    smooth: false,
  });

  // --- field lines -------------------------------------------------------------------------------
  const magLines: FieldLines = createFieldLines(stage, {
    linewidth: 2.1,
    spacing: 0.95,
    speed: 0.85,
  });
  const indOpts = {
    linewidth: 1.35,
    spacing: 0.34,
    speed: 0.7,
    base: 0.1,
    gain: 1.7,
    opacity: 0.85,
  };
  const indLines: Record<'pos' | 'neg', FieldLines> = {
    pos: createFieldLines(stage, indOpts),
    neg: createFieldLines(stage, indOpts),
  };
  indLines.pos.setVisible(false);
  indLines.neg.setVisible(false);

  /** Magnet field in the magnet's own frame (centre at the origin, axis x). */
  const magnetSpec = (pole: Pole): FieldSpec => {
    // N facing the coil (−x side) ⇒ moment toward −x.
    const mx = pole === 'N' ? -1 : 1;
    const xs = dipoleChain(MAG_LEN);
    return {
      kind: 'sum',
      parts: xs.map((x) => ({ kind: 'dipole', m: [mx / xs.length, 0, 0], at: [x, 0, 0] })),
    };
  };
  let magKey = '';
  const traceMagnet = (pole: Pole): void => {
    const key = `${pole}|${stage.tier}`;
    if (key === magKey) return;
    magKey = key;
    const field = magnetSpec(pole);
    const f = fieldFromSpec(field);
    const face = -MAG_LEN / 2 - 0.03;
    const cands = seedDisc([face, 0, 0], [0, 1, 0], [0, 0, 1], MAG_SIDE * 0.47, 500);
    const n = Math.max(14, Math.round(28 * stage.settings.lineDensity));
    const job: TraceJob = {
      field,
      seeds: seedByFlux(f, cands, [1, 0, 0], n),
      options: {
        bounds: { min: [-7.5, -3.4, -3.4], max: [3.2, 3.4, 3.4] },
        stopBoxes: [
          {
            min: [-MAG_LEN / 2 + 0.01, -MAG_SIDE / 2 + 0.01, -MAG_SIDE / 2 + 0.01],
            max: [MAG_LEN / 2 - 0.01, MAG_SIDE / 2 - 0.01, MAG_SIDE / 2 - 0.01],
          },
        ],
        maxAngle: 0.05,
        maxPoints: 700,
        direction: 0,
      },
    };
    void magLines.setJob(job);
  };

  let indKey = '';
  const traceInduced = (r0: number, len: number): void => {
    const key = `${r0.toFixed(3)}|${len.toFixed(3)}|${stage.tier}`;
    if (key === indKey) return;
    indKey = key;
    const n = Math.max(8, Math.round(18 * stage.settings.lineDensity));
    for (const sgn of [1, -1] as const) {
      const field: FieldSpec = {
        kind: 'solenoid',
        R: r0,
        L: Math.max(0.05, len),
        N: 1,
        I: sgn,
        at: [0, 0, 0],
        axis: 'x',
        loops: 6,
      };
      const f = fieldFromSpec(field);
      const cands = seedDisc([0, 0, 0], [0, 1, 0], [0, 0, 1], r0 * 0.86, 400);
      const ext = r0 * 3 + 1.2;
      void indLines[sgn > 0 ? 'pos' : 'neg'].setJob({
        field,
        seeds: seedByFlux(f, cands, [1, 0, 0], n),
        options: {
          bounds: { min: [-ext - 0.6, -ext, -ext], max: [ext + 0.6, ext, ext] },
          maxAngle: 0.06,
          maxPoints: 500,
          direction: 0,
        },
      });
    }
  };

  // --- coil geometry (rebuilt on a / N / tier change) ------------------------------------------
  const clearCoilParts = (): void => {
    for (const c of coilParts.children.slice()) {
      coilParts.remove(c);
      if (c instanceof THREE.Mesh) dropGeo(c.geometry);
    }
  };
  const buildCoil = (a: number, N: number): void => {
    const turns = visualTurns(N, TURN_CAP[stage.tier]);
    const R0 = a * SCALE;
    const key = `${R0.toFixed(4)}|${turns}|${stage.tier}`;
    if (key === coilKey) return;
    coilKey = key;
    const { layers, perLayer } = windingLayout(turns, PER_LAYER_MAX);
    rWire0 = R0;
    rOut = R0 + (layers - 1) * PITCH * 0.92 + WIRE_R;
    rFlange = rOut + 0.16;
    const rForm = R0 - WIRE_R - 0.008;
    const rBore = rForm - 0.06;
    const seg = stage.tier === 'base' ? 40 : 72;
    const xF = FORMER_HALF + FLANGE_T / 2;

    // former tube, flanges, and their section caps on both cut planes
    clearCoilParts();
    const add = (m: THREE.Mesh): void => {
      coilParts.add(m);
    };
    add(
      new THREE.Mesh(
        geo(ringX(rBore, rForm, -xF - FLANGE_T / 2, xF + FLANGE_T / 2, seg)),
        formerMat,
      ),
    );
    for (const s of [-1, 1]) {
      const g = geo(ringX(rBore, rFlange, s * xF - FLANGE_T / 2, s * xF + FLANGE_T / 2, seg));
      add(new THREE.Mesh(g, formerMat));
    }
    /** Rectangle x0..x1 × r0..r1 on the cut plane z = 0 (y > 0) and on y = 0 (z > 0). */
    const capPair = (x0: number, x1: number, r0: number, r1: number, m: THREE.Material): void => {
      const w = x1 - x0;
      const h = r1 - r0;
      const a1 = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), m);
      a1.position.set((x0 + x1) / 2, (r0 + r1) / 2, 0);
      const a2 = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2)), m);
      a2.position.set((x0 + x1) / 2, 0, (r0 + r1) / 2);
      a1.castShadow = a2.castShadow = false;
      add(a1);
      add(a2);
    };
    capPair(-xF - FLANGE_T / 2, xF + FLANGE_T / 2, rBore, rForm, flatCapMat);
    for (const s of [-1, 1])
      capPair(s * xF - FLANGE_T / 2, s * xF + FLANGE_T / 2, rForm, rFlange, flatCapMat);

    // winding: layer-wound helix, back and forth
    const perTurn = Math.max(10, Math.round(26 * stage.settings.tessellation));
    const pts: THREE.Vector3[] = [];
    const halfLen = ((perLayer - 1) * PITCH) / 2;
    let theta = Math.PI / 2; // start in front (z = +r), current CCW about +x for i > 0
    let left = turns;
    for (let k = 0; k < layers && left > 0; k++) {
      const n = Math.min(perLayer, left);
      left -= n;
      const r = R0 + k * PITCH * 0.92;
      const dir = k % 2 === 0 ? 1 : -1;
      const xa = dir > 0 ? -halfLen : halfLen;
      for (let t = 0; t < n; t++) {
        for (let s = 0; s < perTurn; s++) {
          const u = (t + s / perTurn) / Math.max(1, n - 1 + 1e-9);
          const x = xa + dir * Math.min(1, u) * 2 * halfLen;
          pts.push(new THREE.Vector3(x, r * Math.cos(theta), r * Math.sin(theta)));
          theta += (2 * Math.PI) / perTurn;
        }
      }
    }
    const last = pts[pts.length - 1] as THREE.Vector3;
    const first = pts[0] as THREE.Vector3;
    wireStart.copy(first);
    wireEnd.set(last.x, 0, Math.hypot(last.y, last.z));
    pts.push(wireEnd.clone());
    // winding cross-section caps: one copper disc per wire (texture tile = pitch)
    const wx0 = -halfLen - WIRE_R;
    const wx1 = halfLen + WIRE_R;
    const wr0 = R0 - WIRE_R;
    capTex.repeat.set((wx1 - wx0) / PITCH, (rOut - wr0) / (PITCH * 0.92));
    capPair(wx0, wx1, wr0, rOut, windCapMat);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const g = geo(
      new THREE.TubeGeometry(curve, pts.length, WIRE_R, stage.tier === 'base' ? 5 : 7, false),
    );
    if (wire) {
      dropGeo(wire.geometry);
      wire.geometry = g;
    } else {
      wire = new THREE.Mesh(g, wireMat);
      coil.add(wire);
    }
    // winding tails: from the winding ends down into the stand (grommets behind the sockets)
    const tailPts = (p: THREE.Vector3, sx: number): THREE.Vector3[] => {
      const gx = sx * 0.55;
      const gz = 0.78;
      return [
        p.clone(),
        v(p.x, -0.3, Math.hypot(p.y, p.z) + 0.1),
        v((p.x + gx) / 2, (-0.3 + STAND_TOP) / 2, Math.max(rOut + 0.12, gz + 0.05)),
        v(gx, STAND_TOP + 0.25, gz),
        v(gx, STAND_TOP, gz),
      ];
    };
    tails[0] = tailPts(wireStart, (STAND_SOCKETS[0] as [number, number])[0]);
    tails[1] = tailPts(wireEnd, (STAND_SOCKETS[1] as [number, number])[0]);
    for (const tp of tails)
      add(
        new THREE.Mesh(
          geo(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(tp, false, 'centripetal'),
              stage.tier === 'base' ? 24 : 40,
              0.022,
              stage.tier === 'base' ? 4 : 6,
            ),
          ),
          wireMat,
        ),
      );
    stage.castShadows(coil);
    for (const c of coilParts.children)
      if (c instanceof THREE.Mesh && c.geometry instanceof THREE.PlaneGeometry)
        c.castShadow = false;
    // cradle post under the flanges
    const pTop = -rFlange + 0.03;
    pedestal.scale.y = Math.max(0.05, pTop - STAND_TOP);
    pedestal.position.set(0, (pTop + STAND_TOP) / 2, 0);
    buildFlowPath();
    traceInduced(R0 + ((layers - 1) * PITCH * 0.92) / 2, 2 * halfLen + PITCH);
  };

  /**
   * Particle loop. Positive i circulates counter-clockwise about +x, i.e. from the winding
   * START to its END: galvanometer − → lead A → stand socket − → tail → start → helix outside
   * the winding → end → tail → socket + → lead B → galvanometer + (needle to the right) → inside.
   */
  const buildFlowPath = (): void => {
    const loop: THREE.Vector3[] = [];
    for (let k = 24; k >= 0; k--) loop.push(leadA.getPoint(k / 24));
    const tailA = new THREE.CatmullRomCurve3((tails[0] as THREE.Vector3[]).slice().reverse());
    loop.push(v(sA.x, STAND_TOP + 0.03, sA.z));
    for (let k = 0; k <= 12; k++) loop.push(tailA.getPoint(k / 12));
    const rh = rOut + 0.075;
    const turnsP = 3;
    const steps = turnsP * 28;
    const x0 = wireStart.x;
    const x1 = wireEnd.x;
    for (let k = 1; k < steps; k++) {
      const th = Math.PI / 2 + (2 * Math.PI * turnsP * k) / steps;
      loop.push(v(x0 + ((x1 - x0) * k) / steps, rh * Math.cos(th), rh * Math.sin(th)));
    }
    const tailB = new THREE.CatmullRomCurve3(tails[1] as THREE.Vector3[]);
    for (let k = 0; k <= 12; k++) loop.push(tailB.getPoint(k / 12));
    loop.push(v(sB.x, STAND_TOP + 0.03, sB.z));
    for (let k = 0; k <= 24; k++) loop.push(leadB.getPoint(k / 24));
    loop.push(...galvo.inner);
    flow.setPath(loop, true);
  };

  // --- labels: fixed callout spots off the working part, leader lines to the parts -------------
  const labels = createLabelLayer(stage, overlay);
  type Key = 'face' | 'coil' | 'bMag' | 'bInd' | 'current' | 'force';
  const parts: Record<Key, THREE.Vector3> = {
    face: v(),
    coil: v(),
    bMag: v(),
    bInd: v(),
    current: galvo.root.localToWorld(v(0, 1.42, 0.2)),
    force: v(),
  };
  const ends: Record<Key, THREE.Vector3> = {
    face: v(0.2, 2.75, 0),
    coil: v(-0.6, BENCH_TOP + 0.05, 3.0),
    bMag: v(5.2, -1.75, 2.5),
    bInd: v(-2.2, 2.35, -0.4),
    current: galvo.root.localToWorld(v(-0.2, 2.15, 0.2)),
    // idle spot of the force sensor (above the rail), moves with the arrow while F ≠ 0
    force: v(3.6, 2.0, 0),
  };
  const KEYS = Object.keys(parts) as Key[];
  const leaderPos = new Float32Array(KEYS.length * 6);
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
  const L: Record<Key, Label> = {
    face: tag('face', { text: 'faccia N', size: 'lg', priority: 9 }),
    current: tag('current', { text: 'i', quantity: 'i', priority: 8, sensorWidth: '24ch' }),
    force: tag('force', { text: 'F', quantity: 'f', priority: 7, sensorWidth: '20ch' }),
    bMag: tag('bMag', { text: 'B̄', quantity: 'b', priority: 6, sensorWidth: '22ch' }),
    bInd: tag('bInd', { text: 'B indotto', quantity: 'b', priority: 5, size: 'sm' }),
    coil: tag('coil', { text: 'N', priority: 4, size: 'sm' }),
  };
  const shown: Record<Key, boolean> = {
    face: true,
    coil: true,
    bMag: true,
    bInd: true,
    current: true,
    force: true,
  };
  const updateLeaders = (): void => {
    KEYS.forEach((k, i) => {
      const a = parts[k];
      const b = shown[k] ? ends[k] : a;
      leaderPos.set([a.x, a.y, a.z, b.x, b.y, b.z], 6 * i);
    });
    (leaderGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  const offTier = stage.onTierChange(() => {
    coilKey = '';
    magKey = '';
    indKey = '';
  });

  // --- picking ------------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const toRay = (clientX: number, clientY: number): void => {
    const r = stage.canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
  };
  const pickables = [near, far];

  // --- per-frame update -----------------------------------------------------------------------------
  let lastPole: Pole | null = null;
  let threading = 0;
  const render = (f: LenzFrame): void => {
    applyTints(stage);
    buildCoil(f.a, f.N);
    traceMagnet(f.pole);
    if (f.pole !== lastPole) {
      lastPole = f.pole;
      const nearLetter = f.pole;
      near.material = paint[nearLetter];
      far.material = paint[nearLetter === 'N' ? 'S' : 'N'];
      for (const letter of ['N', 'S'] as const) {
        for (const p of plates[letter]) {
          const isNear = (p.userData['half'] as number) < 0;
          p.visible = isNear ? letter === nearLetter : letter !== nearLetter;
        }
      }
    }
    const xm = f.z * SCALE;
    magnet.position.x = xm;
    carriage.position.x = xm;
    magLines.object.position.x = xm;
    magLines.setFlow(0.9);

    // induced field lines: only while a current flows
    const showInd = f.sign !== 0;
    const kInd = showInd
      ? Math.min(1.2, (INDUCED_VISUAL_GAIN * Math.abs(f.Bind)) / Math.max(1e-30, Math.abs(f.B)))
      : 0;
    indLines.pos.setVisible(showInd && f.Bind > 0);
    indLines.neg.setVisible(showInd && f.Bind < 0);
    indLines.pos.setFlow(kInd);
    indLines.neg.setFlow(kInd);

    // galvanometer needle + particles
    needlePivot.rotation.z = -f.needle;
    kit.get('glowI', 'needle').emissiveIntensity = 0.35;
    flow.setCurrent(f.range > 0 ? f.i / f.range : 0);

    // force arrow (log length), above the magnet
    const len = logLength(f.F, 1e-9, 1, 0.55, 2.4);
    arrow.visible = len > 0;
    if (arrow.visible) {
      const sgn = Math.sign(f.F);
      const head = 0.36;
      const shaft = Math.max(0.05, len - head);
      arrow.position.set(
        xm + (sgn > 0 ? MAG_LEN / 2 - 0.4 : -MAG_LEN / 2 + 0.4),
        MAG_SIDE / 2 + 0.42,
        0,
      );
      arrow.rotation.y = sgn > 0 ? 0 : Math.PI;
      arrowShaft.scale.x = shaft;
      arrowHead.position.x = shaft + head / 2;
      parts.force.set(arrow.position.x + (sgn * len) / 2, arrow.position.y + 0.1, 0);
      ends.force.set(parts.force.x, arrow.position.y + 1.05, 0);
    }
    kit.get('glowF', 'force').emissiveIntensity = 0.9;

    // label anchors (parts follow the coil size and the magnet)
    parts.face.set(-FORMER_HALF - FLANGE_T, rFlange * 0.75, -rFlange * 0.4);
    parts.coil.set(0.1, -rOut * 0.55, rOut * 0.85);
    parts.bMag.set(Math.max(0.75, xm - MAG_LEN / 2 - 0.45), -0.32, 0.2);
    parts.bInd.set(-FORMER_HALF - 1.0, Math.min(rOut + 0.5, 1.6), 0);
    ends.face.set(0.9, rFlange + 1.5, 0);
    ends.bInd.set(-2.0, Math.max(2.4, rFlange + 1.2), -0.6);
    shown.face = f.sign !== 0;
    shown.bInd = showInd;
    shown.force = arrow.visible;
    L.face.setVisible(shown.face);
    L.bInd.setVisible(shown.bInd);
    L.force.setVisible(shown.force);
    updateLeaders();
    const t = f.labels;
    L.face.setText(t.face);
    L.coil.setText(t.coil);
    L.bMag.setText(t.bMag);
    L.bInd.setText(t.bInd);
    L.current.setText(t.current);
    L.force.setText(t.force);

    // debug: lines of the magnet that thread the coil now (x crossing inside the coil radius)
    threading = countThreading(magLines, xm, rWire0);
    stage.render();
  };

  live.scenes++;
  let disposed = false;
  return {
    canvas: stage.canvas,
    stage,
    render,
    hitMagnet(clientX, clientY) {
      toRay(clientX, clientY);
      return raycaster.intersectObjects(pickables, false).length > 0;
    },
    axisX(clientX, clientY) {
      toRay(clientX, clientY);
      // plane through the magnet axis, facing the camera
      nrm.set(0, stage.camera.position.y, stage.camera.position.z);
      if (nrm.lengthSq() < 1e-9) return null;
      plane.setFromNormalAndCoplanarPoint(nrm.normalize(), hit.set(0, 0, 0));
      const p = raycaster.ray.intersectPlane(plane, hit);
      return p ? p.x / SCALE : null;
    },
    info: () => ({
      ...stage.info(),
      fieldLines: magLines.count,
      inducedLines: indLines.pos.count + indLines.neg.count,
      threading,
      trace: magLines.lastTrace,
      labels: labels.stats(),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      offTier();
      labels.dispose();
      magLines.dispose();
      indLines.pos.dispose();
      indLines.neg.dispose();
      flow.dispose();
      for (const g of [...geometries]) dropGeo(g);
      for (const m of materials.splice(0)) {
        m.dispose();
        live.materials--;
      }
      for (const x of textures.splice(0)) {
        x.dispose();
        live.textures--;
      }
      stage.dispose();
      live.scenes--;
    },
  };
}

/**
 * Number of drawn magnet field lines that cross the coil plane x = 0 inside the
 * coil radius (debug / e2e: it grows as the magnet approaches, ∝ Φ).
 */
function countThreading(lines: FieldLines, xm: number, r: number): number {
  let n = 0;
  for (const l of lines.traced) {
    const p = l.points;
    for (let i = 0; i < l.count - 1; i++) {
      const xa = (p[3 * i] as number) + xm;
      const xb = (p[3 * i + 3] as number) + xm;
      if ((xa <= 0 && xb > 0) || (xa > 0 && xb <= 0)) {
        const t = xa / (xa - xb);
        const y =
          (p[3 * i + 1] as number) + t * ((p[3 * i + 4] as number) - (p[3 * i + 1] as number));
        const z =
          (p[3 * i + 2] as number) + t * ((p[3 * i + 5] as number) - (p[3 * i + 2] as number));
        if (y * y + z * z < r * r) {
          n++;
          break;
        }
      }
    }
  }
  return n;
}
