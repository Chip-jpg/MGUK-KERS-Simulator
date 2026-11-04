/**
 * Three.js scene of the `faraday` simulator (teardown look, `look: 'teardown'`): a school-lab
 * rotating-coil generator on a laminated U-core electromagnet (`./rig`, reference and real
 * dimensions there). The N-turn coil turns about a vertical shaft between the pole shoes; two
 * brass slip rings and carbon brushes on top carry the f.e.m. through red/black leads to a
 * small lamp on the bridge. The field coils on the limbs are opened (front half cut away)
 * to show copper turns around the laminated iron.
 *
 * What is physics and what is illustration:
 *  - field-line shape: two-sheet pole model `gapField` (uniform in the core, as
 *    the sim's model assumes; fringing only at the edges);
 *  - coil angle α, Φ, f.e.m.: from the model (`FaradaySim`), passed in `SceneState`;
 *  - current particles and lamp brightness: the model has no resistance, so they
 *    use an ILLUSTRATIVE resistive load — i ∝ f.e.m. (particle speed ∝ |f.e.m.|/V₀,
 *    direction = sign of the f.e.m.) and P ∝ f.e.m.² (lamp brightness = (f.e.m./V₀)²).
 *    No new quantity is claimed.
 * Coil side ∝ √S, drawn turns ∝ N up to a cap; gap, shoes and coil sizes are illustrative.
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  createCurrentFlow,
  createFieldLines,
  createLabelLayer,
  createStage,
  mergeStatic,
  renderStats,
  roundedRectPoints,
  seedRect,
  type CurrentFlow,
  type FieldLines,
  type Label,
  type MaterialKind,
  type Stage,
  type StageInfo,
  type TracedLine,
} from '../../render';
import { quantityColorHex } from '../../ui';
import { params, type FaradayMode, type FaradayParams } from './model';
import {
  buildRig,
  FACE_HY,
  FACE_HZ,
  FLOOR_Y,
  GAP_HALF,
  LAMP_POS,
  RING_Y,
  SHAFT_BOT,
  SHAFT_TOP,
  squareRing,
  type RigSink,
} from './rig';

/** Live resource counters across all mounts (read by the e2e leak check). */
export const sceneStats = {
  liveScenes: 0,
  liveRenderers: 0,
  liveGeometries: 0,
  liveMaterials: 0,
  createdScenes: 0,
  frames: 0,
};

export interface SceneLabels {
  b: string;
  phi: string;
  emf: string;
  alpha: string;
  load: string;
}

export interface SceneState {
  mode: FaradayMode;
  p: FaradayParams;
  /** Loop angle α between n̂ and B [rad]. */
  alpha: number;
  /** emf / peak (−1…1): drives the brush glow, current particles and lamp. */
  emfRatio: number;
  /** Pre-formatted label texts (Italian, formatIT). */
  labels?: SceneLabels;
}

export interface FaradayScene {
  readonly canvas: HTMLCanvasElement;
  readonly stage: Stage;
  render(state: SceneState): void;
  setTheme(theme: AppContext['theme']): void;
  /** `renderer.info.memory` of this scene. */
  memory(): { geometries: number; textures: number };
  info(): StageInfo & {
    fieldLines: number;
    trace: { ms: number; where: string };
    labels: ReturnType<ReturnType<typeof createLabelLayer>['stats']>;
  };
  dispose(): void;
}

