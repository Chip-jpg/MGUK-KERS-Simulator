/**
 * Three.js scene of `rl-energy` (teardown look, `look: 'teardown'`): a school RL bench
 * (`./parts`, reference and real dimensions there) — a tray of 1,5 V D cells, a knife switch
 * with an animated blade, a wire-wound rheostat and a long air-core field coil on two stands,
 * wired in series with red/black 4 mm leads. The field coil is the hero: its front-top
 * quadrant is cut away (two clipping planes, flat section caps on the tube, flanges and on
 * every cut turn) so the computed interior field and the stored energy can be seen inside.
 *
 * What is physics and what is illustration (scales in ./visual.ts, stated in the
 * legend and the model note):
 *  - cells drawn ∝ E (1,5 V each);
 *  - current particles: velocity ∝ i(t) from the RK4 model (still while open);
 *  - B field: lines COMPUTED for a finite solenoid (`solenoidField`, sum of
 *    coaxial loops), seeded by flux on the mid-plane; the number drawn ∝ i/I_ref
 *    and the flow ∝ i — the field visibly builds up with the time constant τ;
 *  - stored energy ½·L·i²: purple glow filling the bore ∝ U/U_ref (∝ i², it
 *    lags the lines);
 *  - self-induced emf −L·di/dt: amber arrow along the coil against the
 *    current, length ∝ |emf|/E (= E at t = 0⁺, then decaying as e^(−t/τ));
 *  - energy ribbons: generator E·i splitting into Joule R·i² (to the resistor)
 *    and L·i·di/dt (into the field), radius ∝ power;
 *  - resistor wire temperature: lumped thermal model (illustrative wire), black
 *    body glow only above 700 K, labelled false colour below.
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  applyHeatGlow,
  createCurrentFlow,
  createEnergyRibbon,
  createFieldLines,
  createLabelLayer,
  createStage,
  ironbow,
  seedByFlux,
  seedDisc,
  spreadOrder,
  fieldFromSpec,
  type CurrentFlow,
  type EnergyRibbon,
  type FieldLines,
  type FieldSpec,
  type Label,
  type MaterialKind,
  type Stage,
  type StageInfo,
  type TraceJob,
} from '../../render';
import { quantityColorHex } from '../../ui/colors';
import { BAT, BENCH_TOP, FLOOR_Y, RES, SOL, SW, applyTints, buildApparatus, latheY } from './parts';
import type { PartsSink } from './parts';
import {
  MAX_CELLS,
  PARTICLE_SPEED_PER_AMP,
  PARTICLE_VMAX,
  RES_T_SCALE_C,
  SOLENOID_TURNS,
  cellCount,
  lineFraction,
  sceneStats,
} from './visual';

export interface RlSceneTexts {
  battery: string;
  switch: string;
  current: string;
  resistor: string;
  solenoid: string;
  emf: string;
  energy: string;
}

export interface RlSceneView {
  closed: boolean;
  /** Current [A] and the reference current of the visual scales [A]. */
  i: number;
  Iref: number;
  E: number;
  /** Self-induced emf −L di/dt [V]. */
  emfSelf: number;
  /** Stored energy and its reference ½·L·I_ref² [J]. */
  U: number;
  Uref: number;
  /** Powers [W] and the ribbon reference E·I_ref [W]. */
  pGen: number;
  pJoule: number;
  pField: number;
  pRef: number;
  /** Resistor wire temperature [K]. */
  T: number;
  thermal: boolean;
  /** Iron core shown (L from the solenoid with μᵣ > 1). */
  core: boolean;
  /** Put the switch blade at its end position at once (paused loop, reduced motion). */
  snap: boolean;
  texts: RlSceneTexts;
}

export interface RlSceneInfo extends StageInfo {
  labels: { labels: number; nudged: number; occluded: number; overlaps: number };
  fieldLines: number;
  linesShown: number;
  trace: { ms: number; where: string };
  blade: number;
  cells: number;
  frames: number;
}

