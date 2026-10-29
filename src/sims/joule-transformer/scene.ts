/**
 * Three.js scene of `joule-transformer`, built on the render foundation (D14):
 * the whole transport chain as a technical-museum diorama —
 * power-station hall with the generator → step-up transformer (laminated core,
 * primary and secondary windings, optional oil-tank cut-away) → HV line on
 * lattice pylons → step-down transformer → a small town whose lit windows follow
 * the delivered power.
 *
 * What is physics and what is illustration (scales in ./visual.ts, stated in the
 * legend and the model note):
 *  - winding turns: N₁ : N₂ drawn in proportion (≤ 24 rings); wire radius ∝ √I
 *    (equal current density): the low-voltage winding is visibly thicker;
 *  - core flux: closed loops in the core, how many ∝ Φ̂ = √2·V/(2π f N), pulses
 *    reverse with Φ(t) = Φ̂·cos ωt (50 Hz played 200× slower, ideal core);
 *  - current: particles in each section (generator, line, town), velocity ∝ the
 *    instantaneous current √2·I·sin ωt of THAT section (same scale everywhere), so
 *    the HV line visibly carries ~N₁/N₂ of the generator current;
 *  - line conductors: catenary computed for the conductor temperature (lumped
 *    thermal model fed by R'·I² per metre, ./visual.ts): a hot line sags more; a
 *    labelled false-colour overlay shows the temperature (no fake incandescence:
 *    an overhead line never glows); in `alta` a faint heat haze ∝ R'·I²;
 *  - town: one lit window per 0,5 MW delivered (P − R·I²).
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  chamferBox,
  createCurrentFlow,
  createFieldLines,
  createLabelLayer,
  createStage,
  ironbow,
  type CurrentFlow,
  type FieldLines,
  type Label,
  type MaterialKind,
  type Stage,
  type StageInfo,
  type TracedLine,
} from '../../render';
import { visualTurns } from './model';
import {
  AC_VISUAL_HZ,
  FLUX_LOOPS,
  HAZE_REF_W_PER_M,
  PARTICLE_SPEED_PER_AMP,
  PARTICLE_VMAX,
  SAG_DRAW,
  TOTAL_WINDOWS,
  T_SCALE_C,
  fluxFraction,
  sceneStats,
  wireRadius,
} from './visual';

export interface SceneTexts {
  plant: string;
  stepUp: string;
  core: string;
  line: string;
  loss: string;
  sag: string;
  stepDown: string;
  town: string;
}

export interface SceneView {
  N1: number;
  N2: number;
  /** RMS currents of the three sections [A]. */
  I1: number;
  Iline: number;
  Iout: number;
  /** Peak core flux of the step-up / step-down transformers [Wb]. */
  phiUp: number;
  phiDown: number;
  /** Conductor temperature [K] and the resulting sag [m]. */
  T: number;
  sag: number;
  /** Joule heat per metre of conductor [W/m]. */
  heatPerMetre: number;
  /** Lit windows. */
  lit: number;
  /** Simulation time for the AC phase [s]. */
  t: number;
  thermal: boolean;
  tank: boolean;
  texts: SceneTexts;
}

export interface SceneInfo extends StageInfo {
  labels: { labels: number; nudged: number; occluded: number; overlaps: number };
  fluxLoops: number;
  lit: number;
  sagDrawn: number;
  frames: number;
}

export interface TransformerScene {
  readonly stage: Stage;
  update(v: SceneView): void;
  render(): void;
  /** Compile every program and upload every texture now (deterministic GPU counters). */
  prewarm(): void;
  info(): SceneInfo;
  dispose(): void;
}

// --- layout (scene units; not to scale) ---------------------------------------------------
const GROUND = 0;
const UP_X = -7.4;
const DOWN_X = 7.4;
const PYLONS = [-4.7, -1.55, 1.55, 4.7] as const;
const PLANT_X = -11.5;
const TOWN_DX = -1.4; // town blocks shift
const PYLON_H = 4.7;
const ARM_Y = 4.25;
const ATTACH_Y = 3.88; // conductor clamp under the insulator string
const PHASE_Z = 0.72;
const CORE = { w: 1.9, h: 2.1, t: 0.36, d: 0.62, y: 1.52 };
const LIMB_X = CORE.w / 2 - CORE.t / 2;
const COIL_H = 1.25;
const BUSHING_TOP = 3.55;
const HOME = {
  position: [-7.6, 6.0, 18.6] as [number, number, number],
  target: [-0.4, 2.1, -0.4] as [number, number, number],
};