// --- coil dimensions (scene units, 1 unit = 2,5 cm; illustrative) ------------------------
/** Coil side at S = S_max (7,5 cm): leaves 0,25 units to the pole faces when α = 90°. */
const LOOP_SIDE_MAX = 3.0;
const WIRE_R = 0.04;
const PROJ_X = GAP_HALF - 0.06;
/** Default framing: whole rig, slight 3/4 from the front right, looking into the gap. */
const FOV = 34;
const VIEW_TARGET: [number, number, number] = [0, -2.2, 0.4];
const VIEW_DIST = 25.5;
const VIEW_EL = (21 * Math.PI) / 180;
const VIEW_AZ = (20 * Math.PI) / 180;
const ROTATING_VIEW = {
  position: [
    VIEW_TARGET[0] + VIEW_DIST * Math.cos(VIEW_EL) * Math.sin(VIEW_AZ),
    VIEW_TARGET[1] + VIEW_DIST * Math.sin(VIEW_EL),
    VIEW_TARGET[2] + VIEW_DIST * Math.cos(VIEW_EL) * Math.cos(VIEW_AZ),
  ] as [number, number, number],
  target: VIEW_TARGET,
};
/** Drawn turns: ∝ N up to this cap per tier. */
const TURN_CAP = { alta: 24, bilanciata: 16, base: 8 } as const;
/** Teardown tints of the kit materials (re-applied every frame: tier switches replace them). */
const TINTS: Array<[MaterialKind, string, number, number]> = [
  ['plastic', 'bakelite', 0x3a2c24, 0.55],
  ['plastic', 'wood', 0x5e3f26, 0.62],
  ['plastic', 'socketRed', 0xa8261e, 0.4],
  ['plastic', 'socketBlack', 0x17181b, 0.45],
  ['plastic', 'former', 0x343a42, 0.5],
  ['steel', 'alu', 0xb9c0c8, 0.5],
  ['iron', 'core', 0x8c96a2, 0.5],
  ['iron', 'shoe', 0x9aa4b0, 0.46],
  ['brass', 'ring', 0xd2a84e, 0.38],
  ['enamel', '', 0xe48a50, 0.34],
];

/** Length of the n̂ shaft: tip stays 0,3 units clear of the pole faces at α = 0. */
const normalLen = (side: number): number => Math.min(GAP_HALF - 0.55, 0.5 + side * 0.25);

/** Smallest drawn coil side (S = S_min): keeps the working part readable. */
const LOOP_SIDE_MIN = 1.4;

/**
 * Visual side of the loop for an area S [m²]: grows with log S from LOOP_SIDE_MIN (S_min) to
 * LOOP_SIDE_MAX (S_max). Illustrative (monotonic, not to scale) so the default coil
 * (S = 0,02 m² → ≈ 2,4 units) fills most of the gap; the label always shows the real Φ.
 */
export function loopSide(S: number): number {
  const { min, max } = params.S;
  const s = Math.min(max, Math.max(min, Number.isFinite(S) ? S : min));
  const f = Math.log(s / min) / Math.log(max / min);
  return LOOP_SIDE_MIN + (LOOP_SIDE_MAX - LOOP_SIDE_MIN) * f;
}

/** Turns drawn for N real turns: min(N, cap). The label always shows the real N. */
export function visualTurns(N: number, cap: number = TURN_CAP.alta): number {
  return Math.max(1, Math.min(cap, Math.round(N)));
}