export interface RlScene {
  readonly stage: Stage;
  update(v: RlSceneView): void;
  render(): void;
  prewarm(): void;
  info(): RlSceneInfo;
  dispose(): void;
}

// --- layout / framing ---------------------------------------------------------------------------
const OPEN_ANGLE = (62 * Math.PI) / 180;
/** Drawn wire radius (illustrative: thicker than the real ~1,5 mm so the turns read). */
const WIRE_R = 0.032;
const TUBE_OUT = SOL.r - WIRE_R - 0.004;
const TUBE_IN = TUBE_OUT - 0.045;
const FLANGE_R = SOL.r + 0.1;
const FLANGE_X = SOL.tube / 2 - 0.12;
const FLANGE_T = 0.1;
const CORE_R = TUBE_IN - 0.06;
/** Default framing: whole bench, 3/4 from the front, slightly above. */
const FOV = 34;
const VIEW_TARGET: [number, number, number] = [-0.05, 0.85, 0.1];
const VIEW_DIST = 12.4;
const VIEW_EL = (25 * Math.PI) / 180;
const VIEW_AZ = (-4 * Math.PI) / 180;
const HOME = {
  position: [
    VIEW_TARGET[0] + VIEW_DIST * Math.cos(VIEW_EL) * Math.sin(VIEW_AZ),
    VIEW_TARGET[1] + VIEW_DIST * Math.sin(VIEW_EL),
    VIEW_TARGET[2] + VIEW_DIST * Math.cos(VIEW_EL) * Math.cos(VIEW_AZ),
  ] as [number, number, number],
  target: VIEW_TARGET,
};

