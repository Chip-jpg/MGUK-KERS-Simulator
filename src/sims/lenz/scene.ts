/**
 * Three.js scene of the `lenz` simulator, built on the render foundation
 * (`src/render`, D14): a lab bench with a bar magnet on a sliding carriage, a
 * layer-wound coil of enamelled copper on a translucent former, and a
 * centre-zero galvanometer connected by two leads.
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
 * Sizes: 1 scene unit = 5 cm (SCALE = 20 /m); magnet and coil radius to scale,
 * drawn turns ∝ N up to a cap (the label shows the real N).
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
  type CurrentFlow,
  type FieldLines,
  type FieldSpec,
  type Label,
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

/** Scene units per metre (1 unit = 5 cm). */
export const SCALE = 20;
/** Particle speed at full scale of the galvanometer [scene units / s]. */
export const PARTICLE_SPEED_FS = 1.6;

const BENCH_TOP = -2.15;
const FLOOR_Y = BENCH_TOP - 0.25;
const MAG_LEN = MAGNET_LENGTH * SCALE; // 1,6
const MAG_SIDE = 0.6;
const WIRE_R = 0.03;
const PITCH = 2.1 * WIRE_R;
const PER_LAYER_MAX = 12;
const FORMER_HALF = 0.48;
const RAIL_X0 = 0.95;
const RAIL_X1 = 6.35;
const GALVO_POS = new THREE.Vector3(-2.75, BENCH_TOP, 1.25);
const GALVO_YAW = 0.28;
/** Drawn turns: ∝ N up to this cap per tier. */
const TURN_CAP = { alta: 48, bilanciata: 32, base: 16 } as const;
const HOME = {
  position: [0.1, 2.9, 11.0] as [number, number, number],
  target: [1.05, -0.65, 0.3] as [number, number, number],
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

/** Paper dial of the centre-zero galvanometer (procedural canvas). */
function dialCanvas(): HTMLCanvasElement {
  const W = 512;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return c;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f6f2e8');
  grad.addColorStop(1, '#e4ddcc');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = 301;
  const R = 226;
  const toXY = (deg: number, r: number): [number, number] => {
    const t = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
  };
  // scale arc
  g.strokeStyle = '#2b2f36';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2 - (50 * Math.PI) / 180, -Math.PI / 2 + (50 * Math.PI) / 180);
  g.stroke();
  // ticks: 20 divisions over ±50° (full scale ±10)
  for (let k = -10; k <= 10; k++) {
    const deg = k * 5;
    const major = k % 5 === 0;
    const [x0, y0] = toXY(deg, R);
    const [x1, y1] = toXY(deg, R - (major ? 26 : 14));
    g.lineWidth = major ? 3.2 : 1.6;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (major) {
      const [tx, ty] = toXY(deg, R - 46);
      g.fillStyle = '#20242a';
      g.font = '600 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(Math.abs(k)), tx, ty);
    }
  }
  g.font = '700 34px system-ui, sans-serif';
  g.fillStyle = '#20242a';
  const [mx, my] = toXY(-56, R + 6);
  const [px, py] = toXY(56, R + 6);
  g.fillText('−', mx, my);
  g.fillText('+', px, py);
  g.font = '600 20px system-ui, sans-serif';
  g.fillStyle = '#4a515c';
  g.fillText('i', cx, cy - 120);
  g.font = '500 15px system-ui, sans-serif';
  g.fillText('fondo scala = 10 divisioni', cx, cy - 92);
  // mirror strip (anti-parallax) under the arc
  g.strokeStyle = 'rgba(120,130,140,0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, R - 62, -Math.PI / 2 - 0.82, -Math.PI / 2 + 0.82);
  g.stroke();
  return c;
}

