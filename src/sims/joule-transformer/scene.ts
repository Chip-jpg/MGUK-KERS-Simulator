/**
 * Three.js scene of `joule-transformer` (teardown look, `look: 'teardown'`): the whole
 * transport chain as a technical-museum diorama on one board — power-station hall with the
 * turbine-generator → step-up transformer (laminated E/I core, LV and HV windings concentric
 * on the centre limb, oil tank opened at the front, front-right quarter of the windings cut
 * away with section caps) → HV line (triple bundles) on lattice pylons → step-down
 * transformer → a small town whose lit windows follow the delivered power. Static parts and
 * the reference used are in ./parts.ts.
 *
 * What is physics and what is illustration (scales in ./visual.ts, stated in the legend and
 * the model note):
 *  - winding turns: N₁ : N₂ drawn in proportion (≤ 24 rings); wire radius ∝ √I (equal
 *    current density): the low-voltage winding is visibly thicker;
 *  - core flux: closed loops in the front lamination, around both windows of the E/I core
 *    (up the centre limb, back through the outer limbs), how many ∝ Φ̂ = √2·V/(2π f N),
 *    pulses reverse with Φ(t) = Φ̂·cos ωt (50 Hz played 200× slower, ideal core);
 *  - current: particles in each section (generator, line, town), velocity ∝ the
 *    instantaneous current √2·I·sin ωt of THAT section (same scale everywhere), so the HV
 *    line visibly carries ~N₁/N₂ of the generator current;
 *  - line conductors: catenary computed for the conductor temperature (lumped thermal model
 *    fed by R'·I² per metre, ./visual.ts): a hot line sags more; a labelled false-colour
 *    overlay shows the temperature (an overhead line never glows); in `alta` a faint heat
 *    haze ∝ R'·I²;
 *  - town: one lit window per 0,5 MW delivered (P − R·I²).
 */
import * as THREE from 'three';
import type { AppContext } from '../../core/types';
import {
  createCurrentFlow,
  createFieldLines,
  createLabelLayer,
  createStage,
  ironbow,
  mergeStatic,
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
  ATTACH_Y,
  BASE_T,
  BLOCKS,
  BUSH_X,
  BUSH_Z,
  COIL_H,
  COIL_Y,
  CORE,
  DOWN_X,
  FORMER_R,
  GROUND,
  LID_TOP,
  PEAK_Z,
  PHASE_Z,
  PYLONS,
  PYLON_H,
  UP_X,
  applyTints,
  bushingTop,
  buildBase,
  buildPlant,
  buildPylons,
  buildTown,
  buildTransformer,
  type PartsSink,
} from './parts';
import {
  AC_VISUAL_HZ,
  FLUX_LOOPS,
  HAZE_REF_W_PER_M,
  PARTICLE_V_FS,
  particleFullScale,
  particleSpeedPerAmp,
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

const HOME = {
  position: [-15.0, 6.3, 11.4] as [number, number, number],
  target: [-2.5, 2.1, -0.8] as [number, number, number],
};
/** Aspect ratio for which {@link HOME} frames the whole chain (1920×1080 scene box). */
const HOME_ASPECT = 2.33;

/**
 * Home view for a scene box of aspect w/h (QA-043): same viewing direction, the camera
 * pulled back so the whole diorama, generator hall to town, fits narrower boxes (1280×720).
 */
export function homeView(aspect: number): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const target = HOME.target;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : HOME_ASPECT;
  const dx = HOME.position[0] - target[0];
  const dy = HOME.position[1] - target[1];
  const dz = HOME.position[2] - target[2];
  // pull back for narrow boxes; stay inside the orbit limit (maxDistance 46)
  const k = Math.min(Math.max(1, HOME_ASPECT / a) ** 0.7, 44 / Math.hypot(dx, dy, dz));
  return {
    position: [target[0] + dx * k, target[1] + dy * k, target[2] + dz * k],
    target: [...target],
  };
}

/** One transformer: static parts, clipped windings (rebuilt), section caps, flux loops. */
interface Xfmr {
  gx: number;
  /** Side of the HV bushings (+1: +x). */
  hv: 1 | -1;
  group: THREE.Group;
  tank: THREE.Group;
  flux: FieldLines;
  windings: THREE.Group;
  /** Current paths (world), bushing A top → lead → helix → lead → bushing B top. */
  lvPath: THREE.Vector3[];
  hvPath: THREE.Vector3[];
  key: string;
  lvMat: THREE.MeshStandardMaterial;
  hvMat: THREE.MeshStandardMaterial;
  boardMat: THREE.MeshStandardMaterial;
  caps: THREE.InstancedMesh;
}