const ENERGY_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ENERGY_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying vec3 vN;
varying vec3 vView;
void main() {
  float rim = clamp(1.0 - abs(dot(vN, vView)), 0.0, 1.0); // pow(<0) is NaN → bloom blow-up
  float a = uAmount * (0.2 + 0.6 * pow(rim, 1.6));
  gl_FragColor = vec4(uColor * (0.45 + 0.5 * uAmount), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Closed (r, x) section revolved about the x axis (tube, flanges, core). */
function ringX(rIn: number, rOut: number, x0: number, x1: number, seg: number) {
  return latheY(
    [
      [rIn, x0],
      [rOut, x0],
      [rOut, x1],
      [rIn, x1],
      [rIn, x0],
    ],
    seg,
  ).rotateZ(-Math.PI / 2);
}

export function createRlScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): RlScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D del circuito RL sul banco: vaschetta di pile da 1,5 V, interruttore a coltello, reostato a filo avvolto e una lunga bobina di campo aperta in sezione, collegati in serie con cavi rosso e nero; dentro la bobina le linee del campo B calcolate e l’energia ½·L·i², che crescono con la corrente.',
    camera: { ...HOME, fov: FOV },
    controls: { minDistance: 4, maxDistance: 26, maxPolarAngle: (84 * Math.PI) / 180 },
    floorY: FLOOR_Y,
    shadowRadius: 8,
    look: 'teardown',
  });
  stage.canvas.setAttribute('aria-hidden', 'true');
  const { scene } = stage;
  const kit = stage.materials;

  // --- resource tracking (non-kit) ---------------------------------------------------------
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
  const mesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const sink: PartsSink = {
    geo,
    mat,
    mesh,
    tex: (t) => t, // no textures in this scene
  };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

  // --- static apparatus ---------------------------------------------------------------------
  const app = buildApparatus(sink, MAX_CELLS);
  scene.add(app.root);
  kit.assign(app.cells, 'plastic', 'cell');
  kit.assign(app.caps, 'steel', 'nickel');
  kit.assign(app.straps, 'steel', 'nickel');
  app.cells.count = app.caps.count = 8;
  app.straps.count = 7;
  const blade = app.blade;
  let bladeAngle = OPEN_ANGLE;
  let bladeTarget = OPEN_ANGLE;

  // --- field coil: acrylic tube, flanges, single-layer winding, opened front-top quadrant ---
  stage.renderer.localClippingEnabled = true;
  // removes y > SOL.y AND z > SOL.z (clipIntersection): the quarter facing the camera, above the axis
  const cut = [new THREE.Plane(v(0, -1, 0), SOL.y), new THREE.Plane(v(0, 0, -1), SOL.z)];
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
    emissive: 0x2a1206,
  });
  const tubeMat = clipped({
    color: 0xb9d3dc,
    metalness: 0,
    roughness: 0.12,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const flangeMat = clipped({ color: 0x3a4048, metalness: 0.1, roughness: 0.5 });
  const coreMat = clipped({ color: 0x6a6f77, metalness: 0.65, roughness: 0.42 });
  const capOpts = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  } as const;
  // red section colour of cut parts, as on exhibition cutaways; bright copper on cut turns
  const flatCapMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x8a3a2c, roughness: 0.85, ...capOpts }),
  );
  const ironCapMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.5, roughness: 0.5, ...capOpts }),
  );
  const turnCapMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xf0a878,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x3a1808,
      ...capOpts,
    }),
  );

  const coil = new THREE.Group();
  coil.name = 'coil';
  coil.position.set(SOL.x, SOL.y, SOL.z);
  scene.add(coil);
  const seg = 72;
  const tube = new THREE.Mesh(
    geo(ringX(TUBE_IN, TUBE_OUT, -SOL.tube / 2, SOL.tube / 2, seg)),
    tubeMat,
  );
  tube.renderOrder = 3;
  coil.add(tube);
  for (const s of [-1, 1]) {
    coil.add(
      new THREE.Mesh(
        geo(
          ringX(TUBE_IN, FLANGE_R, s * FLANGE_X - FLANGE_T / 2, s * FLANGE_X + FLANGE_T / 2, seg),
        ),
        flangeMat,
      ),
    );
  }
  /** Rectangle x0..x1 × r0..r1 on the cut plane z = 0 (y > 0) and on y = 0 (z > 0). */
  const capPair = (
    parent: THREE.Object3D,
    x0: number,
    x1: number,
    r0: number,
    r1: number,
    m: THREE.Material,
  ): void => {
    const w = x1 - x0;
    const h = r1 - r0;
    const a1 = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), m);
    a1.position.set((x0 + x1) / 2, (r0 + r1) / 2, 0);
    const a2 = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2)), m);
    a2.position.set((x0 + x1) / 2, 0, (r0 + r1) / 2);
    parent.add(a1, a2);
  };
  capPair(coil, -SOL.tube / 2, SOL.tube / 2, TUBE_IN, TUBE_OUT, flatCapMat);
  for (const s of [-1, 1])
    capPair(
      coil,
      s * FLANGE_X - FLANGE_T / 2,
      s * FLANGE_X + FLANGE_T / 2,
      TUBE_OUT,
      FLANGE_R,
      flatCapMat,
    );

  // optional iron core (μᵣ > 1): solid rod with its own section
  const core = new THREE.Group();
  core.add(
    new THREE.Mesh(
      geo(ringX(0.001, CORE_R, -SOL.tube / 2 - 0.25, SOL.tube / 2 + 0.25, 48)),
      coreMat,
    ),
  );
  capPair(core, -SOL.tube / 2 - 0.25, SOL.tube / 2 + 0.25, 0, CORE_R, ironCapMat);
  core.visible = false;
  coil.add(core);

  // winding (rebuilt per tier) + the cut-turn discs + the tails down to the stand sockets
  const windParts = new THREE.Group();
  coil.add(windParts);
  let windingPts: THREE.Vector3[] = []; // world, right end → left end
  let tailR: THREE.Vector3[] = [];
  let tailL: THREE.Vector3[] = [];
  const buildWinding = (): void => {
    for (const c of windParts.children.slice()) {
      windParts.remove(c);
      if (c instanceof THREE.Mesh) dropGeo(c.geometry);
    }
    const turns = SOLENOID_TURNS[stage.tier];
    const per = Math.max(14, Math.round(26 * stage.settings.tessellation));
    const n = turns * per;
    const xa = SOL.len / 2;
    const local: THREE.Vector3[] = [];
    // from the right end (current enters from the rheostat) to the left end, starting at the bottom
    const a0 = Math.PI;
    const xAt = (a: number): number => xa - (SOL.len * (a - a0)) / (2 * Math.PI * turns);
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / per) * 2 * Math.PI;
      local.push(v(xAt(a), SOL.r * Math.cos(a), SOL.r * Math.sin(a)));
    }
    const wind = new THREE.Mesh(
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(local, false, 'centripetal'),
          Math.min(1600, n * 2),
          WIRE_R,
          stage.tier === 'base' ? 5 : 8,
        ),
      ),
      wireMat,
    );
    windParts.add(wind);
    // section discs where each turn crosses the cut planes (a = 0 → plane z = 0, a = π/2 → y = 0)
    const disc = geo(new THREE.CircleGeometry(WIRE_R * 1.05, 12));
    const discY = geo(new THREE.CircleGeometry(WIRE_R * 1.05, 12).rotateX(-Math.PI / 2));
    const dz = new THREE.InstancedMesh(disc, turnCapMat, turns);
    const dy = new THREE.InstancedMesh(discY, turnCapMat, turns);
    const m4 = new THREE.Matrix4();
    for (let t = 0; t < turns; t++) {
      const az = a0 + Math.PI + 2 * Math.PI * t; // cos = 1 → y = r
      const ay = a0 - Math.PI / 2 + 2 * Math.PI * (t + 1); // sin = 1 → z = r
      dz.setMatrixAt(t, m4.makeTranslation(xAt(az), SOL.r, 0));
      dy.setMatrixAt(t, m4.makeTranslation(xAt(ay), 0, SOL.r));
    }
    windParts.add(dz, dy);
    // tails: bottom of each end turn down to the 4 mm socket on its stand
    const toLocal = (p: THREE.Vector3): THREE.Vector3 => p.clone().sub(coil.position);
    const sR = toLocal(app.solRight);
    const sL = toLocal(app.solLeft);
    const pR = local[0] as THREE.Vector3;
    const pL = local[local.length - 1] as THREE.Vector3;
    const tail = (p: THREE.Vector3, s: THREE.Vector3): THREE.Vector3[] => [
      p.clone(),
      v(p.x, p.y - 0.15, 0.12),
      v((p.x + s.x) / 2, (p.y + s.y) / 2, s.z * 0.7),
      v(s.x, s.y + 0.2, s.z),
      s.clone(),
    ];
    const tR = tail(pR, sR);
    const tL = tail(pL, sL);
    for (const tp of [tR, tL]) {
      const m = new THREE.Mesh(
        geo(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tp, false, 'centripetal'), 32, 0.02, 6),
        ),
        wireMat,
      );
      windParts.add(m);
    }
    const w = (p: THREE.Vector3): THREE.Vector3 => p.clone().add(coil.position);
    windingPts = local.map(w);
    tailR = tR.map(w);
    tailL = tL.map(w);
    stage.castShadows(windParts);
    dz.castShadow = dy.castShadow = false;
  };
  buildWinding();

  // --- stored-energy glow filling the bore ----------------------------------------------------
  const energyMat = mat(
    new THREE.ShaderMaterial({
      vertexShader: ENERGY_VS,
      fragmentShader: ENERGY_FS,
      transparent: true,
      depthWrite: false,
      blending: stage.theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(quantityColorHex('energy', stage.theme)) },
        uAmount: { value: 0 },
      },
    }),
  );
  const energyGlow = new THREE.Mesh(
    geo(
      new THREE.CylinderGeometry(TUBE_IN - 0.02, TUBE_IN - 0.02, SOL.len, 48, 1, true).rotateZ(
        Math.PI / 2,
      ),
    ),
    energyMat,
  );
  energyGlow.renderOrder = 4;
  coil.add(energyGlow);

  // --- self-induced emf arrow (amber) above the coil ------------------------------------------
  const emfArrow = new THREE.Group();
  const emfShaft = mesh(
    geo(new THREE.CylinderGeometry(0.05, 0.05, 1, 12).rotateZ(-Math.PI / 2).translate(0.5, 0, 0)),
    'glowEmf',
    'arrow',
  );
  const emfHead = mesh(
    geo(new THREE.ConeGeometry(0.14, 0.32, 16).rotateZ(-Math.PI / 2)),
    'glowEmf',
    'arrow',
  );
  emfArrow.add(emfShaft, emfHead);
  emfArrow.position.set(SOL.x - 1.4, SOL.y + FLANGE_R + 0.32, SOL.z - 0.1);
  scene.add(emfArrow);

  // --- leads: red / black 4 mm cables lying on the bench -----------------------------------------
  const lead = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    via: Array<[number, number]>,
  ): THREE.Vector3[] => [
    a.clone(),
    v(a.x, a.y + 0.2, a.z + 0.04),
    ...via.map(([x, z]) => v(x, BENCH_TOP + 0.035, z)),
    v(b.x, b.y + 0.2, b.z + 0.04),
    b.clone(),
  ];
  const cA = lead(app.batPlus, app.swHingePost, [
    [app.batPlus.x + 0.35, app.batPlus.z + 0.55],
    [SW.hinge - 0.6, SW.z + 0.55],
  ]);
  const cB = lead(app.swJawPost, app.resLeftPost, [
    [SW.jaw + 0.7, SW.z + 0.45],
    [RES.x - RES.len / 2 - 0.55, RES.z + 0.55],
  ]);
  const cC = lead(app.resRightPost, app.solRight, [
    [RES.x + RES.len / 2 + 0.5, RES.z - 0.2],
    [app.solRight.x + 0.45, app.solRight.z + 0.45],
  ]);
  const cD = lead(app.solLeft, app.batMinus, [
    [app.solLeft.x - 0.3, app.solLeft.z + 0.35],
    [app.batMinus.x + 0.55, app.batMinus.z - 0.45],
  ]);
  const cables: Array<[THREE.Vector3[], string]> = [
    [cA, 'socketRed'],
    [cB, 'socketRed'],
    [cC, 'socketRed'],
    [cD, 'socketBlack'],
  ];
  const curvePts = (pts: THREE.Vector3[], n: number): THREE.Vector3[] =>
    new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(n);
  for (const [pts, key] of cables) {
    const m = mesh(
      geo(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 80, 0.03, 10),
      ),
      'plastic',
      key,
    );
    scene.add(m);
  }
  // nickel straps: rheostat posts → wire ends
  const h0 = app.resHelix[0] as THREE.Vector3;
  const h1 = app.resHelix[app.resHelix.length - 1] as THREE.Vector3;
  const strapL = [
    app.resLeftPost.clone(),
    v(app.resLeftPost.x + 0.05, RES.y - 0.15, RES.z + 0.1),
    h0.clone(),
  ];
  const strapR = [
    h1.clone(),
    v(app.resRightPost.x - 0.05, RES.y - 0.15, RES.z + 0.1),
    app.resRightPost.clone(),
  ];
  for (const pts of [strapL, strapR])
    scene.add(
      mesh(
        geo(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
            16,
            0.014,
            6,
          ),
        ),
        'steel',
        'nickel',
      ),
    );

  stage.castShadows(app.root);
  stage.castShadows(coil);
  for (const m of [energyGlow, tube]) m.castShadow = false;
  stage.occluders.push(...app.occluders);

  // --- current particles: − → cells → + → switch → rheostat → coil → − --------------------------
  const flow: CurrentFlow = createCurrentFlow(stage, {
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: 700,
    radius: 0.04,
    speedPerAmp: PARTICLE_SPEED_PER_AMP,
    vMax: PARTICLE_VMAX,
    smooth: false,
  });
  let pathCells = -1;
  const setFlowPath = (n: number): void => {
    pathCells = n;
    const top = BAT.y0 + BAT.h + 0.09;
    const inside = [
      app.batMinus.clone(),
      ...app.cellPos.slice(0, n).map((p) => v(p.x, top, p.z)),
      app.batPlus.clone(),
    ];
    flow.setPath(
      [
        ...inside,
        ...curvePts(cA, 40).slice(1),
        v(SW.hinge, SW.y + 0.06, SW.z),
        v(SW.jaw, SW.y + 0.06, SW.z),
        ...curvePts(cB, 40),
        ...strapL.slice(1),
        ...app.resHelix.slice(1),
        ...strapR.slice(1),
        ...curvePts(cC, 40).slice(1),
        ...tailR.slice().reverse().slice(1),
        ...windingPts.slice(1),
        ...tailL.slice(1),
        ...curvePts(cD, 40).slice(1),
      ],
      true,
    );
  };
  setFlowPath(8);

  // --- field lines (computed once per tier; shown ∝ i) -------------------------------------------
  const field: FieldLines = createFieldLines(stage, { linewidth: 2.0, spacing: 0.7, speed: 1.0 });
  const traceJob = (): TraceJob => {
    const spec: FieldSpec = {
      kind: 'solenoid',
      R: SOL.r,
      L: SOL.len,
      N: 1,
      I: 1,
      at: [SOL.x, SOL.y, SOL.z],
      axis: 'x',
      loops: 18,
    };
    const n = Math.max(10, Math.round(30 * stage.settings.lineDensity));
    const c: [number, number, number] = [SOL.x, SOL.y, SOL.z];
    const candidates = seedDisc(c, [0, 1, 0], [0, 0, 1], SOL.r * 0.86, 240);
    const flux = seedByFlux(fieldFromSpec(spec), candidates, [1, 0, 0], n);
    const order = spreadOrder(flux.length);
    return {
      field: spec,
      seeds: order.map((k) => flux[k] as [number, number, number]),
      options: {
        bounds: {
          min: [SOL.x - SOL.len / 2 - 2.4, BENCH_TOP + 0.03, SOL.z - 2.2],
          max: [SOL.x + SOL.len / 2 + 2.4, SOL.y + 2.2, SOL.z + 2.0],
        },
        direction: 0,
        maxAngle: 0.06,
        maxPoints: 700,
      },
    };
  };
  void field.setJob(traceJob());

  // --- energy ribbons -------------------------------------------------------------------------------
  const ribbonOpts = { widthPerWatt: 0.16, minRadius: 0.008, maxRadius: 0.15, pRef: 1, speed: 0.9 };
  const J = v(-2.3, 2.35, 0.2);
  const ribGen: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v(BAT.x + 0.4, 0.95, BAT.z - 0.1),
      v(BAT.x + 0.8, 1.9, BAT.z - 0.3),
      v(-2.8, 2.35, 0.35),
      J,
    ],
  });
  const ribJoule: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    dim: 0.55, // energy that leaves as heat
    path: [J, v(-0.9, 2.55, 1.0), v(1.6, 1.9, 1.5), v(RES.x - 0.2, RES.y + RES.r + 0.08, RES.z)],
  });
  const ribField: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [J, v(-1.9, 2.4, -0.3), v(-1.5, SOL.y + 0.2, SOL.z), v(SOL.x - 1.2, SOL.y, SOL.z)],
  });

  // --- labels: fixed callout spots off the coil, leader lines to the parts ---------------------------
  const labels = createLabelLayer(stage, overlay, { occlude: false });
  type Key = keyof RlSceneTexts;
  const parts: Record<Key, THREE.Vector3> = {
    battery: v(BAT.x - 0.9, BAT.y0 + BAT.h + 0.05, BAT.z - 0.2),
    switch: v(SW.x - 0.2, 0.12, SW.z + 0.3),
    current: (curvePts(cB, 10)[5] as THREE.Vector3).clone(),
    resistor: v(RES.x + 0.4, RES.y - RES.r, RES.z + 0.2),
    solenoid: v(SOL.x + SOL.len / 2 - 0.2, SOL.y - SOL.r * 0.7, SOL.z + SOL.r * 0.7),
    emf: v(SOL.x - 0.2, SOL.y + FLANGE_R + 0.35, SOL.z - 0.1),
    energy: v(SOL.x - 1.6, SOL.y + 0.15, SOL.z + 0.15),
  };
  const ends: Record<Key, THREE.Vector3> = {
    battery: v(BAT.x - 1.2, 1.85, BAT.z - 0.3),
    switch: v(SW.x - 0.6, BENCH_TOP + 0.04, SW.z + 1.25),
    current: v(SW.x + 1.4, BENCH_TOP + 0.04, SW.z + 1.35),
    resistor: v(RES.x + 1.2, BENCH_TOP + 0.04, RES.z + 1.7),
    solenoid: v(SOL.x + SOL.len / 2 + 1.7, SOL.y + 0.2, SOL.z + 0.2),
    emf: v(SOL.x + 0.6, SOL.y + 2.35, SOL.z - 0.1),
    energy: v(SOL.x - 3.9, SOL.y + 2.0, SOL.z - 0.3),
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
    current: tag('current', { text: 'i', quantity: 'i', priority: 9, sensorWidth: '26ch' }),
    emf: tag('emf', { text: 'f.e.m.', quantity: 'emf', priority: 8, sensorWidth: '30ch' }),
    battery: tag('battery', { text: 'E', quantity: 'emf', priority: 7, sensorWidth: '30ch' }),
    energy: tag('energy', { text: 'U', quantity: 'energy', priority: 7, sensorWidth: '18ch' }),
    resistor: tag('resistor', { text: 'R', priority: 6, sensorWidth: '30ch' }),
    solenoid: tag('solenoid', { text: 'L', quantity: 'b', priority: 6, sensorWidth: '18ch' }),
    switch: tag('switch', { text: 'interruttore', priority: 5, size: 'sm' }),
  };
  const shown: Record<Key, boolean> = {
    battery: true,
    switch: true,
    current: true,
    resistor: true,
    solenoid: true,
    emf: true,
    energy: true,
  };
  const updateLeaders = (): void => {
    KEYS.forEach((k, i) => {
      const a = parts[k];
      const b = shown[k] ? ends[k] : a;
      leaderPos.set([a.x, a.y, a.z, b.x, b.y, b.z], 6 * i);
    });
    (leaderGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  // --- tier / theme -------------------------------------------------------------------------------------
  const offTier = stage.onTierChange(() => {
    buildWinding();
    setFlowPath(pathCells);
    void field.setJob(traceJob());
  });
  const offTheme = stage.onThemeChange((t) => {
    (energyMat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(
      quantityColorHex('energy', t),
    );
    energyMat.blending = t === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    energyMat.needsUpdate = true;
  });
  // knife-switch blade: eased towards its target angle (instant with reduced motion)
  const reduced = ctx.reducedMotion;
  const offAnim = stage.addUpdatable({
    update(dt) {
      if (bladeAngle === bladeTarget || dt <= 0) return;
      const step = dt * 5.5;
      const d = bladeTarget - bladeAngle;
      bladeAngle = Math.abs(d) <= step ? bladeTarget : bladeAngle + Math.sign(d) * step;
      blade.rotation.z = bladeAngle;
    },
  });
  blade.rotation.z = bladeAngle;

  // --- per-frame ---------------------------------------------------------------------------------------
  const rgb: [number, number, number] = [0, 0, 0];
  let frames = 0;
  let cellsShown = 8;
  const update = (s: RlSceneView): void => {
    applyTints(stage);
    bladeTarget = s.closed ? 0 : OPEN_ANGLE;
    if (reduced || s.snap) {
      bladeAngle = bladeTarget;
      blade.rotation.z = bladeAngle;
    }
    const n = cellCount(s.E);
    if (n !== cellsShown) {
      app.cells.count = app.caps.count = n;
      app.straps.count = n - 1;
      cellsShown = n;
    }
    if (n !== pathCells) setFlowPath(n);
    flow.setCurrent(s.i);
    const f = lineFraction(s.i, s.Iref);
    field.setFraction(f);
    field.setFlow(1.3 * f);
    (energyMat.uniforms['uAmount'] as { value: number }).value =
      s.Uref > 0 ? Math.min(1, s.U / s.Uref) : 0;
    // emf arrow: against the current (current runs right → left in the winding)
    const e = s.E > 0 ? Math.min(1, Math.abs(s.emfSelf) / s.E) : 0;
    emfArrow.visible = e > 0.004;
    const len = 2.6 * e;
    emfShaft.scale.set(Math.max(0.001, len), 1, 1);
    emfHead.position.set(len + 0.14, 0, 0);
    kit.get('glowEmf', 'arrow').emissiveIntensity = 0.5 + 0.4 * e;
    // ribbons: radius ∝ P / P_ref; the branches add up to the trunk
    const pr = s.pRef > 0 ? s.pRef : 1;
    ribGen.setPower(s.pGen / pr);
    ribJoule.setPower(s.pJoule / pr);
    ribField.setPower(s.pField / pr);
    // resistor wire: black-body glow (> 700 K) or false colour
    app.resWire.visible = !s.thermal;
    app.resThermal.visible = s.thermal;
    applyHeatGlow(kit.get('steel', 'resWire'), s.T);
    if (s.thermal) {
      ironbow((s.T - 273.15 - RES_T_SCALE_C[0]) / (RES_T_SCALE_C[1] - RES_T_SCALE_C[0]), rgb);
      const m = kit.get('plastic', 'resThermal');
      m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissive.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissiveIntensity = 0.6;
    }
    core.visible = s.core;
    // the emf sensor stays reserved while idle: keep its leader, anchored at the arrow tail
    parts.emf.set(SOL.x - 1.4 + len / 2, emfArrow.position.y + 0.1, emfArrow.position.z);
    updateLeaders();
    const t = s.texts;
    L.battery.setText(t.battery);
    L.switch.setText(t.switch);
    L.current.setText(t.current);
    L.resistor.setText(t.resistor);
    L.solenoid.setText(t.solenoid);
    L.emf.setText(t.emf);
    L.emf.setVisible(emfArrow.visible);
    L.energy.setText(t.energy);
  };

  const prewarm = (): void => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    stage.renderer.compile(scene, stage.camera);
    const seen = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
        for (const val of Object.values(mm)) {
          if (val instanceof THREE.Texture && !seen.has(val)) {
            seen.add(val);
            stage.renderer.initTexture(val);
          }
        }
      }
    });
    for (const o of hidden) o.visible = false;
  };

  sceneStats.liveScenes++;
  let disposed = false;
  return {
    stage,
    update,
    prewarm,
    render: () => {
      frames++;
      stage.render();
    },
    info: () => ({
      ...stage.info(),
      labels: labels.stats(),
      fieldLines: field.count,
      linesShown: field.shown,
      trace: field.lastTrace,
      blade: bladeAngle,
      cells: cellsShown,
      frames,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      offTier();
      offTheme();
      offAnim();
      labels.dispose();
      field.dispose();
      flow.dispose();
      ribGen.dispose();
      ribJoule.dispose();
      ribField.dispose();
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
