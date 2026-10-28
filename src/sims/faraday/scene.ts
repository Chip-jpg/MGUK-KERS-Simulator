/**
 * Three.js scene of the `faraday` simulator, built on the render foundation
 * (`src/render`, D14): a permanent-magnet lab rig with laminated-iron pole shoes,
 * the field in the gap drawn as COMPUTED field lines (`gapField`, fringing at the
 * edges, flow speed ∝ |B|), the rotating N-turn coil as a wound bundle of
 * enamelled copper with slip rings, brushes and leads to a small lamp, and — in
 * the second mode — copper rails with a sliding bar.
 *
 * What is physics and what is illustration:
 *  - field-line shape: two-sheet pole model `gapField` (uniform in the core, as
 *    the sim's model assumes; fringing only at the edges);
 *  - coil angle α, Φ, f.e.m.: from the model (`FaradaySim`), passed in `SceneState`;
 *  - current particles and lamp brightness: the model has no resistance, so they
 *    use an ILLUSTRATIVE resistive load — i ∝ f.e.m. (particle speed ∝ |f.e.m.|/V₀,
 *    direction = sign of the f.e.m.) and P ∝ f.e.m.² (lamp brightness = (f.e.m./V₀)²).
 *    No new quantity is claimed.
 * Geometry is original and abstract; visual sizes are ∝ physical ones (coil side ∝
 * √S, bar ∝ l, drawn turns ∝ N up to a cap) but the rig is not to scale.
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  chamferBox,
  createCurrentFlow,
  createFieldLines,
  createLabelLayer,
  createStage,
  renderStats,
  roundedRectPoints,
  seedRect,
  type CurrentFlow,
  type FieldLines,
  type Label,
  type Stage,
  type StageInfo,
  type TraceJob,
} from '../../render';
import { quantityColorHex } from '../../ui';
import { params, X_MAX, X_MIN, type FaradayMode, type FaradayParams } from './model';

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
  /** Motional: bar position x [m] and velocity sign. */
  x: number;
  dir: number;
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

// --- rig dimensions (scene units) -------------------------------------------------
const FLOOR_Y = -2.6;
const BASE_TOP = -2.4;
const GAP_HALF = 1.6; // pole faces at x = ±1,6
const FACE_HY = 1.85;
const FACE_HZ = 2.3;
const LOOP_SIDE_MAX = 2.6;
const RING_Y = [-1.72, -2.02] as const;
const RING_R = 0.16;
const RAIL_Z0 = -1.8;
const RAIL_LEN = 3.6;
const BAR_SCALE = 2.8; // scene units per metre of l
const WIRE_R = 0.024;
const PROJ_X = GAP_HALF - 0.08;
const LAMP_Z = 2.85;
const ROTATING_VIEW = {
  position: [-3.3, 3.7, 9.0] as [number, number, number],
  target: [0.25, -0.55, 0.3] as [number, number, number],
};
const MOTIONAL_VIEW = {
  position: [-5.6, 3.9, 7.4] as [number, number, number],
  target: [0, -0.25, 0] as [number, number, number],
};
/** Drawn turns: ∝ N up to this cap per tier. */
const TURN_CAP = { alta: 24, bilanciata: 16, base: 8 } as const;