/** A transformer group: core, windings (rebuilt), flux loops, tank. */
interface Xfmr {
  group: THREE.Group;
  tank: THREE.Group;
  flux: FieldLines;
  /** Winding helix points (world), left and right limb, top → bottom. */
  left: THREE.Vector3[];
  right: THREE.Vector3[];
  key: string;
  windings: THREE.Mesh[];
}

export function createTransformerScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): TransformerScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D della catena di trasporto: centrale con generatore, trasformatore elevatore con nucleo laminato e avvolgimenti, linea ad alta tensione su tralicci con conduttori a catenaria, trasformatore abbassatore e quartiere con finestre illuminate in proporzione alla potenza consegnata.',
    camera: { ...HOME, fov: 36, far: 200 },
    controls: { minDistance: 6, maxDistance: 46, maxPolarAngle: (82 * Math.PI) / 180 },
    floorY: GROUND,
    floor: { radius: 30 },
    shadowRadius: 16,
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

  // --- power station: hall + generator ----------------------------------------------------
  const plant = new THREE.Group();
  plant.position.set(PLANT_X, GROUND, -0.2);
  scene.add(plant);
  {
    const hall = mesh(geo(chamferBox(3.0, 2.3, 2.4, 0.06)), 'magnet', 'hall');
    hall.position.set(-0.3, 1.15, -0.9);
    const roof = mesh(geo(chamferBox(3.2, 0.14, 2.6, 0.04)), 'darkSteel');
    roof.position.set(-0.3, 2.37, -0.9);
    const band = mesh(geo(chamferBox(2.6, 0.32, 0.02, 0.01)), 'glass', 'hall');
    band.position.set(-0.3, 1.75, 0.31);
    const stack = mesh(geo(new THREE.CylinderGeometry(0.16, 0.22, 2.0, tess(20))), 'darkSteel');
    stack.position.set(-1.35, 3.35, -1.55);
    const plinth = mesh(geo(chamferBox(2.6, 0.3, 1.2, 0.04)), 'darkSteel', 'plinth');
    plinth.position.set(-0.2, 0.15, 0.85);
    // generator stator with cooling ribs (lathe), turbine casing, shaft
    const prof: THREE.Vector2[] = [new THREE.Vector2(0, -0.8)];
    for (let k = 0; k <= 8; k++) {
      const y = -0.72 + (k * 1.44) / 8;
      prof.push(
        new THREE.Vector2(0.5, y - 0.05),
        new THREE.Vector2(0.56, y),
        new THREE.Vector2(0.5, y + 0.05),
      );
    }
    prof.push(new THREE.Vector2(0.44, 0.8), new THREE.Vector2(0, 0.8));
    const gen = mesh(
      geo(new THREE.LatheGeometry(prof, tess(40)).rotateZ(Math.PI / 2)),
      'iron',
      'gen',
    );
    gen.position.set(0.25, 0.92, 0.85);
    const turb = mesh(
      geo(
        new THREE.LatheGeometry(
          [v(0, -0.6), v(0.3, -0.6), v(0.48, 0.2), v(0.42, 0.6), v(0, 0.6)].map(
            (p) => new THREE.Vector2(p.x, p.y),
          ),
          tess(32),
        ).rotateZ(Math.PI / 2),
      ),
      'darkSteel',
      'turbine',
    );
    turb.position.set(-1.05, 0.92, 0.85);
    const shaft = mesh(
      geo(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 16).rotateZ(Math.PI / 2)),
      'steel',
    );
    shaft.position.set(-0.2, 0.92, 0.85);
    const tbox = mesh(geo(chamferBox(0.4, 0.26, 0.36, 0.03)), 'darkSteel');
    tbox.position.set(0.55, 1.58, 0.85);
    plant.add(hall, roof, band, stack, plinth, gen, turb, shaft, tbox);
    stage.occluders.push(hall, gen);
  }
  const genTerm = [v(PLANT_X + 0.7, 1.72, 0.75), v(PLANT_X + 0.7, 1.72, 0.95)];

  // --- transformers ------------------------------------------------------------------------------
  const coreGeoV = geo(chamferBox(CORE.t, CORE.h, CORE.d, 0.025));
  const coreGeoH = geo(chamferBox(CORE.w - 2 * CORE.t + 0.002, CORE.t, CORE.d, 0.025));
  const plinthGeo = geo(chamferBox(3.1, 0.22, 2.0, 0.04));
  const wallBack = geo(chamferBox(2.9, 2.85, 0.06, 0.02));
  const wallSide = geo(chamferBox(0.06, 2.85, 1.5, 0.02));
  const lidGeo = geo(chamferBox(2.9, 0.08, 1.5, 0.02));
  const oilGeo = geo(new THREE.BoxGeometry(2.78, 2.55, 1.38));
  const finGeo = geo(chamferBox(0.04, 2.1, 0.5, 0.01));
  const bushingGeo = geo(
    new THREE.LatheGeometry(
      (() => {
        const p: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
        for (let k = 0; k < 7; k++) {
          const y = 0.06 + k * 0.1;
          p.push(
            new THREE.Vector2(0.07, y),
            new THREE.Vector2(0.15, y + 0.03),
            new THREE.Vector2(0.07, y + 0.07),
          );
        }
        p.push(new THREE.Vector2(0.05, 0.82), new THREE.Vector2(0, 0.82));
        return p;
      })(),
      tess(20),
    ),
  );
  const oilMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xc8962e,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      roughness: 0.2,
    }),
  );

  const makeXfmr = (x: number, mirror: boolean): Xfmr => {
    const group = new THREE.Group();
    group.position.set(x, GROUND, 0);
    scene.add(group);
    const plinth = mesh(plinthGeo, 'darkSteel', 'plinth');
    plinth.position.y = 0.11;
    group.add(plinth);
    for (const s of [-1, 1]) {
      const limb = mesh(coreGeoV, 'iron', 'core');
      limb.position.set(s * LIMB_X, CORE.y, 0);
      const yoke = mesh(coreGeoH, 'iron', 'core');
      yoke.position.set(0, CORE.y + s * (CORE.h / 2 - CORE.t / 2), 0);
      group.add(limb, yoke);
      stage.occluders.push(limb, yoke);
    }
    // oil tank, cut away at the front: back, sides, lid with bushings, radiator fins, oil
    const tank = new THREE.Group();
    const back = mesh(wallBack, 'plastic', 'tank');
    back.position.set(0, 1.645, -0.72);
    tank.add(back);
    for (const s of [-1, 1]) {
      const side = mesh(wallSide, 'plastic', 'tank');
      side.position.set(s * 1.42, 1.645, 0);
      tank.add(side);
    }
    const lid = mesh(lidGeo, 'plastic', 'tank');
    lid.position.set(0, 3.11, 0);
    tank.add(lid);
    const oil = new THREE.Mesh(oilGeo, oilMat);
    oil.position.set(0, 1.55, 0);
    oil.renderOrder = 1;
    tank.add(oil);
    for (let k = 0; k < 6; k++) {
      const fin = mesh(finGeo, 'plastic', 'tank');
      fin.position.set((mirror ? -1 : 1) * 1.62, 1.6, -0.55 + k * 0.22);
      tank.add(fin);
    }
    group.add(tank);
    // bushings: HV side (line) and LV side
    const hvSide = mirror ? -1 : 1;
    for (const [sx, z] of [
      [hvSide * 0.75, 0.3],
      [hvSide * 0.75, -0.3],
      [-hvSide * 0.75, 0.3],
      [-hvSide * 0.75, -0.3],
    ] as const) {
      const b = mesh(bushingGeo, 'ceramic', 'bushing');
      b.position.set(sx, 3.15, z);
      const s = Math.abs(sx) > 0 && Math.sign(sx) === hvSide ? 1 : 0.7;
      b.scale.set(s, s, s);
      group.add(b);
    }
    const flux = createFieldLines(stage, {
      linewidth: 2.2,
      spacing: 0.5,
      speed: 1.1,
      base: 0.5,
      gain: 2.0,
    });
    group.add(flux.object);
    // flux loops on the front lamination: nested rounded rectangles inside the core frame
    const loops: TracedLine[] = [];
    const order = [5, 2, 8, 0, 10, 3, 7, 1, 11, 4, 9, 6]; // spread: any prefix is even
    for (const k of order.slice(0, FLUX_LOOPS)) {
      const inset = 0.035 + ((CORE.t - 0.07) * (k + 0.5)) / FLUX_LOOPS;
      const hw = CORE.w / 2 - inset;
      const hh = CORE.h / 2 - inset;
      const rc = Math.max(0.03, CORE.t - inset);
      const pts: THREE.Vector3[] = [];
      const corner = (cx: number, cy: number, a0: number): void => {
        for (let j = 0; j <= 6; j++) {
          const a = a0 + (j / 6) * (Math.PI / 2);
          pts.push(v(cx + rc * Math.cos(a), CORE.y + cy + rc * Math.sin(a), CORE.d / 2 + 0.012));
        }
      };
      // counter-clockwise seen from +z: up the right limb
      corner(hw - rc, hh - rc, 0);
      corner(-hw + rc, hh - rc, Math.PI / 2);
      corner(-hw + rc, -hh + rc, Math.PI);
      corner(hw - rc, -hh + rc, (3 * Math.PI) / 2);
      pts.push(pts[0]!.clone());
      const n = pts.length;
      const points = new Float32Array(3 * n);
      const mags = new Float32Array(n).fill(1);
      const arc = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = pts[i] as THREE.Vector3;
        points.set([p.x, p.y, p.z], 3 * i);
        if (i > 0) arc[i] = (arc[i - 1] as number) + p.distanceTo(pts[i - 1] as THREE.Vector3);
      }
      loops.push({ points, mags, arc, count: n, closed: true, reason: 'closed' });
    }
    flux.setLines(loops);
    return { group, tank, flux, left: [], right: [], key: '', windings: [] };
  };
  const up = makeXfmr(UP_X, false);
  const down = makeXfmr(DOWN_X, true);

  /** Helix around a limb (axis y), top → bottom, `turns` rings, in world coordinates. */
  const helix = (x: number, limbX: number, turns: number, r: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    const per = Math.max(10, Math.round(16 * stage.settings.tessellation));
    const n = turns * per;
    const y0 = CORE.y + COIL_H / 2;
    for (let k = 0; k <= n; k++) {
      const a = (k / per) * 2 * Math.PI;
      pts.push(v(x + limbX + r * Math.sin(a), y0 - (k / n) * COIL_H, r * Math.cos(a)));
    }
    return pts;
  };
  const buildWindings = (
    x: Xfmr,
    nLeft: number,
    nRight: number,
    rLeft: number,
    rRight: number,
  ): boolean => {
    const key = `${nLeft}|${nRight}|${rLeft.toFixed(3)}|${rRight.toFixed(3)}|${stage.tier}`;
    if (key === x.key) return false;
    x.key = key;
    for (const w of x.windings) {
      x.group.remove(w);
      dropGeo(w.geometry);
    }
    x.windings.length = 0;
    const R = CORE.t * 0.72 + 0.05;
    const gx = x.group.position.x;
    x.left = helix(gx, -LIMB_X, nLeft, R + rLeft);
    x.right = helix(gx, LIMB_X, nRight, R + rRight);
    for (const [pts, r, kind] of [
      [x.left, rLeft, 'enamel'],
      [x.right, rRight, 'enamel'],
    ] as const) {
      const local = pts.map((p) => p.clone().sub(x.group.position));
      const curve = new THREE.CatmullRomCurve3(local);
      const g = geo(
        new THREE.TubeGeometry(
          curve,
          Math.min(900, pts.length * 2),
          r,
          stage.tier === 'base' ? 5 : 8,
        ),
      );
      const m = mesh(g, kind, 'winding');
      m.castShadow = stage.tier !== 'base';
      x.group.add(m);
      x.windings.push(m);
    }
    return true;
  };

  // --- pylons (instanced lattice members) ---------------------------------------------------------
  const members: Array<[THREE.Vector3, THREE.Vector3, number]> = [];
  const legAt = (y: number): number => 0.62 - (0.44 * y) / PYLON_H; // half-width of the tower
  for (const px of PYLONS) {
    const levels = [0, 0.9, 1.75, 2.5, 3.2, 3.85, PYLON_H];
    const c = (sx: number, sz: number, y: number): THREE.Vector3 =>
      v(px + sx * legAt(y), GROUND + y, sz * legAt(y));
    const corners: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let l = 0; l < levels.length - 1; l++) {
      const y0 = levels[l] as number;
      const y1 = levels[l + 1] as number;
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k] as [number, number];
        const [bx, bz] = corners[(k + 1) % 4] as [number, number];
        members.push([c(ax, az, y0), c(ax, az, y1), 0.045]); // leg
        members.push([c(ax, az, y1), c(bx, bz, y1), 0.022]); // horizontal
        members.push([c(ax, az, y0), c(bx, bz, y1), 0.016]); // diagonals (X)
        members.push([c(bx, bz, y0), c(ax, az, y1), 0.016]);
      }
    }
    // cross-arm (along z) with bracing, and the earth-wire peak
    for (const sx of [-1, 1]) {
      members.push([v(px + sx * 0.16, ARM_Y, -1.0), v(px + sx * 0.16, ARM_Y, 1.0), 0.03]);
      for (const sz of [-1, 1]) {
        members.push([
          v(px + sx * 0.16, ARM_Y, sz * 1.0),
          v(px + sx * 0.2, ARM_Y - 0.5, sz * 0.25),
          0.018,
        ]);
        members.push([
          v(px + sx * 0.16, ARM_Y, sz * 1.0),
          v(px + sx * 0.16, ARM_Y + 0.25, sz * 0.2),
          0.018,
        ]);
      }
    }
    members.push([v(px, PYLON_H, 0), v(px, PYLON_H + 0.45, 0), 0.03]);
  }
  const memberGeo = geo(new THREE.BoxGeometry(1, 1, 1));
  const lattice = new THREE.InstancedMesh(memberGeo, undefined, members.length);
  kit.assign(lattice, 'steel', 'pylon');
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = v(0, 1, 0);
    const d = v();
    const mid = v();
    const s = v();
    members.forEach(([a, b, w], i) => {
      d.subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(yAxis, d.normalize());
      mid.addVectors(a, b).multiplyScalar(0.5);
      s.set(w, len, w);
      lattice.setMatrixAt(i, m4.compose(mid, q, s));
    });
    lattice.instanceMatrix.needsUpdate = true;
    lattice.computeBoundingSphere();
  }
  scene.add(lattice);
  // insulator strings (cap-and-pin discs) at the cross-arm ends
  const insulatorGeo = geo(
    new THREE.LatheGeometry(
      (() => {
        const p: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
        for (let k = 0; k < 5; k++) {
          const y = -0.02 - k * 0.07;
          p.push(
            new THREE.Vector2(0.025, y),
            new THREE.Vector2(0.09, y - 0.02),
            new THREE.Vector2(0.025, y - 0.05),
          );
        }
        p.push(new THREE.Vector2(0, -0.37));
        return p;
      })(),
      tess(16),
    ),
  );
  const insulators = new THREE.InstancedMesh(insulatorGeo, undefined, PYLONS.length * 2);
  kit.assign(insulators, 'glass', 'insulator');
  {
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (const px of PYLONS) {
      for (const sz of [-1, 1])
        insulators.setMatrixAt(i++, m4.makeTranslation(px, ARM_Y, sz * PHASE_Z));
    }
    insulators.instanceMatrix.needsUpdate = true;
    insulators.computeBoundingSphere();
  }
  scene.add(insulators);

  // --- line conductors (catenary, rebuilt when the drawn sag changes) ----------------------------
  const bushingTop = (x: Xfmr, side: 1 | -1, z: number): THREE.Vector3 =>
    v(x.group.position.x + side * 0.75, BUSHING_TOP + 0.3, z);
  const upHV = (z: number): THREE.Vector3 => bushingTop(up, 1, z);
  const downHV = (z: number): THREE.Vector3 => bushingTop(down, 1, z);
  const lineGroup = new THREE.Group();
  scene.add(lineGroup);
  const conductorMeshes: THREE.Mesh[] = [];
  const thermalMeshes: THREE.Mesh[] = [];
  let lineGeos: THREE.BufferGeometry[] = [];
  /** Conductor polyline for phase z (from the step-up bushing to the step-down bushing). */
  let phasePts: Record<'go' | 'ret', THREE.Vector3[]> = { go: [], ret: [] };
  let sagDrawn = -1;
  const spanPoints = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    sag: number,
    n: number,
  ): THREE.Vector3[] => {
    const out: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      // parabola-shaped drop scaled to the drawn sag: the catenary of the real span is
      // computed in ./visual (sagAt); at S/a ≈ 0,2 its shape differs from 4u(1−u) by < 0,1 %
      const p = new THREE.Vector3().lerpVectors(a, b, u);
      p.y -= sag * 4 * u * (1 - u);
      out.push(p);
    }
    return out;
  };
  const buildLine = (sagM: number): void => {
    const drawn = sagM * SAG_DRAW;
    if (Math.abs(drawn - sagDrawn) < 0.004) return;
    sagDrawn = drawn;
    for (const m of [...conductorMeshes, ...thermalMeshes]) lineGroup.remove(m);
    conductorMeshes.length = 0;
    thermalMeshes.length = 0;
    for (const g of lineGeos) dropGeo(g);
    lineGeos = [];
    const segs = Math.round(24 * stage.settings.tessellation) + 8;
    for (const [key, z] of [
      ['go', PHASE_Z],
      ['ret', -PHASE_Z],
    ] as const) {
      const pts: THREE.Vector3[] = [];
      const a0 = upHV(z * 0.42);
      const p0 = v(PYLONS[0], ATTACH_Y, z);
      pts.push(...spanPoints(a0, p0, 0.12, 8));
      for (let k = 0; k < PYLONS.length - 1; k++) {
        const a = v(PYLONS[k], ATTACH_Y, z);
        const b = v(PYLONS[k + 1], ATTACH_Y, z);
        pts.push(...spanPoints(a, b, drawn, segs).slice(1));
      }
      const pn = v(PYLONS[PYLONS.length - 1], ATTACH_Y, z);
      pts.push(...spanPoints(pn, downHV(z * 0.42), 0.12, 8).slice(1));
      phasePts[key] = pts;
      const g = geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          pts.length * 2,
          0.036,
          stage.tier === 'base' ? 5 : 8,
        ),
      );
      lineGeos.push(g);
      const al = mesh(g, 'steel', 'conductor');
      const th = mesh(g, 'plastic', 'thermal');
      th.visible = false;
      al.castShadow = th.castShadow = false;
      lineGroup.add(al, th);
      conductorMeshes.push(al);
      thermalMeshes.push(th);
    }
    phasePts = { ...phasePts };
    lineFlow.setPath(
      [...phasePts.go, ...[...downWinding()], ...[...phasePts.ret].reverse(), ...upWinding()],
      true,
    );
  };

  // --- heat haze above the spans (alta only): faint wavy streaks ∝ R'·I² ----------------------
  const hazeMat = mat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color(0xffc68a) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAmount; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float w = sin(vUv.x * 60.0 + sin(vUv.y * 9.0 - uTime * 2.3) * 2.2 - uTime * 0.7);
          float s = smoothstep(0.9, 1.0, w) * (1.0 - vUv.y) * smoothstep(0.0, 0.15, vUv.y);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          gl_FragColor = vec4(uColor * s * edge * uAmount, 1.0);
        }`,
    }),
  );
  const hazeGeo = geo(new THREE.PlaneGeometry(PYLONS[3] - PYLONS[0], 0.7));
  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.position.set(0, ATTACH_Y - 0.15, 0);
  haze.renderOrder = 5;
  scene.add(haze);

  // --- low-voltage feeder and town ------------------------------------------------------------------
  const town = new THREE.Group();
  scene.add(town);
  const blocks: Array<[number, number, number, number, number]> = [
    // x, z, w, d, h
    [11.0 + TOWN_DX, -0.9, 1.0, 1.0, 2.9],
    [12.4 + TOWN_DX, -1.0, 1.2, 0.9, 1.9],
    [13.7 + TOWN_DX, -0.8, 0.9, 1.1, 3.4],
    [11.3 + TOWN_DX, 1.0, 1.1, 0.9, 1.5],
    [12.7 + TOWN_DX, 1.05, 1.0, 1.0, 2.4],
    [14.0 + TOWN_DX, 1.1, 1.0, 0.9, 1.7],
  ];
  const blockGeo = geo(chamferBox(1, 1, 1, 0.03));
  const windowsAt: THREE.Matrix4[] = [];
  for (const [bx, bz, w, d, h] of blocks) {
    const b = mesh(blockGeo, 'magnet', 'town');
    b.scale.set(w, h, d);
    b.position.set(bx, GROUND + h / 2, bz);
    const roof = mesh(blockGeo, 'darkSteel', 'roof');
    roof.scale.set(w + 0.06, 0.08, d + 0.06);
    roof.position.set(bx, GROUND + h + 0.04, bz);
    town.add(b, roof);
    // windows on the front (+z) and the left (−x) face, facing the camera
    const rows = Math.floor((h - 0.3) / 0.34);
    const colsF = Math.floor((w - 0.16) / 0.22);
    const colsS = Math.floor((d - 0.16) / 0.22);
    for (let r = 0; r < rows; r++) {
      const y = GROUND + 0.38 + r * 0.34;
      for (let c = 0; c < colsF; c++) {
        const x = bx - ((colsF - 1) * 0.22) / 2 + c * 0.22;
        windowsAt.push(new THREE.Matrix4().makeTranslation(x, y, bz + d / 2 + 0.006));
      }
      for (let c = 0; c < colsS; c++) {
        const z = bz - ((colsS - 1) * 0.22) / 2 + c * 0.22;
        windowsAt.push(
          new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(bx - w / 2 - 0.006, y, z),
        );
      }
    }
  }
  // a deterministic shuffle: lighting n windows lights them across the whole town
  let seed = 7;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = windowsAt.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [windowsAt[i], windowsAt[j]] = [windowsAt[j] as THREE.Matrix4, windowsAt[i] as THREE.Matrix4];
  }
  const nWindows = Math.min(TOTAL_WINDOWS, windowsAt.length);
  const windowGeo = geo(new THREE.PlaneGeometry(0.12, 0.17));
  const windowMat = mat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const windows = new THREE.InstancedMesh(windowGeo, windowMat, nWindows);
  for (let i = 0; i < nWindows; i++) windows.setMatrixAt(i, windowsAt[i] as THREE.Matrix4);
  windows.instanceMatrix.needsUpdate = true;
  const litCol = new THREE.Color();
  const darkCol = new THREE.Color();
  let litShown = -1;
  const paintWindows = (lit: number): void => {
    const dark = stage.theme === 'dark';
    litCol.setHex(0xffcf7a).multiplyScalar(stage.settings.post ? 2.4 : 1.15);
    darkCol.setHex(dark ? 0x1a222c : 0x56606c);
    for (let i = 0; i < nWindows; i++) windows.setColorAt(i, i < lit ? litCol : darkCol);
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    litShown = lit;
  };
  paintWindows(0);
  town.add(windows);
  // feeder poles + low-voltage wires from the step-down LV bushings to the town
  const poleGeo = geo(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 10));
  for (const z of [0.5, -0.5]) {
    const p = mesh(poleGeo, 'darkSteel', 'pole');
    p.position.set(DOWN_X + 1.6, GROUND + 1.3, z * 1.25);
    town.add(p);
  }
  const lvPath = (z: number): THREE.Vector3[] => [
    bushingTop(down, -1, z * 0.42),
    v(DOWN_X - 0.75, BUSHING_TOP + 0.55, z * 0.42),
    v(DOWN_X + 1.6, 2.62, z * 1.04),
    v(DOWN_X + 2.2, 2.35, z * 0.62),
    v(DOWN_X + 2.6, 2.2, z * 0.62),
  ];
  const lvGeo = (z: number): THREE.TubeGeometry =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lvPath(z)), 40, 0.022, 6);
  for (const z of [0.6, -0.6]) town.add(mesh(geo(lvGeo(z)), 'copper', 'lv'));

  // generator → step-up primary leads
  const genLead = (z: number): THREE.Vector3[] => [
    genTerm[z > 0 ? 1 : 0] as THREE.Vector3,
    v(PLANT_X + 1.5, 2.25, z * 0.5),
    v(UP_X - 1.9, 3.0, z * 0.42),
    bushingTop(up, -1, z * 0.42),
  ];
  for (const z of [0.6, -0.6]) {
    const lead = mesh(
      geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(genLead(z)), 40, 0.035, 8)),
      'copper',
      'lead',
    );
    scene.add(lead);
  }

  // --- current flows (one per section, same velocity scale) --------------------------------------
  const pd = stage.settings.particleDensity;
  const flowOpts = { speedPerAmp: PARTICLE_SPEED_PER_AMP, vMax: PARTICLE_VMAX, smooth: false };
  const upWinding = (): THREE.Vector3[] => up.right.slice().reverse();
  const downWinding = (): THREE.Vector3[] => down.left;
  const lineFlow: CurrentFlow = createCurrentFlow(stage, {
    ...flowOpts,
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: Math.round(240 * Math.max(0.5, pd)),
    radius: 0.045,
  });
  const genFlow: CurrentFlow = createCurrentFlow(stage, {
    ...flowOpts,
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: Math.round(110 * Math.max(0.5, pd)),
    radius: 0.05,
  });
  const townFlow: CurrentFlow = createCurrentFlow(stage, {
    ...flowOpts,
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: Math.round(110 * Math.max(0.5, pd)),
    radius: 0.05,
  });
  const setSectionPaths = (): void => {
    // generator loop: lead (+) → primary winding (top → bottom) → lead (−) back
    genFlow.setPath([...genLead(0.6), ...up.left, ...genLead(-0.6).reverse()], true);
    // town loop: step-down LV winding → feeder → town and back
    townFlow.setPath([...lvPath(0.6).reverse(), ...down.right, ...lvPath(-0.6)], true);
  };

  // --- labels ------------------------------------------------------------------------------------------
  const labels = createLabelLayer(stage, overlay, { occlude: false });
  const A = {
    plant: v(PLANT_X, 3.0, 0.3),
    stepUp: v(UP_X, 4.25, 0.4),
    core: v(UP_X - 0.2, 0.55, 1.1),
    line: v(-3.6, 3.3, 0.9),
    loss: v(3.6, 3.15, 0.9),
    sag: v(0, ATTACH_Y - 0.9, PHASE_Z),
    stepDown: v(DOWN_X, 4.25, 0.4),
    town: v(12.6 + TOWN_DX, 3.9, 0.2),
  };
  const L: Record<keyof SceneTexts, Label> = {
    plant: labels.add({ text: 'Centrale', anchor: A.plant, quantity: 'emf', priority: 8 }),
    stepUp: labels.add({ text: 'Elevatore', anchor: A.stepUp, priority: 7 }),
    core: labels.add({ text: 'Φ', anchor: A.core, quantity: 'b', priority: 6, size: 'sm' }),
    line: labels.add({ text: 'Linea', anchor: A.line, quantity: 'i', priority: 9 }),
    loss: labels.add({ text: 'Joule', anchor: A.loss, quantity: 'energy', priority: 8 }),
    sag: labels.add({ text: 'freccia', anchor: A.sag, priority: 3, size: 'sm', offset: [0, 22] }),
    stepDown: labels.add({ text: 'Abbassatore', anchor: A.stepDown, priority: 7 }),
    town: labels.add({ text: 'Utenze', anchor: A.town, quantity: 'energy', priority: 8 }),
  };

  stage.castShadows(plant);
  stage.castShadows(up.group);
  stage.castShadows(down.group);
  stage.castShadows(town);
  lattice.castShadow = true;

  const offTier = stage.onTierChange(() => {
    up.key = down.key = '';
    sagDrawn = -1;
    litShown = -1;
  });
  const offTheme = stage.onThemeChange(() => {
    litShown = -1;
  });

  // --- per-frame ---------------------------------------------------------------------------------------
  const rgb: [number, number, number] = [0, 0, 0];
  let frames = 0;
  let lastLit = 0;
  let lastSag = Number.NaN;
  let wiresChanged = false;
  const update = (s: SceneView): void => {
    // windings: turns ∝ N, wire radius ∝ √I (equal current density); reference: I₁ → 0,05
    const vt = visualTurns(s.N1, s.N2);
    const Iref = Math.max(s.I1, s.Iline, 1e-9);
    const r1 = wireRadius(s.I1, Iref, 0.055, 0.012, 0.055);
    const r2 = wireRadius(s.Iline, Iref, 0.055, 0.012, 0.055);
    wiresChanged = buildWindings(up, vt.n1, vt.n2, r1, r2) || wiresChanged;
    wiresChanged =
      buildWindings(down, vt.n2, vt.n1, r2, wireRadius(s.Iout, Iref, 0.055, 0.012, 0.055)) ||
      wiresChanged;
    if (wiresChanged || s.sag !== lastSag) {
      const before = sagDrawn;
      if (wiresChanged) sagDrawn = -1;
      buildLine(s.sag);
      if (wiresChanged || before !== sagDrawn) setSectionPaths();
      wiresChanged = false;
      lastSag = s.sag;
    }
    // AC: instantaneous currents √2·I·sin ωt, flux Φ̂·cos ωt (same phase reference)
    const w = 2 * Math.PI * AC_VISUAL_HZ * s.t;
    const sn = Math.SQRT2 * Math.sin(w);
    genFlow.setCurrent(s.I1 * sn);
    lineFlow.setCurrent(s.Iline * sn);
    townFlow.setCurrent(s.Iout * sn);
    const c = Math.cos(w);
    up.flux.setFraction(fluxFraction(s.phiUp));
    down.flux.setFraction(fluxFraction(s.phiDown));
    up.flux.setFlow(1.4 * c);
    down.flux.setFlow(1.4 * c);
    // tank cut-away
    up.tank.visible = down.tank.visible = s.tank;
    // conductor: aluminium or false colour (ironbow over 20 … 120 °C)
    for (const m of conductorMeshes) m.visible = !s.thermal;
    for (const m of thermalMeshes) m.visible = s.thermal;
    if (s.thermal) {
      const x = (s.T - 273.15 - T_SCALE_C[0]) / (T_SCALE_C[1] - T_SCALE_C[0]);
      ironbow(x, rgb);
      const m = kit.get('plastic', 'thermal');
      m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissive.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      m.emissiveIntensity = 0.55;
    }
    // heat haze (alta): amount ∝ R'·I² / reference
    haze.visible = stage.tier === 'alta' && s.heatPerMetre > 0.5;
    const u = hazeMat.uniforms as Record<string, { value: number }>;
    (u['uTime'] as { value: number }).value = s.t;
    (u['uAmount'] as { value: number }).value =
      Math.min(1, s.heatPerMetre / HAZE_REF_W_PER_M) * 0.28;
    // town windows ∝ delivered power
    if (s.lit !== litShown) paintWindows(s.lit);
    lastLit = s.lit;
    // labels
    A.sag.set(0, ATTACH_Y - sagDrawn - 0.05, PHASE_Z);
    const t = s.texts;
    L.plant.setText(t.plant);
    L.stepUp.setText(t.stepUp);
    L.core.setText(t.core);
    L.line.setText(t.line);
    L.loss.setText(t.loss);
    L.sag.setText(t.sag);
    L.stepDown.setText(t.stepDown);
    L.town.setText(t.town);
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
      fluxLoops: up.flux.shown,
      lit: lastLit,
      sagDrawn,
      frames,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      offTier();
      offTheme();
      labels.dispose();
      for (const f of [lineFlow, genFlow, townFlow]) f.dispose();
      up.flux.dispose();
      down.flux.dispose();
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
