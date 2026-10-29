/**
 * Three.js scene of `rl-energy`, built on the render foundation (D14): a lab
 * bench with a battery of cells, a knife switch with an animated blade, a
 * wire-wound resistor and a large solenoid, wired in series.
 *
 * What is physics and what is illustration (scales in ./visual.ts, stated in the
 * legend and the model note):
 *  - cells drawn ∝ E (1,5 V each);
 *  - current particles: velocity ∝ i(t) from the RK4 model (still while open);
 *  - B field: lines COMPUTED for a finite solenoid (`solenoidField`, sum of
 *    coaxial loops), seeded by flux on the mid-plane; the number drawn ∝ i/I_ref
 *    and the flow ∝ i — the field visibly builds up with the time constant τ;
 *  - stored energy ½·L·i²: purple glow inside the winding ∝ U/U_ref (∝ i², it
 *    lags the lines);
 *  - self-induced emf −L·di/dt: amber arrow along the solenoid against the
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
  chamferBox,
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

// --- layout -------------------------------------------------------------------------------------
const BENCH_TOP = 0;
const BAT = { x: -3.85, z: 0.95 };
const SW = { x: -1.55, z: 1.25, hinge: -1.95, jaw: -1.15, y: 0.2 };
const RES = { x: 1.15, z: 1.35, y: 0.55, len: 1.7, r: 0.17 };
const SOL = { x: 0.65, y: 1.4, z: -1.0, len: 3.3, r: 0.74 };
const OPEN_ANGLE = (62 * Math.PI) / 180;
const HOME = {
  position: [1.5, 4.7, 9.9] as [number, number, number],
  target: [-0.2, 1.2, -0.2] as [number, number, number],
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
  float a = uAmount * (0.16 + 0.6 * pow(rim, 1.6));
  gl_FragColor = vec4(uColor * (0.5 + 0.9 * uAmount), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createRlScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): RlScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D del circuito RL sul banco: batteria di pile, interruttore a coltello, resistore a filo avvolto e un grande solenoide con le linee del campo B calcolate, che si infittiscono mentre la corrente cresce.',
    camera: { ...HOME, fov: 36 },
    controls: { minDistance: 4, maxDistance: 22, maxPolarAngle: (84 * Math.PI) / 180 },
    floorY: BENCH_TOP - 0.26,
    shadowRadius: 6.5,
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
  const mesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const tess = (n: number): number => Math.max(6, Math.round(n * stage.settings.tessellation));
  const tube = (pts: THREE.Vector3[], r: number, segs = 48): THREE.TubeGeometry =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), segs, r, 8);

  const rig = new THREE.Group();
  scene.add(rig);

  // --- bench ---------------------------------------------------------------------------------
  const bench = mesh(geo(chamferBox(10.6, 0.26, 4.9, 0.05)), 'plastic', 'bench');
  bench.position.set(-0.6, BENCH_TOP - 0.13, 0.1);
  rig.add(bench);

  // --- battery: holder + cells (∝ E) + terminals ---------------------------------------------------
  const holder = mesh(geo(chamferBox(2.3, 0.12, 0.78, 0.03)), 'darkSteel', 'holder');
  holder.position.set(BAT.x, 0.06, BAT.z);
  rig.add(holder);
  const cellGeo = geo(new THREE.CylinderGeometry(0.105, 0.105, 0.52, tess(24)));
  const capGeo = geo(new THREE.CylinderGeometry(0.045, 0.045, 0.06, tess(12)));
  const cells = new THREE.InstancedMesh(cellGeo, undefined, MAX_CELLS);
  kit.assign(cells, 'glowEnergy', 'cell');
  const caps = new THREE.InstancedMesh(capGeo, undefined, MAX_CELLS);
  kit.assign(caps, 'brass', 'cap');
  {
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < MAX_CELLS; k++) {
      const x = BAT.x - 0.875 + (k % 8) * 0.25;
      const z = BAT.z + (k < 8 ? 0.15 : -0.15);
      cells.setMatrixAt(k, m4.makeTranslation(x, 0.38, z));
      caps.setMatrixAt(k, m4.makeTranslation(x, 0.67, z));
    }
  }
  cells.count = caps.count = 8;
  rig.add(cells, caps);
  const postGeo = geo(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 16));
  const batPlus = v(BAT.x + 1.25, 0.42, BAT.z);
  const batMinus = v(BAT.x - 1.25, 0.42, BAT.z);
  for (const p of [batPlus, batMinus]) {
    const post = mesh(postGeo, 'brass', 'post');
    post.position.set(p.x, 0.2, p.z);
    rig.add(post);
  }
  const signGeo = geo(chamferBox(0.16, 0.03, 0.16, 0.01));
  const plusSign = mesh(signGeo, 'glowI', 'plus');
  plusSign.position.set(batPlus.x, 0.43, batPlus.z);
  rig.add(plusSign);

  // --- knife switch -----------------------------------------------------------------------------
  const swBase = mesh(geo(chamferBox(1.2, 0.08, 0.55, 0.02)), 'magnet', 'switch');
  swBase.position.set(SW.x, 0.04, SW.z);
  rig.add(swBase);
  const clipGeo = geo(chamferBox(0.08, 0.26, 0.2, 0.01));
  for (const x of [SW.hinge, SW.jaw]) {
    for (const dz of [-0.06, 0.06]) {
      const c = mesh(clipGeo, 'copper', 'clip');
      c.position.set(x, 0.2, SW.z + dz);
      rig.add(c);
    }
  }
  const blade = new THREE.Group();
  blade.position.set(SW.hinge, 0.24, SW.z);
  const bladeBar = mesh(
    geo(chamferBox(0.86, 0.035, 0.07, 0.01).translate(0.43, 0, 0)),
    'copper',
    'blade',
  );
  const handle = mesh(
    geo(new THREE.CylinderGeometry(0.06, 0.07, 0.32, 16).translate(0, 0.16, 0)),
    'plastic',
    'handle',
  );
  handle.position.set(0.9, 0, 0);
  blade.add(bladeBar, handle);
  rig.add(blade);
  let bladeAngle = OPEN_ANGLE;
  let bladeTarget = OPEN_ANGLE;

  // --- resistor: ceramic tube on brackets, helical resistance wire -----------------------------------
  // matte vitreous-enamel tube (a glossy white kit ceramic would bloom under the key light)
  const resTube = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(RES.r, RES.r, RES.len, tess(28)).rotateZ(Math.PI / 2)),
    mat(new THREE.MeshStandardMaterial({ color: 0x8f846f, roughness: 0.78, metalness: 0 })),
  );
  resTube.position.set(RES.x, RES.y, RES.z);
  rig.add(resTube);
  const bracketGeo = geo(chamferBox(0.08, RES.y + 0.08, 0.36, 0.02));
  for (const s of [-1, 1]) {
    const b = mesh(bracketGeo, 'darkSteel', 'bracket');
    b.position.set(RES.x + s * (RES.len / 2 + 0.06), (RES.y + 0.08) / 2, RES.z);
    rig.add(b);
  }
  const resHelix: THREE.Vector3[] = [];
  {
    const turns = 15;
    const per = 18;
    const n = turns * per;
    for (let k = 0; k <= n; k++) {
      const a = (k / per) * 2 * Math.PI;
      const x = RES.x - RES.len / 2 + 0.12 + ((RES.len - 0.24) * k) / n;
      resHelix.push(
        v(x, RES.y + (RES.r + 0.02) * Math.cos(a), RES.z + (RES.r + 0.02) * Math.sin(a)),
      );
    }
  }
  const resWireGeo = geo(tube(resHelix, 0.022, resHelix.length * 2));
  const resWire = mesh(resWireGeo, 'steel', 'resWire');
  const resThermal = mesh(resWireGeo, 'plastic', 'resThermal');
  resThermal.visible = false;
  rig.add(resWire, resThermal);

  // --- solenoid: former, end flanges, saddles, optional iron core, winding ----------------------
  const sol = new THREE.Group();
  sol.position.set(SOL.x, SOL.y, SOL.z);
  rig.add(sol);
  const former = mesh(
    geo(
      new THREE.CylinderGeometry(SOL.r - 0.05, SOL.r - 0.05, SOL.len, tess(40), 1, true).rotateZ(
        Math.PI / 2,
      ),
    ),
    'glass',
    'former',
  );
  sol.add(former);
  const flangeGeo = geo(
    new THREE.TorusGeometry(SOL.r + 0.02, 0.07, 10, tess(40)).rotateY(Math.PI / 2),
  );
  for (const s of [-1, 1]) {
    const f = mesh(flangeGeo, 'plastic', 'flange');
    f.position.x = s * (SOL.len / 2 + 0.04);
    sol.add(f);
  }
  const saddleGeo = geo(chamferBox(0.3, SOL.y - SOL.r + 0.08, 1.0, 0.03));
  for (const s of [-1, 1]) {
    const sd = mesh(saddleGeo, 'darkSteel', 'saddle');
    sd.position.set(SOL.x + s * (SOL.len / 2 - 0.35), (SOL.y - SOL.r + 0.08) / 2, SOL.z);
    rig.add(sd);
  }
  const coreRod = mesh(
    geo(new THREE.CylinderGeometry(0.42, 0.42, SOL.len + 0.5, tess(32)).rotateZ(Math.PI / 2)),
    'iron',
    'core',
  );
  coreRod.visible = false;
  sol.add(coreRod);
  // winding (world points; rebuilt per tier)
  let winding: THREE.Mesh | null = null;
  let windingPts: THREE.Vector3[] = [];
  const buildWinding = (): void => {
    if (winding) {
      sol.remove(winding);
      dropGeo(winding.geometry);
    }
    const turns = SOLENOID_TURNS[stage.tier];
    const per = Math.max(12, Math.round(22 * stage.settings.tessellation));
    const n = turns * per;
    const local: THREE.Vector3[] = [];
    // from the right end (current enters from the resistor) to the left end
    for (let k = 0; k <= n; k++) {
      const a = (k / per) * 2 * Math.PI;
      const x = SOL.len / 2 - 0.1 - ((SOL.len - 0.2) * k) / n;
      local.push(v(x, SOL.r * Math.cos(a), SOL.r * Math.sin(a)));
    }
    winding = mesh(geo(tube(local, 0.042, Math.min(1400, n * 2))), 'enamel', 'winding');
    winding.castShadow = stage.tier !== 'base';
    sol.add(winding);
    windingPts = local.map((p) => p.clone().add(sol.position));
  };
  buildWinding();
  stage.occluders.push(resTube, holder);

  // --- stored-energy glow inside the winding ---------------------------------------------------------
  const energyMat = mat(
    new THREE.ShaderMaterial({
      vertexShader: ENERGY_VS,
      fragmentShader: ENERGY_FS,
      transparent: true,
      depthWrite: false,
      // additive glows on the dark studio; on the light backdrop it would vanish → normal blending
      blending: stage.theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(quantityColorHex('energy', stage.theme)) },
        uAmount: { value: 0 },
      },
    }),
  );
  const energyGlow = new THREE.Mesh(
    geo(
      new THREE.CylinderGeometry(
        SOL.r + 0.16,
        SOL.r + 0.16,
        SOL.len + 0.02,
        tess(40),
        1,
        true,
      ).rotateZ(Math.PI / 2),
    ),
    energyMat,
  );
  energyGlow.renderOrder = 4;
  sol.add(energyGlow);

  // --- self-induced emf arrow (amber) above the solenoid ---------------------------------------------
  const emfArrow = new THREE.Group();
  const shaftGeo = geo(
    new THREE.CylinderGeometry(0.05, 0.05, 1, 12).rotateZ(-Math.PI / 2).translate(0.5, 0, 0),
  );
  const headGeo = geo(new THREE.ConeGeometry(0.14, 0.32, 16).rotateZ(-Math.PI / 2));
  const emfShaft = mesh(shaftGeo, 'glowEmf', 'arrow');
  const emfHead = mesh(headGeo, 'glowEmf', 'arrow');
  emfArrow.add(emfShaft, emfHead);
  emfArrow.position.set(SOL.x - 1.4, SOL.y + SOL.r + 0.45, SOL.z + 0.2);
  rig.add(emfArrow);

  // --- wires ------------------------------------------------------------------------------------------
  const wireA = [
    batPlus.clone().setY(0.42),
    v(BAT.x + 1.5, 0.5, BAT.z + 0.1),
    v(SW.hinge - 0.15, 0.32, SW.z),
    v(SW.hinge, 0.24, SW.z),
  ];
  const wireB = [
    v(SW.jaw, 0.24, SW.z),
    v(SW.jaw + 0.25, 0.3, SW.z),
    v(RES.x - RES.len / 2 - 0.3, RES.y + 0.05, RES.z),
    resHelix[0] as THREE.Vector3,
  ];
  const wireC = () => [
    resHelix[resHelix.length - 1] as THREE.Vector3,
    v(RES.x + RES.len / 2 + 0.35, RES.y + 0.1, RES.z - 0.1),
    v(SOL.x + SOL.len / 2 + 0.4, 1.3, SOL.z + 0.9),
    windingPts[0] as THREE.Vector3,
  ];
  const wireD = () => [
    windingPts[windingPts.length - 1] as THREE.Vector3,
    v(SOL.x - SOL.len / 2 - 0.45, 1.1, SOL.z + 0.6),
    v(BAT.x - 0.4, 0.45, BAT.z - 0.95),
    v(BAT.x - 1.55, 0.45, BAT.z - 0.2),
    batMinus.clone(),
  ];
  let wireMeshes: THREE.Mesh[] = [];
  const buildWires = (): void => {
    for (const w of wireMeshes) {
      rig.remove(w);
      dropGeo(w.geometry);
    }
    wireMeshes = [wireA, wireB, wireC(), wireD()].map((pts) => {
      const w = mesh(geo(tube(pts, 0.035)), 'copper', 'wire');
      rig.add(w);
      return w;
    });
  };
  buildWires();

  // --- current particles ------------------------------------------------------------------------------
  const flow: CurrentFlow = createCurrentFlow(stage, {
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: 700,
    radius: 0.045,
    speedPerAmp: PARTICLE_SPEED_PER_AMP,
    vMax: PARTICLE_VMAX,
    smooth: false,
  });
  const bladeTip = v();
  const setFlowPath = (): void => {
    // battery − → + inside the cells, then the external circuit back to −
    const inside = [batMinus.clone().setY(0.62), batPlus.clone().setY(0.62)];
    flow.setPath(
      [
        ...inside,
        ...wireA,
        bladeTip.set(SW.jaw, 0.26, SW.z).clone(),
        ...wireB,
        ...resHelix.slice(1),
        ...wireC().slice(1),
        ...windingPts.slice(1),
        ...wireD().slice(1),
      ],
      true,
    );
  };
  setFlowPath();

  // --- field lines (computed once per tier; shown ∝ i) -------------------------------------------------
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
          min: [SOL.x - SOL.len / 2 - 3.6, BENCH_TOP + 0.03, SOL.z - 3.2],
          max: [SOL.x + SOL.len / 2 + 3.6, SOL.y + 2.5, SOL.z + 3.0],
        },
        direction: 0,
        maxAngle: 0.06,
        maxPoints: 700,
      },
    };
  };
  void field.setJob(traceJob());

  // --- energy ribbons -------------------------------------------------------------------------------------
  const ribbonOpts = { widthPerWatt: 0.16, minRadius: 0.008, maxRadius: 0.16, pRef: 1, speed: 0.9 };
  const J = v(-2.05, 2.25, 0.35);
  const ribGen: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [v(BAT.x + 0.3, 0.85, BAT.z), v(BAT.x + 0.6, 1.8, BAT.z - 0.2), v(-2.5, 2.3, 0.5), J],
  });
  const ribJoule: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    dim: 0.55, // energy that leaves as heat
    path: [J, v(-1.0, 2.2, 1.0), v(0.5, 1.6, 1.4), v(RES.x - 0.2, RES.y + 0.38, RES.z)],
  });
  const ribField: EnergyRibbon = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [J, v(-1.5, 2.75, -0.2), v(-0.6, 2.6, -0.8), v(SOL.x - 0.6, SOL.y + 0.25, SOL.z + 0.1)],
  });

  // --- labels -----------------------------------------------------------------------------------------------
  const labels = createLabelLayer(stage, overlay, { occlude: false });
  const A = {
    battery: v(BAT.x, 0.9, BAT.z + 0.45),
    switch: v(SW.x, 0.75, SW.z + 0.3),
    current: v(SW.x + 1.0, 0.25, SW.z + 0.45),
    resistor: v(RES.x + 0.2, RES.y - 0.35, RES.z + 0.4),
    solenoid: v(SOL.x + SOL.len / 2 + 0.3, SOL.y - 0.45, SOL.z + 0.85),
    emf: v(SOL.x, SOL.y + SOL.r + 0.95, SOL.z + 0.2),
    energy: v(SOL.x - 0.5, SOL.y - 0.1, SOL.z + SOL.r + 0.2),
  };
  const L: Record<keyof RlSceneTexts, Label> = {
    battery: labels.add({ text: 'E', anchor: A.battery, quantity: 'emf', priority: 7 }),
    switch: labels.add({ text: 'interruttore', anchor: A.switch, priority: 5, size: 'sm' }),
    current: labels.add({ text: 'i', anchor: A.current, quantity: 'i', priority: 9 }),
    resistor: labels.add({ text: 'R', anchor: A.resistor, priority: 6, offset: [30, 26] }),
    solenoid: labels.add({ text: 'L', anchor: A.solenoid, quantity: 'b', priority: 6 }),
    emf: labels.add({ text: 'f.e.m.', anchor: A.emf, quantity: 'emf', priority: 8 }),
    energy: labels.add({ text: 'U', anchor: A.energy, quantity: 'energy', priority: 7 }),
  };

  stage.castShadows(rig);
  bench.castShadow = false;
  for (const m of [energyGlow, former]) m.castShadow = false;

  // --- tier / theme -------------------------------------------------------------------------------------
  const offTier = stage.onTierChange(() => {
    buildWinding();
    buildWires();
    setFlowPath();
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
    bladeTarget = s.closed ? 0 : OPEN_ANGLE;
    if (reduced || s.snap) {
      bladeAngle = bladeTarget;
      blade.rotation.z = bladeAngle;
    }
    const n = cellCount(s.E);
    if (n !== cellsShown) {
      cells.count = caps.count = n;
      cellsShown = n;
    }
    kit.get('glowEnergy', 'cell').emissiveIntensity = 0.12;
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
    kit.get('glowEmf', 'arrow').emissiveIntensity = 0.6 + 1.6 * e;
    // ribbons: radius ∝ P / P_ref; the branches add up to the trunk
    const pr = s.pRef > 0 ? s.pRef : 1;
    ribGen.setPower(s.pGen / pr);
    ribJoule.setPower(s.pJoule / pr);
    ribField.setPower(s.pField / pr);
    // resistor wire: black-body glow (> 700 K) or false colour
    resWire.visible = !s.thermal;
    resThermal.visible = s.thermal;
    applyHeatGlow(kit.get('steel', 'resWire'), s.T);
    if (s.thermal) {
      ironbow((s.T - 273.15 - RES_T_SCALE_C[0]) / (RES_T_SCALE_C[1] - RES_T_SCALE_C[0]), rgb);
      const m = kit.get('plastic', 'resThermal');
      m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissive.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissiveIntensity = 0.6;
    }
    coreRod.visible = s.core;
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