const MAX_CAPS = 2 * 64;

export function createTransformerScene(
  container: HTMLElement,
  overlay: HTMLElement,
  ctx: AppContext,
): TransformerScene {
  const stage = createStage(container, ctx, {
    ariaLabel:
      'Scena 3D a diorama della catena di trasporto: centrale con turbogeneratore, trasformatore elevatore con cassa aperta, nucleo laminato a E e I e avvolgimenti di bassa e alta tensione sezionati, linea ad alta tensione a fasci trinati su tralicci a traliccio con catenaria calcolata, trasformatore abbassatore e quartiere con finestre illuminate in proporzione alla potenza consegnata.',
    camera: {
      ...homeView(container.clientWidth / Math.max(1, container.clientHeight)),
      fov: 36,
      far: 200,
    },
    controls: { minDistance: 4, maxDistance: 46, maxPolarAngle: (82 * Math.PI) / 180 },
    floorY: GROUND - BASE_T - 0.2,
    floor: { radius: 34 },
    shadowRadius: 18,
    look: 'teardown',
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
  const sink: PartsSink = {
    geo,
    mat,
    mesh,
    assign: (m, kind, key) => void kit.assign(m, kind, key),
  };
  const v = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const tess = (n: number): number => Math.max(6, Math.round(n * stage.settings.tessellation));
  applyTints(stage);

  // --- board, power station, pylons, town ---------------------------------------------------
  const base = buildBase(sink);
  scene.add(base);
  const plant = buildPlant(sink, tess);
  scene.add(plant.root);
  const pylons = buildPylons(sink, tess);
  scene.add(pylons);
  const townParts = buildTown(sink);
  const town = townParts.root;
  scene.add(town);
  // base tier: bake the static parts to one mesh per material (draw-call budget)
  const bakeOpts = { kit, track: geo, drop: dropGeo };
  if (stage.tier === 'base') {
    mergeStatic(base, bakeOpts);
    mergeStatic(plant.root, bakeOpts);
    mergeStatic(pylons, bakeOpts);
    mergeStatic(town, bakeOpts);
  }

  // --- transformers ---------------------------------------------------------------------------
  stage.renderer.localClippingEnabled = true;
  const capGeo = geo(new THREE.CircleGeometry(1, 18));
  const capMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe8a070,
      metalness: 0.5,
      roughness: 0.4,
      emissive: 0x3a1a08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    }),
  );
  const makeXfmr = (gx: number, hv: 1 | -1): Xfmr => {
    const parts = buildTransformer(sink, hv, tess);
    const group = parts.root;
    if (stage.tier === 'base') {
      mergeStatic(group, { ...bakeOpts, keep: [parts.tank] });
      mergeStatic(parts.tank, bakeOpts); // the tank group toggles as a whole; its contents don't
    }
    group.position.set(gx, GROUND, 0);
    scene.add(group);
    // cutaway of the windings: removes x > gx AND z > 0 (front-right quarter)
    const cut = [new THREE.Plane(v(-1, 0, 0), gx), new THREE.Plane(v(0, 0, -1), 0)];
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
    const lvMat = clipped({
      color: 0xd88a52,
      metalness: 0.55,
      roughness: 0.36,
      envMapIntensity: 1.0,
      emissive: 0x2a1206,
    });
    const hvMat = clipped({
      color: 0xb8622c,
      metalness: 0.5,
      roughness: 0.42,
      envMapIntensity: 1.0,
      emissive: 0x241005,
    });
    const boardMat = clipped({ color: 0xb39668, metalness: 0, roughness: 0.8 });
    const windings = new THREE.Group();
    windings.name = 'windings';
    group.add(windings);
    const caps = new THREE.InstancedMesh(capGeo, capMat, MAX_CAPS);
    caps.count = 0;
    caps.frustumCulled = false;
    group.add(caps);
    const flux = createFieldLines(stage, {
      linewidth: 2.4,
      spacing: 0.5,
      speed: 1.1,
      base: 0.5,
      gain: 2.0,
    });
    group.add(flux.object);
    // flux loops on the front lamination, around both windows; spread order: any prefix
    // is even (alternating windows, insets spread)
    const loops: TracedLine[] = [];
    const insets = [2, 5, 0, 3, 1, 4];
    const nPer = FLUX_LOOPS / 2;
    const zf = CORE.d / 2 + 0.012;
    for (let i = 0; i < FLUX_LOOPS; i++) {
      const side = i % 2 ? -1 : 1;
      const f = ((insets[Math.floor(i / 2) % nPer] as number) + 0.5) / nPer;
      const xi = CORE.cx * (1 - f) + 0.01; // centre-limb side (|x|)
      const xo = CORE.wx + f * (CORE.hw - CORE.wx) - 0.01;
      const yb = CORE.wy0 - f * (CORE.wy0 - CORE.y0) + 0.01;
      const yt = CORE.wy1 + f * (CORE.y1 - CORE.wy1) - 0.01;
      const rc = 0.04 + f * 0.22;
      const pts: THREE.Vector3[] = [];
      const corner = (cxp: number, cyp: number, a0: number): void => {
        for (let j = 0; j <= 6; j++) {
          const a = a0 - (j / 6) * (Math.PI / 2);
          pts.push(v(side * (cxp + rc * Math.cos(a)), cyp + rc * Math.sin(a), zf));
        }
      };
      // up the centre limb, across the top yoke, down the outer limb, back along the I
      corner(xi + rc, yt - rc, Math.PI);
      corner(xo - rc, yt - rc, Math.PI / 2);
      corner(xo - rc, yb + rc, 0);
      corner(xi + rc, yb + rc, -Math.PI / 2);
      pts.push((pts[0] as THREE.Vector3).clone());
      const n = pts.length;
      const points = new Float32Array(3 * n);
      const mags = new Float32Array(n).fill(1);
      const arc = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        const p = pts[j] as THREE.Vector3;
        points.set([p.x, p.y, p.z], 3 * j);
        if (j > 0) arc[j] = (arc[j - 1] as number) + p.distanceTo(pts[j - 1] as THREE.Vector3);
      }
      loops.push({ points, mags, arc, count: n, closed: true, reason: 'closed' });
    }
    flux.setLines(loops);
    return {
      gx,
      hv,
      group,
      tank: parts.tank,
      flux,
      windings,
      lvPath: [],
      hvPath: [],
      key: '',
      lvMat,
      hvMat,
      boardMat,
      caps,
    };
  };
  const up = makeXfmr(UP_X, 1);
  const down = makeXfmr(DOWN_X, -1);

  /** Helix around the centre limb (axis y), top → bottom, starting/ending at the back. */
  const helix = (gx: number, turns: number, R: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    const per = Math.max(12, Math.round(18 * stage.settings.tessellation));
    const n = turns * per;
    const y0 = COIL_Y + COIL_H / 2;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (k / per) * 2 * Math.PI;
      pts.push(v(gx + R * Math.sin(a), y0 - (k / n) * COIL_H, R * Math.cos(a)));
    }
    return pts;
  };
  const RUN_Y = 3.08; // lead run between the top yoke and the lid
  /** Leads from the helix ends to the bushings on side s (polylines, world). */
  const leads = (x: Xfmr, s: number, isHV: boolean, R: number) => {
    const g = x.gx;
    const yTop = COIL_Y + COIL_H / 2;
    const yBot = COIL_Y - COIL_H / 2 - 0.1;
    const bx = g + s * BUSH_X;
    const zA = BUSH_Z[0];
    const zB = BUSH_Z[1];
    const xr = g + s * (isHV ? 0.42 : 0.24);
    const zr = isHV ? -0.9 : -0.86;
    const top = [
      bushingTop(g, s, zA, isHV),
      v(bx, LID_TOP, zA),
      v(bx, RUN_Y, zA),
      v(g, RUN_Y, -R),
      v(g, yTop, -R),
    ];
    const bottom = [
      v(g, yBot + 0.1, -R),
      v(g, yBot, -R),
      v(xr, yBot, zr),
      v(xr, RUN_Y - (isHV ? 0.0 : 0.06), zr),
      v(bx, RUN_Y - (isHV ? 0.0 : 0.06), zB),
      v(bx, LID_TOP, zB),
      bushingTop(g, s, zB, isHV),
    ];
    return { top, bottom };
  };
  const polyTube = (pts: THREE.Vector3[], r: number): THREE.TubeGeometry => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++)
      path.add(new THREE.LineCurve3(pts[i - 1] as THREE.Vector3, pts[i] as THREE.Vector3));
    return new THREE.TubeGeometry(path, (pts.length - 1) * 4, r, 8, false);
  };
  const capM = new THREE.Matrix4();
  const capQ = new THREE.Quaternion();
  const capQx = new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), Math.PI / 2);
  const capS = v();
  const capP = v();
  const buildWindings = (x: Xfmr, nLV: number, nHV: number, rLV: number, rHV: number): boolean => {
    const key = `${nLV}|${nHV}|${rLV.toFixed(3)}|${rHV.toFixed(3)}|${stage.tier}`;
    if (key === x.key) return false;
    x.key = key;
    for (const m of [...x.windings.children] as THREE.Mesh[]) {
      x.windings.remove(m);
      dropGeo(m.geometry);
    }
    const RLV = FORMER_R + rLV + 0.006;
    const RHV = FORMER_R + 2 * 0.055 + 0.07 + rHV;
    const radial = stage.tier === 'base' ? 6 : 10;
    const local = (pts: THREE.Vector3[]): THREE.Vector3[] =>
      pts.map((p) => p.clone().sub(x.group.position));
    let ci = 0;
    for (const [n, r, R, m, isHV] of [
      [nLV, rLV, RLV, x.lvMat, false],
      [nHV, rHV, RHV, x.hvMat, true],
    ] as const) {
      const hx = helix(x.gx, n, R);
      const tube = geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(local(hx)),
          Math.min(1400, hx.length * 2),
          r,
          radial,
        ),
      );
      const w = new THREE.Mesh(tube, m);
      w.castShadow = stage.tier !== 'base';
      x.windings.add(w);
      const s = isHV ? x.hv : -x.hv;
      const L = leads(x, s, isHV, R);
      for (const pl of [L.top, L.bottom]) {
        const lg = mesh(geo(polyTube(local(pl.slice(1)), 0.024)), 'copper', 'lead');
        x.windings.add(lg);
      }
      const path = [...L.top, ...hx.slice(1, -1), ...L.bottom];
      if (isHV) x.hvPath = path;
      else x.lvPath = path;
      // section caps where each turn crosses the cut planes (x = gx front, z = 0 right)
      for (let j = 0; j < n && ci < MAX_CAPS - 1; j++) {
        const y0 = COIL_Y + COIL_H / 2;
        capS.set(r, r, r);
        capP.set(0, y0 - ((j + 0.5) / n) * COIL_H, R);
        x.caps.setMatrixAt(ci++, capM.compose(capP, capQx, capS));
        capP.set(R, y0 - ((j + 0.75) / n) * COIL_H, 0);
        x.caps.setMatrixAt(ci++, capM.compose(capP, capQ, capS));
      }
    }
    x.caps.count = ci;
    x.caps.instanceMatrix.needsUpdate = true;
    // pressboard tubes: around the limb and between LV and HV
    for (const R of [FORMER_R - 0.012, FORMER_R + 0.055 * 2 + 0.035]) {
      const t = new THREE.Mesh(
        geo(new THREE.CylinderGeometry(R, R, COIL_H + 0.12, tess(48), 1, true)),
        x.boardMat,
      );
      t.position.y = COIL_Y;
      x.windings.add(t);
    }
    return true;
  };

  // --- line conductors (catenary, triple bundles, rebuilt when the drawn sag changes) --------
  const upHV = (z: number): THREE.Vector3 => bushingTop(UP_X, 1, z, true);
  const downHV = (z: number): THREE.Vector3 => bushingTop(DOWN_X, -1, z, true);
  const lineGroup = new THREE.Group();
  scene.add(lineGroup);
  const conductorMeshes: THREE.Mesh[] = [];
  const thermalMeshes: THREE.Mesh[] = [];
  let lineGeos: THREE.BufferGeometry[] = [];
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
  // triple bundle (380 kV practice): sub-conductors on a triangle around the phase centre
  const BUNDLE: Array<[number, number]> = [
    [0.06, 0],
    [-0.03, 0.052],
    [-0.03, -0.052],
  ];
  const addConductor = (pts: THREE.Vector3[], r: number): void => {
    const g = geo(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
        pts.length * 2,
        r,
        stage.tier === 'base' ? 5 : 7,
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
    for (const [key, z, bz] of [
      ['go', PHASE_Z, BUSH_Z[0]],
      ['ret', -PHASE_Z, BUSH_Z[1]],
    ] as const) {
      const a0 = upHV(bz);
      const p0 = v(PYLONS[0], ATTACH_Y, z);
      const pn = v(PYLONS[PYLONS.length - 1], ATTACH_Y, z);
      const dropA = spanPoints(a0, p0, 0.15, 10);
      const dropB = spanPoints(pn, downHV(bz), 0.15, 10);
      const spans: THREE.Vector3[] = [p0.clone()];
      for (let k = 0; k < PYLONS.length - 1; k++) {
        const a = v(PYLONS[k], ATTACH_Y, z);
        const b = v(PYLONS[k + 1], ATTACH_Y, z);
        spans.push(...spanPoints(a, b, drawn, segs).slice(1));
      }
      phasePts[key] = [...dropA, ...spans.slice(1), ...dropB.slice(1)];
      addConductor(dropA, 0.03);
      addConductor(dropB, 0.03);
      for (const [dz, dy] of BUNDLE)
        addConductor(
          spans.map((p) => v(p.x, p.y + dy, p.z + dz)),
          0.017,
        );
    }
    phasePts = { ...phasePts };
    lineFlow.setPath(
      [
        ...phasePts.go,
        ...down.hvPath.slice(1),
        ...[...phasePts.ret].reverse().slice(1),
        ...[...up.hvPath].reverse().slice(1, -1),
      ],
      true,
    );
  };
  // earth wires (static, light sag) on the peaks
  for (const z of [-PEAK_Z, PEAK_Z]) {
    const pts: THREE.Vector3[] = [v(PYLONS[0], PYLON_H + 0.25, z)];
    for (let k = 0; k < PYLONS.length - 1; k++)
      pts.push(
        ...spanPoints(
          v(PYLONS[k], PYLON_H + 0.25, z),
          v(PYLONS[k + 1], PYLON_H + 0.25, z),
          0.22,
          16,
        ).slice(1),
      );
    scene.add(
      mesh(geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.012, 5)), 'steel'),
    );
  }

  // --- heat haze above the spans (alta only): faint wavy streaks ∝ R'·I² --------------------
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
          float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
          gl_FragColor = vec4(uColor * s * edge * uAmount, 1.0);
        }`,
    }),
  );
  const hazeGeo = geo(new THREE.PlaneGeometry(PYLONS[3] - PYLONS[0], 0.7));
  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.position.set((PYLONS[0] + PYLONS[3]) / 2, ATTACH_Y - 0.15, 0);
  haze.renderOrder = 5;
  scene.add(haze);

  // --- town windows ------------------------------------------------------------------------------
  const windowsAt = townParts.slots;
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
    litCol.setHex(0xffcf7a).multiplyScalar(stage.settings.post ? 1.5 : 1.1);
    darkCol.setHex(0x1c242e);
    for (let i = 0; i < nWindows; i++) windows.setColorAt(i, i < lit ? litCol : darkCol);
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    litShown = lit;
  };
  paintWindows(0);
  town.add(windows);

  // --- LV feeder (step-down → town) and generator leads (generator → step-up) -------------------
  const poleGeo = geo(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 10));
  const armGeo = geo(new THREE.BoxGeometry(0.06, 0.06, 1.4));
  const FEED_X = DOWN_X + 2.1;
  const feedPole = mesh(poleGeo, 'darkSteel', 'clamp');
  feedPole.position.set(FEED_X, GROUND + 1.6, -0.5);
  const feedArm = mesh(armGeo, 'darkSteel', 'clamp');
  feedArm.position.set(FEED_X, GROUND + 3.1, -0.5);
  town.add(feedPole, feedArm);
  // first town block: the feeder ends on its left wall
  const wallX = (BLOCKS[0]?.[0] ?? 13) - (BLOCKS[0]?.[2] ?? 1) / 2;
  const lvPath = (bz: number, k: number): THREE.Vector3[] => [
    bushingTop(DOWN_X, 1, bz, false),
    v(DOWN_X + 1.2, 3.55, bz + k * 0.1),
    v(FEED_X, 3.15, -0.5 + k * 0.6),
    v(wallX - 0.25, 2.55, -1.0 + k * 0.3),
    v(wallX - 0.02, 2.3, -1.0 + k * 0.3),
  ];
  for (const [bz, k] of [
    [BUSH_Z[0], 1],
    [BUSH_Z[1], -1],
  ] as const)
    town.add(
      mesh(
        geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lvPath(bz, k)), 48, 0.022, 6)),
        'copper',
        'lv',
      ),
    );
  const [gA, gB] = plant.terminals;
  const POST_X = UP_X - 2.9;
  const genLead = (bz: number, term: THREE.Vector3): THREE.Vector3[] => [
    term,
    v(term.x, 2.35, term.z),
    v(POST_X, 2.75, bz - 0.25),
    v(UP_X - BUSH_X - 0.7, 3.95, bz),
    bushingTop(UP_X, -1, bz, false),
  ];
  for (const [bz, term] of [
    [BUSH_Z[0], gA],
    [BUSH_Z[1], gB],
  ] as const) {
    scene.add(
      mesh(
        geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(genLead(bz, term)), 48, 0.035, 8)),
        'copper',
        'lead',
      ),
    );
    const post = mesh(geo(new THREE.CylinderGeometry(0.04, 0.06, 2.65, 10)), 'darkSteel', 'clamp');
    post.position.set(POST_X, GROUND + 1.32, bz - 0.25);
    scene.add(post);
  }

  // --- current flows (one per section, same velocity scale) ----------------------------------
  const pd = stage.settings.particleDensity;
  const flowOpts = { speedPerAmp: 1, vMax: PARTICLE_V_FS * 1.01, smooth: false };
  const lineFlow: CurrentFlow = createCurrentFlow(stage, {
    ...flowOpts,
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: Math.round(260 * Math.max(0.5, pd)),
    radius: 0.045,
  });
  const genFlow: CurrentFlow = createCurrentFlow(stage, {
    ...flowOpts,
    path: [v(), v(1, 0, 0)],
    closed: true,
    count: Math.round(120 * Math.max(0.5, pd)),
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
    genFlow.setPath(
      [
        ...genLead(BUSH_Z[0], gA),
        ...up.lvPath.slice(1),
        ...genLead(BUSH_Z[1], gB).reverse().slice(1),
      ],
      true,
    );
    townFlow.setPath(
      [
        ...lvPath(BUSH_Z[1], -1).reverse(),
        ...[...down.lvPath].reverse().slice(1),
        ...lvPath(BUSH_Z[0], 1).slice(1),
      ],
      true,
    );
  };

  // --- labels: callout spots off the working parts, leader lines to the parts ------------------
  const labels = createLabelLayer(stage, overlay);
  type Key = keyof SceneTexts;
  const parts: Record<Key, THREE.Vector3> = {
    plant: v(gA.x - 0.35, 1.5, gA.z + 0.1),
    stepUp: v(UP_X - BUSH_X, LID_TOP + 0.6, BUSH_Z[1]),
    core: v(UP_X + 1.02, CORE.wy1 + 0.17, CORE.d / 2),
    line: v((PYLONS[0] + PYLONS[1]) / 2, ATTACH_Y - 0.25, PHASE_Z),
    loss: v((PYLONS[1] + PYLONS[2]) / 2, ATTACH_Y - 0.35, -PHASE_Z),
    sag: v((PYLONS[2] + PYLONS[3]) / 2, ATTACH_Y - 0.5, PHASE_Z),
    stepDown: v(DOWN_X, LID_TOP + 0.4, -0.5),
    town: v(13.0, 2.4, 0.5),
  };
  const ends: Record<Key, THREE.Vector3> = {
    plant: v(-11.2, 5.2, -2.8),
    stepUp: v(UP_X - 1.4, 7.0, -1.0),
    core: v(UP_X + 2.7, 0.1, 3.7),
    line: v(-1.6, 7.6, 0),
    loss: v(2.0, 7.7, -0.6),
    sag: v(1.6, 0.0, 3.9),
    stepDown: v(DOWN_X + 1.2, 0.0, 4.6),
    town: v(13.2, 5.4, -0.8),
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
    plant: tag('plant', { text: 'Centrale', quantity: 'emf', priority: 8 }),
    stepUp: tag('stepUp', { text: 'Elevatore', priority: 7 }),
    core: tag('core', { text: 'Φ', quantity: 'b', priority: 6 }),
    line: tag('line', { text: 'Linea', quantity: 'i', priority: 9 }),
    loss: tag('loss', { text: 'Joule', quantity: 'energy', priority: 8 }),
    sag: tag('sag', { text: 'freccia', priority: 3, size: 'sm' }),
    stepDown: tag('stepDown', { text: 'Abbassatore', priority: 7 }),
    town: tag('town', { text: 'Utenze', quantity: 'energy', priority: 8 }),
  };
  const updateLeaders = (): void => {
    KEYS.forEach((k, i) => {
      const a = parts[k];
      const b = ends[k];
      leaderPos.set([a.x, a.y, a.z, b.x, b.y, b.z], 6 * i);
    });
    (leaderGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  stage.castShadows(plant.root);
  stage.castShadows(up.group);
  stage.castShadows(down.group);
  stage.castShadows(town);

  const offTier = stage.onTierChange(() => {
    up.key = down.key = '';
    sagDrawn = -1;
    litShown = -1;
  });
  const offTheme = stage.onThemeChange(() => {
    litShown = -1;
  });
  // Re-frame the home view when the scene box changes aspect, unless the user has orbited.
  let home = homeView(stage.width / stage.height);
  const offResize = stage.onResize((w, h) => {
    const atHome =
      stage.camera.position.distanceTo(new THREE.Vector3(...home.position)) < 0.05 &&
      stage.controls.target.distanceTo(new THREE.Vector3(...home.target)) < 0.05;
    home = homeView(w / h);
    if (atHome) stage.setView(home.position, home.target, false);
  });

  // --- per-frame ------------------------------------------------------------------------------
  const rgb: [number, number, number] = [0, 0, 0];
  let frames = 0;
  let lastLit = 0;
  let lastSag = Number.NaN;
  let wiresChanged = false;
  const update = (s: SceneView): void => {
    applyTints(stage);
    // windings: turns ∝ N, wire radius ∝ √I (equal current density)
    const vt = visualTurns(s.N1, s.N2);
    const Iref = Math.max(s.I1, s.Iline, 1e-9);
    const r1 = wireRadius(s.I1, Iref, 0.055, 0.012, 0.055);
    const r2 = wireRadius(s.Iline, Iref, 0.055, 0.012, 0.055);
    wiresChanged = buildWindings(up, vt.n1, vt.n2, r1, r2) || wiresChanged;
    wiresChanged =
      buildWindings(down, vt.n1, vt.n2, wireRadius(s.Iout, Iref, 0.055, 0.012, 0.055), r2) ||
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
    const k = particleSpeedPerAmp(particleFullScale(s.I1, s.Iline, s.Iout));
    genFlow.setCurrent(s.I1 * sn * k);
    lineFlow.setCurrent(s.Iline * sn * k);
    townFlow.setCurrent(s.Iout * sn * k);
    const c = Math.cos(w);
    up.flux.setFraction(fluxFraction(s.phiUp));
    down.flux.setFraction(fluxFraction(s.phiDown));
    up.flux.setFlow(1.4 * c);
    down.flux.setFlow(1.4 * c);
    up.tank.visible = down.tank.visible = s.tank;
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
    haze.visible = stage.tier === 'alta' && s.heatPerMetre > 0.5;
    const u = hazeMat.uniforms as Record<string, { value: number }>;
    (u['uTime'] as { value: number }).value = s.t;
    (u['uAmount'] as { value: number }).value =
      Math.min(1, s.heatPerMetre / HAZE_REF_W_PER_M) * 0.28;
    if (s.lit !== litShown) paintWindows(s.lit);
    lastLit = s.lit;
    // sag callout follows the lowest point of the third span
    parts.sag.set((PYLONS[2] + PYLONS[3]) / 2, ATTACH_Y - sagDrawn - 0.06, PHASE_Z);
    updateLeaders();
    const t = s.texts;
    for (const key of KEYS) L[key].setText(t[key]);
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
      offResize();
      labels.dispose();
      for (const f of [lineFlow, genFlow, townFlow]) f.dispose();
      up.flux.dispose();
      down.flux.dispose();
      up.caps.dispose();
      down.caps.dispose();
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