/** Visual side of the loop for an area S [m²] (∝ √S). */
export function loopSide(S: number): number {
  return Math.max(0.3, (LOOP_SIDE_MAX * Math.sqrt(S)) / Math.sqrt(params.S.max));
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
      'Scena 3D: magnete permanente con espansioni polari in ferro laminato, linee del campo B calcolate nel traferro, bobina di N spire che ruota con anelli e spazzole collegati a una lampadina (oppure la sbarretta che scorre sui binari) e l’area proiettata attraversata dal flusso.',
    camera: { ...ROTATING_VIEW, fov: 36 },
    controls: { minDistance: 4, maxDistance: 22 },
    floorY: FLOOR_Y,
    shadowRadius: 5.5,
  });
  sceneStats.liveRenderers++;
  const { scene } = stage;
  const kit = stage.materials;

  // --- resource tracking (non-kit) ----------------------------------------------------
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
  const tierName = (): keyof typeof TURN_CAP => stage.tier;

  // --- base + magnet rig -----------------------------------------------------------------
  const rig = new THREE.Group();
  rig.name = 'rig';
  scene.add(rig);
  const base = mesh(geo(chamferBox(6.6, 0.2, 6.3, 0.06)), 'darkSteel');
  base.position.set(0, BASE_TOP - 0.1, 0.4);
  rig.add(base);
  const mat2 = mesh(geo(chamferBox(6.2, 0.02, 5.9, 0.01, 1)), 'plastic');
  mat2.position.set(0, BASE_TOP + 0.005, 0.4);
  rig.add(mat2);

  // Each side: laminated-iron pole shoe (the face) + permanent-magnet block standing
  // on the base; a laminated yoke at the back closes the magnetic circuit.
  const MAG_H = FACE_HY + 0.25 - BASE_TOP;
  const MAG_Y = BASE_TOP + MAG_H / 2;
  const MAG_X = GAP_HALF + 0.35 + 0.4;
  const shoeGeo = geo(chamferBox(0.35, FACE_HY * 2, FACE_HZ * 2, 0.06));
  const magnetGeo = geo(chamferBox(0.8, MAG_H, 4.1, 0.09));
  const yokeGeo = geo(chamferBox(2 * MAG_X + 0.8, 0.9, 0.6, 0.07));
  const plateGeo = geo(new THREE.PlaneGeometry(0.62, 0.62));
  const occluders: THREE.Object3D[] = [];
  for (const side of [-1, 1] as const) {
    const g = new THREE.Group();
    const shoe = mesh(shoeGeo, 'iron');
    shoe.position.x = side * (GAP_HALF + 0.175);
    const magnet = mesh(magnetGeo, 'magnet');
    magnet.position.set(side * MAG_X, MAG_Y, 0);
    // engraved N / S nameplates on the front and top faces of the magnet block
    for (const face of ['front', 'top'] as const) {
      const plate = mesh(plateGeo, side < 0 ? 'magnetN' : 'magnetS');
      if (face === 'front') plate.position.set(side * MAG_X, 0.2, 2.05 + 0.006);
      else {
        plate.position.set(side * MAG_X, BASE_TOP + MAG_H + 0.006, 1.0);
        plate.rotation.x = -Math.PI / 2;
      }
      g.add(plate);
    }
    g.add(shoe, magnet);
    rig.add(g);
    occluders.push(shoe, magnet);
  }
  const yoke = mesh(yokeGeo, 'iron');
  yoke.position.set(0, BASE_TOP + 0.45, -2.05 - 0.3);
  rig.add(yoke);
  occluders.push(yoke);
  stage.occluders.push(...occluders);

  // --- field lines (computed: gapField) ----------------------------------------------------
  const field: FieldLines = createFieldLines(stage, { linewidth: 2.2, spacing: 1.0, speed: 1.1 });
  const traceJob = (): TraceJob => {
    const n = Math.max(12, Math.round(42 * stage.settings.lineDensity));
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
        FACE_HY - 0.06,
        FACE_HZ - 0.06,
        n,
      ),
      options: {
        bounds: { min: [-3.6, -3.4, -3.6], max: [3.6, 3.4, 3.6] },
        stopBoxes: [
          {
            min: [GAP_HALF - 0.02, -FACE_HY - 0.05, -FACE_HZ - 0.05],
            max: [3.6, FACE_HY + 0.05, FACE_HZ + 0.05],
          },
        ],
        maxAngle: 0.05,
      },
    };
  };
  void field.setJob(traceJob());

  // --- rotating coil -------------------------------------------------------------------------
  const coil = new THREE.Group();
  coil.name = 'coil';
  scene.add(coil);
  const shaftGeo = geo(new THREE.CylinderGeometry(0.045, 0.045, 1, 20));
  const shaft = mesh(shaftGeo, 'steel');
  coil.add(shaft);
  const hubGeo = geo(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 20));
  const hubTop = mesh(hubGeo, 'steel');
  const hubBottom = mesh(hubGeo, 'steel');
  coil.add(hubTop, hubBottom);
  const sleeve = mesh(geo(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 24)), 'plastic');
  sleeve.position.y = (RING_Y[0] + RING_Y[1]) / 2;
  coil.add(sleeve);
  const ringGeo = geo(new THREE.CylinderGeometry(RING_R, RING_R, 0.12, 40));
  for (const y of RING_Y) {
    const r = mesh(ringGeo, 'brass');
    r.position.y = y;
    coil.add(r);
  }
  let coilWire: THREE.Mesh | null = null;
  let coilKey = '';
  // normal n̂ (accent colour)
  const normalMat = mat(
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissiveIntensity: 0.6 }),
  );
  const nShaft = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.022, 0.022, 1, 10).rotateZ(-Math.PI / 2)),
    normalMat,
  );
  const nHead = new THREE.Mesh(
    geo(new THREE.ConeGeometry(0.075, 0.22, 16).rotateZ(-Math.PI / 2)),
    normalMat,
  );
  coil.add(nShaft, nHead);
  const coilFlow: CurrentFlow = createCurrentFlow(stage, {
    path: [new THREE.Vector3(), new THREE.Vector3(0, 1, 0)],
    closed: true,
    count: 46,
    radius: 0.034,
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
    const pitch = 2.15 * WIRE_R;
    const perTurn = Math.round(8 * stage.settings.tessellation) + 3;
    const pts: THREE.Vector3[] = [];
    const a0 = side / 2;
    // lead from ring 1 up along the shaft to the start of the winding (bottom centre)
    pts.push(new THREE.Vector3(0.0, RING_Y[0], 0.12), new THREE.Vector3(0.0, -a0 - 0.12, 0.06));
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
      ring.forEach(([u, v], i) => {
        const t = i / ring.length;
        const x = t < 0.85 ? x0 : x0 + (x1 - x0) * ((t - 0.85) / 0.15);
        pts.push(new THREE.Vector3(x, v, u));
      });
    }
    pts.push(new THREE.Vector3(0, -a0 - 0.12, -0.06), new THREE.Vector3(0.0, RING_Y[1], -0.12));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const g = geo(
      new THREE.TubeGeometry(curve, pts.length * 2, WIRE_R, stage.tier === 'base' ? 5 : 7, false),
    );
    if (coilWire) {
      dropGeo(coilWire.geometry);
      coilWire.geometry = g;
    } else {
      coilWire = mesh(g, 'enamel');
      coil.add(coilWire);
      stage.castShadows(coilWire);
    }
    // current particles ride on the outside of the bundle
    const ao = a0 + WIRE_R * 1.6;
    const fp = roundedRectPoints(ao, ao, Math.min(0.16, ao * 0.4), 8, 4).map(
      ([u, v]) => new THREE.Vector3(0, v, u),
    );
    coilFlow.setPath(fp, true);
    // shaft / hubs
    const top = a0 + 0.4;
    shaft.scale.y = top - BASE_TOP;
    shaft.position.y = (top + BASE_TOP) / 2;
    hubTop.position.y = a0;
    hubBottom.position.y = -a0;
    const nLen = 0.45 + side * 0.32;
    nShaft.scale.set(nLen, 1, 1);
    nShaft.position.set(nLen / 2, 0, 0);
    nHead.position.set(nLen + 0.1, 0, 0);
  };

  // --- brushes, leads, lamp --------------------------------------------------------------------
  const brushes = new THREE.Group();
  scene.add(brushes);
  const post = mesh(geo(chamferBox(0.16, 0.86, 0.16, 0.03)), 'plastic');
  post.position.set(0, BASE_TOP + 0.43, 0.62);
  brushes.add(post);
  const brushGeo = geo(chamferBox(0.1, 0.09, 0.2, 0.015, 1));
  const armGeo = geo(chamferBox(0.05, 0.03, 0.34, 0.01, 1));
  const brushMeshes: THREE.Mesh[] = [];
  for (const y of RING_Y) {
    const b = mesh(brushGeo, 'glowEmf', 'brush');
    b.position.set(0, y, RING_R + 0.1);
    const arm = mesh(armGeo, 'brass');
    arm.position.set(0, y + 0.05, RING_R + 0.3);
    brushes.add(b, arm);
    brushMeshes.push(b);
  }
  const lamp = new THREE.Group();
  lamp.position.set(1.05, BASE_TOP, LAMP_Z);
  scene.add(lamp);
  const lampBase = mesh(geo(new THREE.CylinderGeometry(0.16, 0.19, 0.14, 32)), 'ceramic');
  lampBase.position.y = 0.07;
  const socket = mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 32)), 'brass');
  socket.position.y = 0.24;
  const bulb = mesh(geo(new THREE.SphereGeometry(0.3, 40, 28)), 'glass');
  bulb.position.y = 0.6;
  bulb.renderOrder = 4;
  const filament = mesh(
    geo(new THREE.TorusGeometry(0.07, 0.012, 8, 32, Math.PI * 1.4)),
    'filament',
    'lamp',
  );
  filament.position.y = 0.6;
  filament.rotation.z = Math.PI * 0.8;
  const supportGeo = geo(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6));
  for (const s of [-1, 1]) {
    const w = mesh(supportGeo, 'steel');
    w.position.set(s * 0.06, 0.45, 0);
    lamp.add(w);
  }
  lamp.add(lampBase, socket, bulb, filament);
  const lampLight = new THREE.PointLight(0xffb86b, 0, 4, 2);
  lampLight.position.y = 0.6;
  lamp.add(lampLight);

  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  // External circuit for f.e.m. > 0 (counter-clockwise about n̂ in the coil):
  // brush 2 → lead → lamp → lead → brush 1.
  const leadPath = [
    v(0.04, RING_Y[1], 0.66),
    v(0.25, BASE_TOP + 0.08, 1.1),
    v(0.7, BASE_TOP + 0.06, LAMP_Z - 0.6),
    v(0.95, BASE_TOP + 0.12, LAMP_Z),
    v(1.0, BASE_TOP + 0.45, LAMP_Z),
    v(1.05, BASE_TOP + 0.6, LAMP_Z),
    v(1.1, BASE_TOP + 0.45, LAMP_Z),
    v(1.15, BASE_TOP + 0.12, LAMP_Z),
    v(1.0, BASE_TOP + 0.06, LAMP_Z - 0.75),
    v(0.45, BASE_TOP + 0.08, 1.05),
    v(0.04, RING_Y[0], 0.66),
  ];
  const leadCurveA = new THREE.CatmullRomCurve3(leadPath.slice(0, 4), false, 'centripetal');
  const leadCurveB = new THREE.CatmullRomCurve3(leadPath.slice(7), false, 'centripetal');
  const leadA = mesh(geo(new THREE.TubeGeometry(leadCurveA, 48, 0.028, 8, false)), 'rubber');
  const leadB = mesh(geo(new THREE.TubeGeometry(leadCurveB, 48, 0.028, 8, false)), 'rubber');
  brushes.add(leadA, leadB);
  const leadFlow = createCurrentFlow(stage, {
    path: leadPath,
    count: 40,
    radius: 0.036,
    speedPerAmp: 1.4,
    vMax: 1.6,
  });

  // --- projected area S·cos α (screen in front of the S pole, ⟂ B) ----------------------------
  const fillGeo = geo(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2)); // normal +x
  const makeFill = (): THREE.ShaderMaterial =>
    mat(
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
  const projMat = makeFill();
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

  // α arc (horizontal, above the coil): from B (+x) to n̂
  const ARC_N = 33;
  const arcGeo = geo(new THREE.BufferGeometry());
  const arcPos = new Float32Array(ARC_N * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcMat = mat(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
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
  const bRefGeo = geo(new THREE.BufferGeometry().setFromPoints([v(0, 0, 0), v(1, 0, 0)]));
  const bRef = new THREE.Line(bRefGeo, bRefMat);
  bRef.computeLineDistances();
  scene.add(bRef);

  // --- motional: board, rails, bar, resistor -------------------------------------------------
  const railGroup = new THREE.Group();
  scene.add(railGroup);
  const board = mesh(geo(chamferBox(0.03, 1, 1, 0.004, 1)), 'glass');
  board.renderOrder = 4;
  const railGeo = geo(chamferBox(0.07, 0.07, RAIL_LEN + 0.55, 0.02, 1));
  const railTop = mesh(railGeo, 'copper');
  const railBottom = mesh(railGeo, 'copper');
  const connGeo = geo(new THREE.CylinderGeometry(0.035, 0.035, 1, 12));
  const connector = mesh(connGeo, 'copper');
  const resistor = mesh(geo(new THREE.CylinderGeometry(0.075, 0.075, 1, 24)), 'ceramic');
  const barGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 1, 20));
  const bar = mesh(barGeo, 'copper');
  const shoeGeo2 = geo(chamferBox(0.13, 0.1, 0.16, 0.02, 1));
  const shoeT = mesh(shoeGeo2, 'brass');
  const shoeB = mesh(shoeGeo2, 'brass');
  const areaMat = makeFill();
  const areaFill = new THREE.Mesh(fillGeo, areaMat);
  areaFill.renderOrder = 5;
  const vShaft = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.022, 0.022, 1, 10).rotateX(Math.PI / 2)),
    normalMat,
  );
  const vHead = new THREE.Mesh(
    geo(new THREE.ConeGeometry(0.075, 0.22, 16).rotateX(Math.PI / 2)),
    normalMat,
  );
  railGroup.add(
    board,
    railTop,
    railBottom,
    connector,
    resistor,
    bar,
    shoeT,
    shoeB,
    areaFill,
    vShaft,
    vHead,
  );
  const railFlow = createCurrentFlow(stage, {
    path: [v(0, 0, 0), v(0, 1, 0)],
    closed: true,
    count: 44,
    radius: 0.036,
    speedPerAmp: 1.4,
    vMax: 1.6,
    smooth: false,
  });

  stage.castShadows(rig);
  stage.castShadows(coil);
  stage.castShadows(brushes);
  stage.castShadows(lamp, false);
  bulb.castShadow = false;
  stage.castShadows(railGroup);
  board.castShadow = false;

  // --- labels ------------------------------------------------------------------------------------
  const labels = createLabelLayer(stage, overlay);
  const anchors = {
    n: v(-2.35, FACE_HY + 0.55, 1.0),
    s: v(2.35, FACE_HY + 0.55, 1.0),
    b: v(-0.9, FACE_HY + 0.45, FACE_HZ - 0.2),
    normal: v(),
    alpha: v(),
    phi: v(),
    emf: v(0, RING_Y[0] + 0.05, RING_R + 0.55),
    load: v(1.05, BASE_TOP + 1.12, LAMP_Z),
    v: v(),
  };
  const L: Record<keyof typeof anchors, Label> = {
    n: labels.add({ text: 'N', anchor: anchors.n, size: 'lg', priority: 9, occlude: false }),
    s: labels.add({ text: 'S', anchor: anchors.s, size: 'lg', priority: 9, occlude: false }),
    b: labels.add({ text: 'B', anchor: anchors.b, quantity: 'b', priority: 6, occlude: false }),
    normal: labels.add({ text: 'n̂', anchor: anchors.normal, quantity: 'accent', priority: 7 }),
    alpha: labels.add({
      text: 'α',
      anchor: anchors.alpha,
      quantity: 'accent',
      priority: 5,
      size: 'sm',
      occlude: false,
    }),
    phi: labels.add({ text: 'Φ', anchor: anchors.phi, quantity: 'b', priority: 8, occlude: false }),
    emf: labels.add({
      text: 'f.e.m.',
      anchor: anchors.emf,
      quantity: 'emf',
      priority: 8,
      occlude: false,
    }),
    load: labels.add({
      text: 'carico',
      anchor: anchors.load,
      quantity: 'energy',
      priority: 4,
      size: 'sm',
      occlude: false,
    }),
    v: labels.add({
      text: 'v',
      anchor: anchors.v,
      quantity: 'accent',
      priority: 7,
      occlude: false,
    }),
  };

  // --- theme -----------------------------------------------------------------------------------------
  const applyTheme = (): void => {
    const t = stage.theme;
    const b = quantityColorHex('b', t);
    const accent = t === 'dark' ? 0x3dd6c6 : 0x0f7c72;
    normalMat.color.setHex(accent);
    normalMat.emissive.setHex(accent);
    (projMat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(b);
    (areaMat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(b);
    outlineMat.color.setHex(t === 'dark' ? 0x9da7b3 : 0x57606a);
    arcMat.color.setHex(accent);
    bRefMat.color.setHex(b);
  };
  applyTheme();
  const offTheme = stage.onThemeChange(() => applyTheme());
  const offTier = stage.onTierChange((s) => {
    coilKey = '';
    lampLight.visible = s.tier !== 'base';
    void field.setJob(traceJob());
  });
  lampLight.visible = stage.tier !== 'base';

  // --- per-frame update ----------------------------------------------------------------------------
  let time = 0;
  let lastMs = performance.now();
  let viewMode: FaradayMode | null = null;
  const render = (s: SceneState): void => {
    if (s.mode !== viewMode) {
      // Each experiment has its own home view: the rail plane (⟂ B) is best seen from above-left.
      if (viewMode !== null) {
        if (s.mode === 'motional') stage.setView(MOTIONAL_VIEW.position, MOTIONAL_VIEW.target);
        else stage.setView(ROTATING_VIEW.position, ROTATING_VIEW.target);
      }
      viewMode = s.mode;
    }
    const now = performance.now();
    time += Math.min(0.1, (now - lastMs) / 1000);
    lastMs = now;
    const { p } = s;
    const rotating = s.mode === 'rotating';
    const ratio = Number.isFinite(s.emfRatio) ? s.emfRatio : 0;
    const absR = Math.min(1, Math.abs(ratio));
    field.setFlow((1.6 * p.B) / params.B.max);
    coil.visible = rotating;
    brushes.visible = rotating;
    lamp.visible = rotating;
    proj.visible = rotating;
    outline.visible = rotating;
    arc.visible = rotating;
    bRef.visible = rotating;
    coilFlow.setVisible(rotating);
    leadFlow.setVisible(rotating);
    railGroup.visible = !rotating;
    railFlow.setVisible(!rotating);
    // brush glow ∝ |f.e.m.|
    kit.get('glowEmf', 'brush').emissiveIntensity = 0.05 + 2.4 * absR;
    for (const u of [projMat, areaMat]) (u.uniforms['uTime'] as { value: number }).value = time;

    if (rotating) {
      buildCoil(p.S, p.N);
      const side = loopSide(p.S);
      coil.rotation.y = s.alpha;
      coilFlow.setCurrent(ratio);
      leadFlow.setCurrent(ratio);
      // lamp: P ∝ f.e.m.² (illustrative resistive load)
      const pRel = ratio * ratio;
      const fil = kit.get('filament', 'lamp');
      fil.emissiveIntensity = 0.02 + 7 * pRel;
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
      // α arc above the coil
      const ay = side / 2 + 0.5;
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
      bRef.scale.set(ar + 0.25, 1, 1);
      const mid = s.alpha / 2;
      anchors.alpha.set((ar + 0.28) * Math.cos(mid), ay + 0.08, -(ar + 0.28) * Math.sin(mid));
      const nLen = 0.45 + side * 0.32;
      anchors.normal.set(nLen + 0.38, 0, 0);
      coil.localToWorld(anchors.normal);
      anchors.phi.set(PROJ_X, side / 2 + 0.32, 0);
      L.normal.setVisible(true);
      L.alpha.setVisible(true);
      L.phi.setVisible(true);
      L.load.setVisible(true);
      L.v.setVisible(false);
      anchors.emf.set(0, RING_Y[0] + 0.12, RING_R + 0.55);
    } else {
      const lVis = p.l * BAR_SCALE;
      const zBar = RAIL_Z0 + ((s.x - X_MIN) / (X_MAX - X_MIN)) * RAIL_LEN;
      const zEnd = RAIL_Z0 - 0.3;
      board.scale.set(1, lVis + 0.7, RAIL_LEN + 1.1);
      board.position.set(0.1, 0, RAIL_Z0 + RAIL_LEN / 2 - 0.25);
      railTop.position.set(0, lVis / 2, RAIL_Z0 + RAIL_LEN / 2 - 0.1);
      railBottom.position.set(0, -lVis / 2, RAIL_Z0 + RAIL_LEN / 2 - 0.1);
      connector.position.set(0, 0, zEnd);
      connector.scale.set(1, lVis, 1);
      const rLen = Math.min(0.55, lVis * 0.55);
      resistor.position.set(0, 0, zEnd);
      resistor.scale.set(1, rLen, 1);
      bar.position.set(0, 0, zBar);
      bar.scale.set(1, lVis + 0.3, 1);
      shoeT.position.set(0, lVis / 2, zBar);
      shoeB.position.set(0, -lVis / 2, zBar);
      const w = Math.max(1e-3, zBar - zEnd);
      areaFill.position.set(-0.01, 0, zEnd + w / 2);
      areaFill.scale.set(1, lVis, w);
      (areaMat.uniforms['uScale'] as { value: THREE.Vector2 }).value.set(w, lVis);
      (areaMat.uniforms['uOpacity'] as { value: number }).value =
        0.16 + 0.24 * Math.min(1, p.B / 0.5);
      const vLen = 0.25 + 0.5 * (p.v / params.v.max);
      vShaft.scale.set(1, 1, vLen);
      vShaft.position.set(0, lVis / 2 + 0.38, zBar + (s.dir * vLen) / 2);
      vHead.rotation.y = s.dir > 0 ? 0 : Math.PI;
      vHead.position.set(0, lVis / 2 + 0.38, zBar + s.dir * (vLen + 0.1));
      anchors.v.set(0, lVis / 2 + 0.68, zBar + s.dir * (vLen / 2));
      anchors.phi.set(0, -lVis / 2 - 0.35, zEnd + w / 2);
      anchors.emf.set(0, 0.0, zBar + 0.45);
      // counter-clockwise about +x (= n̂ of the rail circuit): top rail moves +z
      const xo = -0.075;
      railFlow.setPath(
        [
          v(xo, lVis / 2, zEnd),
          v(xo, lVis / 2, zBar),
          v(xo, -lVis / 2, zBar),
          v(xo, -lVis / 2, zEnd),
        ],
        true,
      );
      railFlow.setCurrent(ratio);
      L.normal.setVisible(false);
      L.alpha.setVisible(false);
      L.phi.setVisible(true);
      L.load.setVisible(false);
      L.v.setVisible(true);
    }
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
      railFlow.dispose();
      for (const g of [...geometries]) dropGeo(g);
      for (const m of materials.splice(0)) {
        m.dispose();
        sceneStats.liveMaterials--;
      }
      stage.dispose();
      sceneStats.liveRenderers--;
      sceneStats.liveScenes--;
    },
  };
}

/** Render-foundation counters re-exported for the debug hook. */
export { renderStats };