const FILL_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const FILL_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uScale;
varying vec2 vUv;
void main() {
  vec2 p = vUv * uScale;
  float hatch = smoothstep( 0.8, 1.0, sin( ( p.x + p.y ) * 18.0 - uTime * 2.5 ) );
  vec2 e = min( vUv, 1.0 - vUv ) * uScale;
  float edge = 1.0 - smoothstep( 0.0, 0.05, min( e.x, e.y ) );
  float a = uOpacity * ( 0.55 + 0.45 * hatch ) + edge * 0.6;
  gl_FragColor = vec4( uColor * ( 1.0 + 0.6 * hatch + edge ), clamp( a, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createFaradayScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): FaradayScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D: generatore da laboratorio con nucleo a U in ferro laminato, bobine di campo aperte in sezione, espansioni polari N e S, linee del campo B calcolate nel traferro, bobina di N spire che ruota su un albero verticale con anelli e spazzole collegati a una lampadina, e l’area proiettata attraversata dal flusso.',
    camera: { ...ROTATING_VIEW, fov: FOV },
    controls: { minDistance: 4, maxDistance: 36 },
    floorY: FLOOR_Y,
    shadowRadius: 7.5,
    look: 'teardown',
  });
  sceneStats.liveRenderers++;
  const { scene } = stage;
  const kit = stage.materials;

  // --- resource tracking (non-kit) ----------------------------------------------------
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
  const mesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    return m;
  };
  const sink: RigSink = {
    geo,
    mat,
    mesh,
    tex: (t) => {
      textures.push(t);
      return t;
    },
  };
  const tierName = (): keyof typeof TURN_CAP => stage.tier;

  // --- static apparatus ------------------------------------------------------------------
  const rig = buildRig(stage, sink);
  scene.add(rig.root);
  stage.occluders.push(...rig.occluders);
  // base tier: the rig never moves — bake it to one mesh per material (draw-call budget)
  if (stage.tier === 'base')
    mergeStatic(rig.root, {
      kit,
      track: geo,
      drop: dropGeo,
      keep: [rig.lamp.group, ...rig.brushes, ...rig.occluders],
    });

  // --- field lines: the model's uniform B between the pole faces -----------------------------
  // straight, evenly spaced N → S lines on a regular grid over the face (equal flux per line);
  // fringing outside the faces is left out on purpose: the sim assumes a uniform field.
  const field: FieldLines = createFieldLines(stage, {
    linewidth: 1.6,
    spacing: 1.2,
    speed: 1.1,
    base: 0.85,
    gain: 0.7,
  });
  const straightLines = (): TracedLine[] => {
    const seeds = seedRect([0, 0, 0], [0, 1, 0], [0, 0, 1], FACE_HY - 0.2, FACE_HZ - 0.2, 12);
    const M = 24;
    return seeds.map(([, y, z]) => {
      const points = new Float32Array(M * 3);
      const mags = new Float32Array(M).fill(1);
      const arc = new Float32Array(M);
      for (let i = 0; i < M; i++) {
        const x = -GAP_HALF + 0.01 + ((2 * GAP_HALF - 0.02) * i) / (M - 1);
        points.set([x, y, z], 3 * i);
        arc[i] = x + GAP_HALF;
      }
      return { points, mags, arc, count: M, closed: false, reason: 'source' as const };
    });
  };
  field.setLines(straightLines());

  // --- rotating coil -------------------------------------------------------------------------
  const coil = new THREE.Group();
  coil.name = 'coil';
  scene.add(coil);
  const shaft = mesh(geo(new THREE.CylinderGeometry(0.045, 0.045, 1, 20)), 'steel');
  shaft.scale.y = SHAFT_TOP - SHAFT_BOT;
  shaft.position.y = (SHAFT_TOP + SHAFT_BOT) / 2;
  coil.add(shaft);
  // clamp hubs where the coil's top and bottom sides cross the shaft
  const hubGeo = geo(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6));
  const hubTop = mesh(hubGeo, 'brass');
  const hubBottom = mesh(hubGeo, 'brass');
  coil.add(hubTop, hubBottom);
  // grub screws on the slip-ring stack turn with it (makes the rotation readable)
  const grubGeo = geo(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8).rotateZ(Math.PI / 2));
  for (const y of [RING_Y[0] - 0.17, RING_Y[1] + 0.17]) {
    const g = mesh(grubGeo, 'darkSteel');
    g.position.set(0.14, y, 0);
    coil.add(g);
  }
  let coilWire: THREE.Mesh | null = null;
  const formers: THREE.Mesh[] = [];
  let coilKey = '';
  // normal n̂ (the one accent colour: the part that is working)
  const normalMat = mat(
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissiveIntensity: 0.6 }),
  );
  const nShaft = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.035, 0.035, 1, 12).rotateZ(-Math.PI / 2)),
    normalMat,
  );
  const nHead = new THREE.Mesh(
    geo(new THREE.ConeGeometry(0.1, 0.26, 18).rotateZ(-Math.PI / 2)),
    normalMat,
  );
  coil.add(nShaft, nHead);
  const coilFlow: CurrentFlow = createCurrentFlow(stage, {
    path: [new THREE.Vector3(), new THREE.Vector3(0, 1, 0)],
    closed: true,
    count: 28,
    radius: 0.036,
    speedPerAmp: 1.4,
    vMax: 1.6,
    smooth: false,
  });
  coil.add(coilFlow.object);

  const buildCoil = (S: number, N: number): void => {
    const side = loopSide(S);
    const turns = visualTurns(N, TURN_CAP[tierName()]);
    const key = `${side.toFixed(3)}|${turns}|${stage.tier}`;
    if (key === coilKey) return;
    coilKey = key;
    const cols = Math.min(turns, 6);
    const rows = Math.ceil(turns / cols);
    const pitch = 2.15 * WIRE_R;
    const perTurn = Math.round(8 * stage.settings.tessellation) + 3;
    const pts: THREE.Vector3[] = [];
    const a0 = side / 2;
    // (u, v) of roundedRectPoints → (z, y) turned by 180° about x: the winding starts at the
    // top centre (leads up the shaft to the rings) and keeps the same sense about n̂ = +x.
    const at = (x: number, u: number, w: number): THREE.Vector3 => new THREE.Vector3(x, -w, -u);
    // lead from ring 1 down along the shaft to the start of the winding
    pts.push(new THREE.Vector3(0, RING_Y[0], 0.13), new THREE.Vector3(0, a0 + 0.14, 0.07));
    for (let k = 0; k < turns; k++) {
      const ix = k % cols;
      const ir = Math.floor(k / cols);
      const x0 = (ix - (cols - 1) / 2) * pitch;
      const nx = ((k + 1) % cols) - (cols - 1) / 2;
      const x1 = (k + 1 < turns ? nx : ix - (cols - 1) / 2) * pitch;
      const a = a0 - ir * pitch;
      const ring = roundedRectPoints(
        a,
        a,
        Math.min(0.14, a * 0.4),
        perTurn,
        Math.max(3, perTurn >> 1),
      );
      ring.forEach(([u, w], i) => {
        const t = i / ring.length;
        const x = t < 0.85 ? x0 : x0 + (x1 - x0) * ((t - 0.85) / 0.15);
        pts.push(at(x, u, w));
      });
    }
    pts.push(new THREE.Vector3(0, a0 + 0.14, -0.07), new THREE.Vector3(0, RING_Y[1], -0.13));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const g = geo(
      stage.tier === 'base'
        ? new THREE.TubeGeometry(curve, pts.length, WIRE_R, 4, false)
        : new THREE.TubeGeometry(curve, pts.length * 2, WIRE_R, 7, false),
    );
    if (coilWire) {
      dropGeo(coilWire.geometry);
      coilWire.geometry = g;
    } else {
      coilWire = mesh(g, 'enamel');
      coil.add(coilWire);
      stage.castShadows(coilWire);
    }
    // former: two thin plastic cheeks holding the inner half of the bundle (outer turns visible)
    const aIn = a0 - (rows - 1) * pitch;
    const cheek = geo(
      new THREE.ExtrudeGeometry(
        squareRing(
          aIn + 0.5 * (rows - 1) * pitch + 0.02,
          Math.min(0.14, aIn * 0.4),
          aIn - WIRE_R - 0.07,
          0.05,
        ),
        { depth: 0.028, bevelEnabled: false, curveSegments: 6 },
      ).rotateY(Math.PI / 2),
    );
    const cheekX = (cols / 2) * pitch + 0.006;
    for (const [i, sx] of [-1, 1].entries()) {
      let f = formers[i];
      if (f) {
        dropGeo(f.geometry);
        f.geometry = cheek;
      } else {
        f = mesh(cheek, 'plastic', 'former');
        formers.push(f);
        coil.add(f);
        stage.castShadows(f);
      }
      f.position.x = sx < 0 ? -cheekX - 0.028 : cheekX;
    }
    // current particles ride on the outside of the bundle
    const ao = a0 + WIRE_R * 1.6;
    const fp = roundedRectPoints(ao, ao, Math.min(0.16, ao * 0.4), 8, 4).map(([u, w]) =>
      at(0, u, w),
    );
    coilFlow.setPath(fp, true);
    hubTop.position.y = a0;
    hubBottom.position.y = -a0;
    const nLen = normalLen(side);
    nShaft.scale.set(nLen, 1, 1);
    nShaft.position.set(nLen / 2, 0, 0);
    nHead.position.set(nLen + 0.12, 0, 0);
  };

  // --- external circuit current -------------------------------------------------------------------
  const leadFlow = createCurrentFlow(stage, {
    path: rig.leadPath,
    count: 40,
    radius: 0.034,
    speedPerAmp: 1.4,
    vMax: 1.6,
  });
  const lampLight = rig.lamp.light;

  // --- projected area S·cos α (screen in front of the S pole, ⟂ B) ----------------------------
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const fillGeo = geo(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2)); // normal +x
  const projMat = mat(
    new THREE.ShaderMaterial({
      vertexShader: FILL_VS,
      fragmentShader: FILL_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0.3 },
        uTime: { value: 0 },
        uScale: { value: new THREE.Vector2(1, 1) },
      },
    }),
  );
  const proj = new THREE.Mesh(fillGeo, projMat);
  proj.position.x = PROJ_X;
  proj.renderOrder = 5;
  const outlineGeo = geo(
    new THREE.BufferGeometry().setFromPoints([
      v(0, -0.5, -0.5),
      v(0, 0.5, -0.5),
      v(0, 0.5, 0.5),
      v(0, -0.5, 0.5),
    ]),
  );
  const outlineMat = mat(
    new THREE.LineDashedMaterial({
      dashSize: 0.08,
      gapSize: 0.06,
      transparent: true,
      opacity: 0.8,
    }),
  );
  const outline = new THREE.LineLoop(outlineGeo, outlineMat);
  outline.computeLineDistances();
  outline.position.x = PROJ_X - 0.005;
  scene.add(proj, outline);

  // α arc (horizontal, under the coil): from B (+x) to n̂
  const ARC_N = 33;
  const arcGeo = geo(new THREE.BufferGeometry());
  const arcPos = new Float32Array(ARC_N * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcMat = mat(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 }));
  const arc = new THREE.Line(arcGeo, arcMat);
  scene.add(arc);
  const bRefMat = mat(
    new THREE.LineDashedMaterial({
      dashSize: 0.06,
      gapSize: 0.05,
      transparent: true,
      opacity: 0.8,
    }),
  );
  const bRef = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints([v(), v(1)])), bRefMat);
  bRef.computeLineDistances();
  scene.add(bRef);
  stage.castShadows(coil);

  // --- labels: each on a short leader from its part, outside the gap (never on the coil) -----------
  // Left column: N, B, load (lamp). Right column: S, f.e.m. (brushes), Φ, α. n̂ above the gap.
  const labels = createLabelLayer(stage, overlay);
  const parts = {
    n: rig.anchors.n,
    s: rig.anchors.s,
    b: v(-GAP_HALF + 0.35, -0.5, FACE_HZ - 0.2),
    normal: v(),
    alpha: v(),
    phi: v(),
    emf: rig.anchors.brushes,
    load: rig.anchors.lamp,
  };
  type Key = keyof typeof parts;
  /** Label positions (world); the leader runs from the part to here. */
  const ends: Record<Key, THREE.Vector3> = {
    n: v(-4.6, 1.9, FACE_HZ),
    s: v(4.6, 1.9, FACE_HZ),
    b: v(-6.8, -0.4, FACE_HZ),
    normal: v(1.3, 2.45, 1.2),
    alpha: v(6.6, -2.6, FACE_HZ),
    phi: v(6.8, -0.4, FACE_HZ),
    emf: v(4.6, 3.0, 0.9),
    load: v(-7.0, -4.2, LAMP_POS.z),
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
  const updateLeaders = (rotating: boolean): void => {
    KEYS.forEach((k, i) => {
      const on = rotating || !['normal', 'alpha', 'phi'].includes(k);
      const a = parts[k];
      const b = on ? ends[k] : a;
      leaderPos.set([a.x, a.y, a.z, b.x, b.y, b.z], 6 * i);
    });
    (leaderGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };
  const tag = (
    k: Key,
    o: Omit<Parameters<typeof labels.add>[0], 'anchor' | 'occlude' | 'offset'>,
  ): Label => labels.add({ ...o, anchor: ends[k], occlude: false, offset: [0, 0] });
  const L: Record<Key, Label> = {
    n: tag('n', { text: 'N', size: 'lg', priority: 9 }),
    s: tag('s', { text: 'S', size: 'lg', priority: 9 }),
    b: tag('b', { text: 'B', quantity: 'b', priority: 6 }),
    normal: tag('normal', { text: 'n̂', quantity: 'accent', priority: 7, size: 'sm' }),
    alpha: tag('alpha', { text: 'α', quantity: 'accent', priority: 5, size: 'sm' }),
    phi: tag('phi', { text: 'Φ', quantity: 'b', priority: 8, sensorWidth: '14ch' }),
    emf: tag('emf', { text: 'f.e.m.', quantity: 'emf', priority: 8, sensorWidth: '16ch' }),
    load: tag('load', { text: 'carico', quantity: 'energy', priority: 4, sensorWidth: '20ch' }),
  };

  // --- theme -----------------------------------------------------------------------------------------
  const applyTheme = (): void => {
    const t = stage.theme;
    const b = quantityColorHex('b', t);
    // teardown studio is dark in both themes: the bright accent reads on it
    const accent = 0x3dd6c6;
    normalMat.color.setHex(accent);
    normalMat.emissive.setHex(accent);
    (projMat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(b);
    outlineMat.color.setHex(0x9da7b3);
    arcMat.color.setHex(accent);
    bRefMat.color.setHex(b);
  };
  applyTheme();
  const offTheme = stage.onThemeChange(() => applyTheme());
  const offTier = stage.onTierChange((s) => {
    coilKey = '';
    lampLight.visible = s.tier !== 'base';
    field.setLines(straightLines());
  });
  lampLight.visible = stage.tier !== 'base';

  /**
   * Kit tints for the teardown look, and QA-035: the lamp may glow (and bloom) only through
   * its filament emissive ∝ P/Pₘₐₓ — dim environment reflections on brass and glass.
   * Re-applied every frame (kit materials are replaced on a tier/theme switch; scalar writes).
   */
  const tint = (): void => {
    for (const [kind, key, color, rough] of TINTS) {
      const m = kit.get(kind, key) as THREE.MeshStandardMaterial;
      m.color.setHex(color);
      if ('roughness' in m) m.roughness = rough;
      if ('envMapIntensity' in m) m.envMapIntensity = kind === 'enamel' ? 1.1 : 0.6;
      // laminated iron: less mirror-like so the limbs do not fall to black in the dark studio
      if (kind === 'iron' && 'metalness' in m) m.metalness = 0.55;
    }
    for (const kind of ['glass', 'brass'] as const) {
      const m = kit.get(kind, 'lamp') as THREE.MeshStandardMaterial;
      if ('envMapIntensity' in m) m.envMapIntensity = kind === 'glass' ? 0.45 : 0.55;
      if (kind === 'glass' && 'clearcoat' in m) (m as THREE.MeshPhysicalMaterial).clearcoat = 0.25;
    }
  };

  // --- per-frame update ----------------------------------------------------------------------------
  let time = 0;
  let lastMs = performance.now();
  const render = (s: SceneState): void => {
    const now = performance.now();
    time += Math.min(0.1, (now - lastMs) / 1000);
    lastMs = now;
    const { p } = s;
    const rotating = s.mode === 'rotating';
    const ratio = Number.isFinite(s.emfRatio) ? s.emfRatio : 0;
    const absR = Math.min(1, Math.abs(ratio));
    field.setFlow((1.6 * p.B) / params.B.max);
    coil.visible = rotating;
    proj.visible = rotating;
    outline.visible = rotating;
    arc.visible = rotating;
    bRef.visible = rotating;
    coilFlow.setVisible(rotating);
    leadFlow.setVisible(rotating);
    tint();
    // brush glow ∝ |f.e.m.|
    kit.get('glowEmf', 'brush').emissiveIntensity = 0.05 + 0.9 * absR;
    (projMat.uniforms['uTime'] as { value: number }).value = time;

    if (rotating) {
      buildCoil(p.S, p.N);
      const side = loopSide(p.S);
      coil.rotation.y = s.alpha;
      coilFlow.setCurrent(ratio);
      leadFlow.setCurrent(ratio);
      // lamp: P ∝ f.e.m.² (illustrative resistive load)
      const pRel = ratio * ratio;
      kit.get('filament', 'lamp').emissiveIntensity = 7 * pRel; // the one source of lamp glow
      lampLight.intensity = 3.2 * pRel;
      // projection S·|cos α|
      const c = Math.cos(s.alpha);
      proj.scale.set(1, side, Math.max(1e-3, side * Math.abs(c)));
      (projMat.uniforms['uScale'] as { value: THREE.Vector2 }).value.set(
        side * Math.abs(c) + 1e-3,
        side,
      );
      (projMat.uniforms['uOpacity'] as { value: number }).value =
        0.12 + 0.3 * Math.abs(c) * Math.min(1, p.B / 0.5);
      outline.scale.set(1, side, side);
      // α arc under the coil
      const ay = -side / 2 - 0.1;
      const ar = 0.55 + side * 0.18;
      for (let i = 0; i < ARC_N; i++) {
        const th = (s.alpha * i) / (ARC_N - 1);
        arcPos[3 * i] = ar * Math.cos(th);
        arcPos[3 * i + 1] = ay;
        arcPos[3 * i + 2] = -ar * Math.sin(th);
      }
      (arcGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      arcGeo.computeBoundingSphere();
      bRef.position.set(0, ay, 0);
      bRef.scale.set(Math.min(ar + 0.25, PROJ_X - 0.05), 1, 1);
      const mid = s.alpha / 2;
      parts.alpha.set(ar * Math.cos(mid), ay, -ar * Math.sin(mid));
      // n̂: leader from the arrow tip up to a fixed spot above the gap (off the winding)
      parts.normal.set(normalLen(side) + 0.25, 0, 0);
      coil.localToWorld(parts.normal);
      parts.phi.set(PROJ_X, -side / 4, (side / 2) * Math.abs(c));
    }
    for (const k of ['normal', 'alpha', 'phi'] as const) L[k].setVisible(rotating);
    updateLeaders(rotating);
    const t = s.labels;
    if (t) {
      L.b.setText(t.b);
      L.phi.setText(t.phi);
      L.emf.setText(t.emf);
      L.alpha.setText(t.alpha);
      L.load.setText(t.load);
    }
    stage.render();
    sceneStats.frames++;
  };

  sceneStats.liveScenes++;
  sceneStats.createdScenes++;
  let disposed = false;

  return {
    canvas: stage.canvas,
    stage,
    render,
    setTheme: (t) => stage.setTheme(t),
    memory: () => ({ ...stage.renderer.info.memory }),
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
      for (const g of [...geometries]) dropGeo(g);
      for (const m of materials.splice(0)) {
        m.dispose();
        sceneStats.liveMaterials--;
      }
      for (const x of textures.splice(0)) x.dispose();
      stage.dispose();
      sceneStats.liveRenderers--;
      sceneStats.liveScenes--;
    },
  };
}

/** Render-foundation counters re-exported for the debug hook. */
export { renderStats };