export function createLenzScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): LenzScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D: banco con un magnete a barra su un carrello, una bobina avvolta a strati collegata a un galvanometro a zero centrale, linee del campo del magnete e del campo indotto calcolate.',
    camera: { ...HOME, fov: 34 },
    controls: { minDistance: 5, maxDistance: 24 },
    floorY: FLOOR_Y,
    shadowRadius: 7,
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

  // --- bench, rail, coil stand -----------------------------------------------------------
  const bench = new THREE.Group();
  scene.add(bench);
  const top = mesh(geo(chamferBox(10.6, 0.25, 4.3, 0.06)), 'darkSteel');
  top.position.set(1.25, BENCH_TOP - 0.125, 0.55);
  const mat2 = mesh(geo(chamferBox(10.2, 0.02, 3.9, 0.01, 1)), 'plastic');
  mat2.position.set(1.25, BENCH_TOP + 0.01, 0.55);
  const rail = mesh(geo(chamferBox(RAIL_X1 - RAIL_X0, 0.12, 0.34, 0.03)), 'darkSteel', 'rail');
  rail.position.set((RAIL_X0 + RAIL_X1) / 2, BENCH_TOP + 0.08, 0);
  const stopGeo = geo(chamferBox(0.1, 0.24, 0.46, 0.03));
  for (const x of [RAIL_X0 - 0.05, RAIL_X1 + 0.05]) {
    const s = mesh(stopGeo, 'darkSteel');
    s.position.set(x, BENCH_TOP + 0.12, 0);
    bench.add(s);
  }
  bench.add(top, mat2, rail);

  // ruler along the rail: cm ticks of the distance z (to scale)
  const ruler = new THREE.Group();
  const rulerBase = mesh(
    geo(chamferBox(RAIL_X1 - RAIL_X0 + 0.3, 0.02, 0.28, 0.008, 1)),
    'plastic',
    'ruler',
  );
  rulerBase.position.set((RAIL_X0 + RAIL_X1) / 2, BENCH_TOP + 0.03, 0.62);
  ruler.add(rulerBase);
  const tickGeo = geo(new THREE.BoxGeometry(0.014, 0.012, 1));
  const nTicks = Math.round(((RAIL_X1 - RAIL_X0) / SCALE) * 100) + 1;
  const ticks = new THREE.InstancedMesh(tickGeo, undefined, nTicks);
  kit.assign(ticks, 'brass', 'ticks');
  {
    const m4 = new THREE.Matrix4();
    const firstCm = Math.ceil((RAIL_X0 / SCALE) * 100);
    for (let k = 0; k < nTicks; k++) {
      const cm = firstCm + k;
      const len = cm % 5 === 0 ? 0.16 : 0.08;
      m4.makeScale(1, 1, len);
      m4.setPosition((cm / 100) * SCALE, BENCH_TOP + 0.046, 0.52 + len / 2);
      ticks.setMatrixAt(k, m4);
    }
    ticks.count = nTicks;
  }
  ruler.add(ticks);
  bench.add(ruler);

  const pedestal = mesh(geo(chamferBox(0.86, 1, 0.62, 0.05)), 'darkSteel');
  bench.add(pedestal);

  // --- coil: translucent former, flanges, layered winding ----------------------------------
  const coil = new THREE.Group();
  coil.name = 'coil';
  scene.add(coil);
  const formerGeo = geo(
    new THREE.CylinderGeometry(1, 1, 2 * FORMER_HALF, 64, 1, true).rotateZ(Math.PI / 2),
  );
  const former = mesh(formerGeo, 'glass');
  former.renderOrder = 4;
  const flangeGeo = geo(new THREE.CylinderGeometry(1, 1, 0.05, 64).rotateZ(Math.PI / 2));
  const flanges = [-1, 1].map((s) => {
    const f = mesh(flangeGeo, 'glass');
    f.position.x = s * (FORMER_HALF + 0.025);
    f.renderOrder = 4;
    return f;
  });
  const hubGeo = geo(new THREE.CylinderGeometry(1, 1, 0.06, 64, 1, true).rotateZ(Math.PI / 2));
  const rims = [-1, 1].map((s) => {
    const r = mesh(hubGeo, 'plastic');
    r.position.x = s * (FORMER_HALF + 0.025);
    return r;
  });
  coil.add(former, ...flanges, ...rims);
  let wire: THREE.Mesh | null = null;
  let coilKey = '';
  let rWire0 = 0.8; // radius of the first layer
  let rOut = 0.9; // outer radius of the winding
  let rFlange = 1.0;
  const wireStart = v();
  const wireEnd = v();

  // --- galvanometer -------------------------------------------------------------------------
  const galvo = new THREE.Group();
  galvo.position.copy(GALVO_POS);
  galvo.rotation.y = GALVO_YAW;
  galvo.scale.setScalar(1.25);
  scene.add(galvo);
  const caseMesh = mesh(geo(chamferBox(1.62, 1.28, 0.62, 0.09)), 'plastic');
  caseMesh.position.y = 0.64;
  const dialTex = new THREE.CanvasTexture(dialCanvas());
  dialTex.colorSpace = THREE.SRGBColorSpace;
  dialTex.anisotropy = 4;
  textures.push(dialTex);
  live.textures++;
  const dialMat = mat(
    new THREE.MeshStandardMaterial({
      map: dialTex,
      emissiveMap: dialTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
      roughness: 0.75,
      metalness: 0,
    }),
  );
  const dial = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.36, 0.86)), dialMat);
  dial.position.set(0, 0.72, 0.312);
  const bezel = mesh(geo(chamferBox(1.46, 0.96, 0.03, 0.012, 1)), 'darkSteel');
  bezel.position.set(0, 0.72, 0.3);
  const cover = mesh(geo(new THREE.PlaneGeometry(1.4, 0.9)), 'glass');
  cover.position.set(0, 0.72, 0.345);
  cover.renderOrder = 5;
  const needlePivot = new THREE.Group();
  needlePivot.position.set(0, 0.72 - 0.43 + 0.05, 0.33);
  const needle = mesh(
    geo(new THREE.BoxGeometry(0.016, 0.66, 0.008).translate(0, 0.33, 0)),
    'glowI',
    'needle',
  );
  const cap = mesh(
    geo(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24).rotateX(Math.PI / 2)),
    'darkSteel',
  );
  needlePivot.add(needle, cap);
  // binding posts on the right-hand side of the case (toward the coil)
  const postGeo = geo(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 20).rotateZ(-Math.PI / 2));
  const knobGeo = geo(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20).rotateZ(-Math.PI / 2));
  const terminals: THREE.Vector3[] = [];
  for (const [k, y] of [0.42, 0.86].entries()) {
    const p = mesh(postGeo, 'brass');
    p.position.set(0.9, y, 0.05);
    const knob = mesh(knobGeo, k === 0 ? 'rubber' : 'darkSteel', 'knob');
    knob.position.set(0.98, y, 0.05);
    galvo.add(p, knob);
    terminals.push(v(1.04, y, 0.05));
  }
  galvo.add(caseMesh, bezel, dial, cover, needlePivot);
  galvo.updateMatrixWorld(true);
  const termW = terminals.map((t) => galvo.localToWorld(t.clone()));

  // --- magnet on its carriage ---------------------------------------------------------------
  const magnet = new THREE.Group();
  magnet.name = 'magnet';
  scene.add(magnet);
  const halfGeo = geo(chamferBox(MAG_LEN / 2 - 0.012, MAG_SIDE, MAG_SIDE, 0.05));
  const near = mesh(halfGeo, 'magnet');
  near.position.x = -MAG_LEN / 4;
  const far = mesh(halfGeo, 'magnet');
  far.position.x = MAG_LEN / 4;
  const seam = mesh(geo(chamferBox(0.03, MAG_SIDE - 0.08, MAG_SIDE - 0.08, 0.01, 1)), 'darkSteel');
  magnet.add(near, far, seam);
  // engraved nameplates (front, top, end face) for both possible orientations
  const plateGeo = geo(new THREE.PlaneGeometry(0.44, 0.44));
  const plates: Record<'N' | 'S', THREE.Mesh[]> = { N: [], S: [] };
  for (const half of [-1, 1] as const) {
    for (const letter of ['N', 'S'] as const) {
      const set: THREE.Mesh[] = [];
      const x = (half * MAG_LEN) / 4;
      const front = mesh(plateGeo, letter === 'N' ? 'magnetN' : 'magnetS');
      front.position.set(x, 0, MAG_SIDE / 2 + 0.004);
      const topP = mesh(plateGeo, letter === 'N' ? 'magnetN' : 'magnetS');
      topP.position.set(x, MAG_SIDE / 2 + 0.004, 0);
      topP.rotation.x = -Math.PI / 2;
      const end = mesh(plateGeo, letter === 'N' ? 'magnetN' : 'magnetS');
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
  const carriage = new THREE.Group();
  scene.add(carriage);
  const sled = mesh(geo(chamferBox(0.72, 0.22, 0.52, 0.05)), 'darkSteel');
  sled.position.y = BENCH_TOP + 0.25;
  const rodLen = -MAG_SIDE / 2 - (BENCH_TOP + 0.36);
  const rod = mesh(geo(new THREE.CylinderGeometry(0.05, 0.05, rodLen, 16)), 'steel');
  rod.position.y = BENCH_TOP + 0.36 + rodLen / 2;
  const saddle = mesh(geo(chamferBox(0.42, 0.06, 0.5, 0.02, 1)), 'darkSteel');
  saddle.position.y = -MAG_SIDE / 2 - 0.03;
  carriage.add(sled, rod, saddle);

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

  stage.castShadows(bench);
  stage.castShadows(coil);
  stage.castShadows(galvo);
  stage.castShadows(magnet);
  stage.castShadows(carriage);
  stage.castShadows(arrow, false);
  former.castShadow = false;
  for (const f of flanges) f.castShadow = false;
  cover.castShadow = false;
  stage.occluders.push(near, far, caseMesh, pedestal);

  // --- leads + current particles ---------------------------------------------------------------
  let leadA: THREE.Mesh | null = null;
  let leadB: THREE.Mesh | null = null;
  const flow: CurrentFlow = createCurrentFlow(stage, {
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: 120,
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
  const indLines: Record<'pos' | 'neg', FieldLines> = {
    pos: createFieldLines(stage, {
      linewidth: 1.35,
      spacing: 0.34,
      speed: 0.7,
      base: 0.1,
      gain: 1.7,
      opacity: 0.85,
    }),
    neg: createFieldLines(stage, {
      linewidth: 1.35,
      spacing: 0.34,
      speed: 0.7,
      base: 0.1,
      gain: 1.7,
      opacity: 0.85,
    }),
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
  const buildCoil = (a: number, N: number): void => {
    const turns = visualTurns(N, TURN_CAP[stage.tier]);
    const R0 = a * SCALE;
    const key = `${R0.toFixed(4)}|${turns}|${stage.tier}`;
    if (key === coilKey) return;
    coilKey = key;
    const { layers, perLayer } = windingLayout(turns, PER_LAYER_MAX);
    rWire0 = R0;
    rOut = R0 + (layers - 1) * PITCH * 0.92 + WIRE_R;
    rFlange = rOut + 0.14;
    former.scale.set(1, R0 - WIRE_R - 0.012, R0 - WIRE_R - 0.012);
    for (const f of flanges) f.scale.set(1, rFlange, rFlange);
    for (const r of rims) r.scale.set(1, rFlange + 0.004, rFlange + 0.004);
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
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const g = geo(
      new THREE.TubeGeometry(curve, pts.length, WIRE_R, stage.tier === 'base' ? 5 : 7, false),
    );
    if (wire) {
      dropGeo(wire.geometry);
      wire.geometry = g;
    } else {
      wire = mesh(g, 'enamel', 'coil');
      coil.add(wire);
      stage.castShadows(wire);
    }
    // pedestal under the flanges
    const pTop = -rFlange + 0.02;
    pedestal.scale.y = Math.max(0.05, pTop - BENCH_TOP);
    pedestal.position.set(0, (pTop + BENCH_TOP) / 2, 0);
    buildLeads();
    traceInduced(R0 + ((layers - 1) * PITCH * 0.92) / 2, 2 * halfLen + PITCH);
  };

  /** Leads from the winding ends (front of the coil) to the galvanometer posts, and the particle loop. */
  const buildLeads = (): void => {
    const zf = rOut + 0.05;
    // lead A: winding start → lower post − (black); lead B: winding end → upper post +
    const ptsA = [
      wireStart.clone(),
      v(wireStart.x, -0.1, zf + 0.25),
      v(wireStart.x - 0.3, BENCH_TOP + 0.08, zf + 0.75),
      v(-1.4, BENCH_TOP + 0.06, 1.85),
      v(
        (termW[0] as THREE.Vector3).x + 0.25,
        BENCH_TOP + 0.6,
        (termW[0] as THREE.Vector3).z + 0.45,
      ),
      (termW[0] as THREE.Vector3).clone(),
    ];
    const ptsB = [
      wireEnd.clone(),
      v(wireEnd.x, -0.15, zf + 0.35),
      v(wireEnd.x - 0.1, BENCH_TOP + 0.08, zf + 0.95),
      v(-0.9, BENCH_TOP + 0.06, 1.95),
      v(
        (termW[1] as THREE.Vector3).x + 0.4,
        BENCH_TOP + 0.75,
        (termW[1] as THREE.Vector3).z + 0.05,
      ),
      (termW[1] as THREE.Vector3).clone(),
    ];
    const tube = (pts: THREE.Vector3[]): THREE.BufferGeometry =>
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          64,
          0.034,
          8,
          false,
        ),
      );
    if (leadA) dropGeo(leadA.geometry);
    if (leadB) dropGeo(leadB.geometry);
    if (!leadA) {
      leadA = mesh(tube(ptsA), 'rubber');
      leadB = mesh(tube(ptsB), 'rubber');
      scene.add(leadA, leadB);
      stage.castShadows(leadA);
      stage.castShadows(leadB);
    } else {
      leadA.geometry = tube(ptsA);
      (leadB as THREE.Mesh).geometry = tube(ptsB);
    }
    // Particle loop: positive i circulates counter-clockwise about +x, i.e. from the winding START to its END.
    // Loop: post − → lead A → start → helix outside the winding → end → lead B → post + (current enters +: needle to the right) → inside the meter → post −.
    const loop: THREE.Vector3[] = [];
    const curveA = new THREE.CatmullRomCurve3(ptsA.slice().reverse(), false, 'centripetal');
    for (let k = 0; k <= 24; k++) loop.push(curveA.getPoint(k / 24));
    const rh = rOut + 0.075;
    const turnsP = 3;
    const steps = turnsP * 28;
    const x0 = wireStart.x;
    const x1 = wireEnd.x;
    for (let k = 1; k < steps; k++) {
      const th = Math.PI / 2 + (2 * Math.PI * turnsP * k) / steps;
      loop.push(v(x0 + ((x1 - x0) * k) / steps, rh * Math.cos(th), rh * Math.sin(th)));
    }
    const curveB = new THREE.CatmullRomCurve3(ptsB, false, 'centripetal');
    for (let k = 0; k <= 24; k++) loop.push(curveB.getPoint(k / 24));
    // inside the meter: from post + down to the movement and back up to post −
    const inner = [v(0.6, 0.86, 0.0), v(0, 0.5, 0.0), v(0.6, 0.42, 0.0)].map((p) =>
      galvo.localToWorld(p),
    );
    loop.push(...inner);
    flow.setPath(loop, true);
  };

  // --- labels ---------------------------------------------------------------------------------------
  const labels = createLabelLayer(stage, overlay);
  const anchors = {
    face: v(),
    coil: v(),
    bMag: v(),
    bInd: v(),
    current: galvo.localToWorld(v(0, 1.75, 0)),
    force: v(),
  };
  const L: Record<keyof typeof anchors, Label> = {
    face: labels.add({
      text: 'faccia N',
      anchor: anchors.face,
      size: 'lg',
      priority: 9,
      occlude: false,
    }),
    current: labels.add({
      text: 'i',
      anchor: anchors.current,
      quantity: 'i',
      priority: 8,
      occlude: false,
    }),
    force: labels.add({
      text: 'F',
      anchor: anchors.force,
      quantity: 'f',
      priority: 7,
      occlude: false,
    }),
    bMag: labels.add({
      text: 'B̄',
      anchor: anchors.bMag,
      quantity: 'b',
      priority: 6,
      occlude: false,
    }),
    bInd: labels.add({
      text: 'B indotto',
      anchor: anchors.bInd,
      quantity: 'b',
      priority: 5,
      occlude: false,
      size: 'sm',
    }),
    coil: labels.add({ text: 'N', anchor: anchors.coil, priority: 4, occlude: false, size: 'sm' }),
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
    buildCoil(f.a, f.N);
    traceMagnet(f.pole);
    if (f.pole !== lastPole) {
      lastPole = f.pole;
      const nearLetter = f.pole;
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

    // force arrow (log length), from the top of the magnet
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
      anchors.force.set(arrow.position.x + sgn * (len + 0.15), arrow.position.y + 0.32, 0);
    }
    kit.get('glowF', 'force').emissiveIntensity = 1.1;

    // label anchors
    anchors.face.set(FORMER_HALF + 0.05, rFlange + 0.42, 0);
    anchors.coil.set(-0.2, -rFlange - 0.1, rFlange + 0.4);
    anchors.bMag.set(Math.max(1.4, xm - MAG_LEN / 2 - 0.55), -1.15, 0.9);
    anchors.bInd.set(-FORMER_HALF - 2.3, 1.2, 0);
    L.face.setVisible(f.sign !== 0);
    L.bInd.setVisible(showInd);
    L.force.setVisible(arrow.visible);
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
      for (const t of textures.splice(0)) {
        t.dispose();
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
