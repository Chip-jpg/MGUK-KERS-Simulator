/**
 * Shared procedural car of the `kers-braking`, `car-dynamics`, `drive-sim` and `kers-drive`
 * scenes: an ORIGINAL open-wheel single-seater (no logos, no liveries, no copy of a real car)
 * shown as a teardown exhibit. Proportions follow the 2022 FIA F1 Technical Regulations
 * envelope (see `dims.ts`); the shape itself is abstract.
 *
 * Cutaway: the half of the engine cover and airbox facing the camera (z > 0) and the outer
 * half of the right sidepod are removed with clipping planes; a red "cut carbon" band marks
 * each section. Inside: 90° V6 (crankcase, banks, cam covers, coil packs, plenum, exhaust
 * primaries, turbo), gearbox casing, the MGU-K (housing opened over a quadrant: stator teeth,
 * copper end windings, rotor band glowing with the power), the energy store under the cover
 * (cell modules + charge gauge) and the radiator core in the sidepod.
 *
 * Physics-driven parts (all values come from the sim, the car only displays them):
 * - wheels turn by φ = x / r (rolling without slip, x = distance travelled);
 * - brake discs glow with the black-body colour of their COMPUTED temperature
 *   (`applyHeatGlow`, lumped thermal model in `physics/brake-thermal`);
 * - energy ribbons (width ∝ power): rear wheels → MGU-K (mechanical power absorbed),
 *   MGU-K → battery (electrical power stored), MGU-K → radiator (losses, dimmer);
 * - battery gauge filled with the energy stored;
 * - body pitch/heave (car-dynamics, from the axle loads; visual exaggeration stated);
 * - tyre contact patches glowing with κ/κ* (car-dynamics).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  applyHeatGlow,
  chamferBox,
  createEnergyRibbon,
  mergeStatic,
  radialFade,
  type EnergyRibbon,
  type MaterialKind,
  type Stage,
} from '../../../render';
import { CAR_DIMS } from './dims';
import { loftGeometry, wingGeometry, type LoftStation } from './loft';
import { flipFaces, pipe, radialTeeth, sectionBand, strut } from './parts';
import { discFace, spinBlur } from './textures';

import { carStats } from './stats';

export { carStats };

/** Radius of the energy ribbons per watt [m/W]: 0,12 m at 350 kW (stated in the legends). */
export const RIBBON_M_PER_W = 0.12 / 350e3;

export interface CarFrame {
  /** Distance travelled [m] (wheel angle φ = x / r). */
  x: number;
  /** Speed [m/s]. */
  v: number;
  /** Visual pitch [rad] (nose down > 0) and heave [m] (down > 0). */
  pitch: number;
  heave: number;
  /** Disc temperatures [K] (front / rear axle). */
  tFront: number;
  tRear: number;
  /** Battery gauge fill 0 … 1. */
  batteryFill: number;
  /** Mechanical power into the MGU-K, electrical power to the battery, MGU-K losses [W]. */
  pMech: number;
  pElec: number;
  pLoss: number;
  /** Tyre slip relative to the peak κ/κ* per axle (patches hidden when undefined). */
  slipFront?: number;
  slipRear?: number;
}

export interface CarAnchors {
  mguk: THREE.Vector3;
  battery: THREE.Vector3;
  radiator: THREE.Vector3;
  discFront: THREE.Vector3;
  discRear: THREE.Vector3;
  frontWing: THREE.Vector3;
  rearWing: THREE.Vector3;
  /** Top of the bodywork above each axle (downforce arrows point at it). */
  frontTop: THREE.Vector3;
  rearTop: THREE.Vector3;
  /** Contact patches on the camera (+z) side. */
  contactFront: THREE.Vector3;
  contactRear: THREE.Vector3;
  /** Aerodynamic centre used for the drag arrow. */
  dragPoint: THREE.Vector3;
}

export interface Car {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  /** World-space anchors (updated by `update`). */
  readonly anchors: CarAnchors;
  readonly ribbons: { mech: EnergyRibbon; elec: EnergyRibbon; loss: EnergyRibbon };
  /** Own textures (pre-uploaded on mount for deterministic GPU counters). */
  readonly textures: readonly THREE.Texture[];
  update(f: CarFrame): void;
  /** Number of meshes (debug). */
  meshCount(): number;
  dispose(): void;
}

export interface CarOptions {
  /** Show the tyre contact-patch glow (car-dynamics). */
  patches?: boolean;
}

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

// --- body sections (x, w, h, y[, z, n, flat]) -------------------------------------------
const FUSELAGE: LoftStation[] = [
  { x: 2.62, w: 0.12, h: 0.07, y: 0.2, n: 2.4 },
  { x: 2.3, w: 0.2, h: 0.12, y: 0.23, n: 2.6 },
  { x: 1.9, w: 0.28, h: 0.2, y: 0.28, n: 2.8 },
  { x: 1.45, w: 0.4, h: 0.3, y: 0.34, n: 3, flat: 0.4 },
  { x: 0.95, w: 0.54, h: 0.4, y: 0.38, n: 3.4, flat: 0.7 },
  { x: 0.45, w: 0.7, h: 0.47, y: 0.39, n: 3.8, flat: 0.8 },
  { x: 0.05, w: 0.76, h: 0.5, y: 0.4, n: 4, flat: 0.8 },
];
const ENGINE_COVER: LoftStation[] = [
  { x: 0.05, w: 0.76, h: 0.5, y: 0.4, n: 4, flat: 0.8 },
  { x: -0.45, w: 0.74, h: 0.5, y: 0.38, n: 3.6, flat: 0.8 },
  { x: -1.05, w: 0.58, h: 0.45, y: 0.35, n: 3.2, flat: 0.6 },
  { x: -1.65, w: 0.38, h: 0.34, y: 0.31, n: 2.8 },
  { x: -2.15, w: 0.2, h: 0.2, y: 0.28, n: 2.4 },
];
const AIRBOX: LoftStation[] = [
  { x: 0.02, w: 0.2, h: 0.2, y: 0.8, n: 2.6 },
  { x: -0.25, w: 0.27, h: 0.3, y: 0.76, n: 2.8 },
  { x: -0.7, w: 0.2, h: 0.26, y: 0.7, n: 2.6 },
  { x: -1.2, w: 0.1, h: 0.14, y: 0.62, n: 2.4 },
  { x: -1.55, w: 0.03, h: 0.04, y: 0.56 },
];
const GEARBOX: LoftStation[] = [
  { x: -1.34, w: 0.24, h: 0.26, y: 0.27, n: 3.4 },
  { x: -1.75, w: 0.2, h: 0.22, y: 0.27, n: 3.2 },
  { x: -2.2, w: 0.14, h: 0.16, y: 0.29, n: 3 },
];
const PLENUM: LoftStation[] = [
  { x: -0.38, w: 0.1, h: 0.08, y: 0.5, n: 3 },
  { x: -0.55, w: 0.17, h: 0.11, y: 0.51, n: 3.2 },
  { x: -1.1, w: 0.15, h: 0.1, y: 0.5, n: 3.2 },
  { x: -1.25, w: 0.08, h: 0.06, y: 0.48, n: 3 },
];
/** Sidepod with the 2022-style undercut: inlet high and forward, flank tapering down/inward. */
const sidepod = (z: number): LoftStation[] => [
  { x: 0.86, w: 0.24, h: 0.2, y: 0.45, z, n: 3.6 },
  { x: 0.74, w: 0.34, h: 0.3, y: 0.43, z, n: 3.8 },
  { x: 0.4, w: 0.36, h: 0.32, y: 0.41, z, n: 3.8, flat: 0.5 },
  { x: -0.3, w: 0.3, h: 0.27, y: 0.35, z: z * 0.94, n: 3.4, flat: 0.5 },
  { x: -1.1, w: 0.14, h: 0.14, y: 0.27, z: z * 0.68, n: 2.8 },
  { x: -1.45, w: 0.05, h: 0.05, y: 0.23, z: z * 0.5 },
];
/** Sidepod centre line [m] and the cut plane through the camera-side sidepod. */
const POD_Z = 0.6;
const POD_CUT_Y = 0.36;

/** MGU-K: centre, radius, length [m] (illustrative size, ≈ Ø 170 × 200 mm). */
const MGUK = { x: -0.55, y: 0.19, z: 0.25, r: 0.085, len: 0.2 };
/** Energy store under the cover, ahead of the engine. */
const BAT = { x: -0.1, y: 0.15, len: 0.36, h: 0.1, w: 0.46 };
const RADIATOR = { x: 0.36, y: 0.4 };
/** Colour of the cut faces (the same section red as the MGU-K teardown). */
const SECTION_RED = 0xa8342b;

export function createCar(stage: Stage, opts: CarOptions = {}): Car {
  const kit = stage.materials;
  const tess = stage.settings.tessellation;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.add(g);
    carStats.liveGeometries++;
    return g;
  };
  const own = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    carStats.liveMaterials++;
    return m;
  };
  const texture = (c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    carStats.liveTextures++;
    return t;
  };
  let meshes = 0;
  const kitMesh = (g: THREE.BufferGeometry, kind: MaterialKind, key?: string): THREE.Mesh => {
    const m = new THREE.Mesh(g);
    kit.assign(m, kind, key);
    meshes++;
    return m;
  };
  const ownMesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    meshes++;
    return new THREE.Mesh(g, m);
  };
  /** Smooth clear-coated carbon for the aero surfaces (the kit weave reads as a grid on wings). */
  const aeroMat = own(
    new THREE.MeshStandardMaterial({ color: 0x1b1e23, metalness: 0.35, roughness: 0.32 }),
  );
  const aeroMesh = (g: THREE.BufferGeometry): THREE.Mesh => ownMesh(g, aeroMat);
  /** Merge parts into one geometry (disposing the parts). */
  const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    for (const p of parts) p.dispose();
    return geo(g);
  };

  // --- cutaway planes (world space; the body only pitches about z, so z-planes hold) ------
  stage.renderer.localClippingEnabled = true;
  const coverCut = [new THREE.Plane(v3(0, 0, -1), 0)];
  // camera-side sidepod: everything above y = POD_CUT_Y is lifted off (follows the pitch)
  const podCutLocal = [new THREE.Plane(v3(0, -1, 0), POD_CUT_Y)];
  const podCut = podCutLocal.map((p) => p.clone());
  // MGU-K housing: the quadrant above the axis on the camera side (y > yc AND z > zc) is opened
  const mgukCutLocal = [
    new THREE.Plane(v3(0, -1, 0), MGUK.y + 0.01),
    new THREE.Plane(v3(0, 0, -1), MGUK.z),
  ];
  const mgukCut = mgukCutLocal.map((p) => p.clone());

  // --- own materials: paint (tier-aware, plain + cut), cut metal, section, discs… ----------
  const makePaint = (clip: THREE.Plane[] | null): THREE.Material => {
    const common = clip ? { clippingPlanes: clip, clipShadows: true } : {};
    return stage.settings.pbr
      ? new THREE.MeshPhysicalMaterial({
          color: 0xa3abb4,
          metalness: 0.45,
          roughness: 0.38,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          ...common,
        })
      : new THREE.MeshLambertMaterial({ color: 0xb9c0c7, ...common });
  };
  const paintSlots: Array<{
    clip: THREE.Plane[] | null;
    mat: THREE.Material;
    meshes: THREE.Mesh[];
  }> = [null, coverCut, podCut].map((clip) => ({ clip, mat: own(makePaint(clip)), meshes: [] }));
  const [paintPlain, paintCover, paintPod] = paintSlots as [
    (typeof paintSlots)[0],
    (typeof paintSlots)[0],
    (typeof paintSlots)[0],
  ];
  // inner face of the cut skin: dark raw carbon, so the opened bay reads as a cavity
  const innerMats = new Map<THREE.Plane[], THREE.Material>();
  const paintMesh = (g: THREE.BufferGeometry, slot = paintPlain): THREE.Mesh => {
    const m = new THREE.Mesh(g, slot.mat);
    slot.meshes.push(m);
    if (slot.clip) {
      let inner = innerMats.get(slot.clip);
      if (!inner) {
        inner = own(
          new THREE.MeshStandardMaterial({
            color: 0x23262b,
            roughness: 0.75,
            metalness: 0.1,
            side: THREE.BackSide,
            clippingPlanes: slot.clip,
          }),
        );
        innerMats.set(slot.clip, inner);
      }
      m.add(ownMesh(g, inner));
    }
    meshes++;
    return m;
  };
  const sectionMat = own(
    new THREE.MeshStandardMaterial({
      color: SECTION_RED,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const housingMat = own(
    new THREE.MeshStandardMaterial({
      color: 0xaab2bb,
      metalness: 0.85,
      roughness: 0.4,
      clippingPlanes: mgukCut,
      clipIntersection: true,
      clipShadows: true,
      side: THREE.DoubleSide,
    }),
  );
  const housingCapMat = own(
    new THREE.MeshStandardMaterial({
      color: SECTION_RED,
      roughness: 0.55,
      metalness: 0.2,
      clippingPlanes: mgukCut,
      clipIntersection: true,
      side: THREE.DoubleSide,
    }),
  );
  const discTex = texture(discFace());
  const discParams = { color: 0xffffff, map: discTex, roughness: 0.75, metalness: 0.05 };
  const discMat = {
    front: own(new THREE.MeshStandardMaterial(discParams)),
    rear: own(new THREE.MeshStandardMaterial(discParams)),
  };
  const blurMat = own(
    new THREE.MeshBasicMaterial({
      map: texture(spinBlur()),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  );
  const patchFade = texture(radialFade(), false);
  const patchParams = {
    color: 0x3dd6c6,
    alphaMap: patchFade,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };
  const patchMat = {
    front: own(new THREE.MeshBasicMaterial(patchParams)),
    rear: own(new THREE.MeshBasicMaterial(patchParams)),
  };

  const root = new THREE.Group();
  root.name = 'car';
  const body = new THREE.Group();
  body.name = 'car-body';
  root.add(body);
  stage.scene.add(root);
  const noShadow: THREE.Object3D[] = [];

  // base tier: fewer segments (software-GL budget); alta / bilanciata keep their counts
  const base = stage.tier === 'base';
  const radial = base ? 14 : Math.max(16, Math.round(36 * tess));
  const sub = tess >= 0.9 ? 6 : 3;

  // --- monocoque + nose, engine cover / airbox (cut), sections ----------------------------
  body.add(paintMesh(geo(loftGeometry(FUSELAGE, radial, sub))));
  body.add(paintMesh(geo(loftGeometry(ENGINE_COVER, radial, sub)), paintCover));
  body.add(paintMesh(geo(loftGeometry(AIRBOX, radial, sub)), paintCover));
  for (const [st, t] of [
    [ENGINE_COVER, 0.014],
    [AIRBOX, 0.012],
  ] as const) {
    const band = sectionBand(st, sub * 2, 0.0005, t);
    if (band) body.add(ownMesh(geo(band), sectionMat));
  }
  // airbox intake and roll-hoop inlet lip
  const intake = kitMesh(geo(new THREE.CircleGeometry(1, 24).rotateY(Math.PI / 2)), 'rubber');
  intake.scale.set(1, 0.075, 0.085);
  intake.position.set(0.023, 0.81, 0);
  body.add(intake);
  // cockpit: opening, headrest, helmet, visor, steering wheel
  const opening = kitMesh(geo(new THREE.SphereGeometry(1, 28, 12)), 'rubber');
  opening.scale.set(0.36, 0.05, 0.25);
  opening.position.set(0.52, 0.625, 0);
  const helmet = kitMesh(geo(new THREE.SphereGeometry(0.112, 28, 18)), 'ceramic', 'helmet');
  helmet.position.set(0.3, 0.7, 0);
  const visor = kitMesh(geo(new THREE.SphereGeometry(1, 20, 10)), 'plastic');
  visor.scale.set(0.05, 0.042, 0.092);
  visor.position.set(0.375, 0.71, 0);
  const wheelS = kitMesh(geo(new THREE.TorusGeometry(0.1, 0.012, 8, 28)), 'carbon');
  wheelS.rotation.y = Math.PI / 2 - 0.35;
  wheelS.position.set(0.56, 0.64, 0);
  const headrest = kitMesh(geo(chamferBox(0.16, 0.08, 0.5, 0.03)), 'carbon');
  headrest.position.set(0.12, 0.64, 0);
  body.add(opening, helmet, visor, wheelS, headrest);
  // halo: titanium hoop + centre pillar
  const halo = kitMesh(
    geo(
      mergeGeometries([
        pipe(
          [
            v3(0.02, 0.6, 0.3),
            v3(0.3, 0.74, 0.29),
            v3(0.56, 0.8, 0.16),
            v3(0.72, 0.81, 0),
            v3(0.56, 0.8, -0.16),
            v3(0.3, 0.74, -0.29),
            v3(0.02, 0.6, -0.3),
          ],
          0.024,
          Math.round(48 * tess) + 12,
          12,
        ),
        pipe([v3(0.72, 0.81, 0), v3(0.85, 0.74, 0), v3(0.95, 0.6, 0)], 0.026, 12, 12),
      ]),
    ),
    'steel',
    'halo',
  );
  body.add(halo);
  for (const s of [-1, 1]) {
    const mirror = kitMesh(geo(chamferBox(0.06, 0.05, 0.13, 0.012)), 'carbon');
    mirror.position.set(0.8, 0.69, s * 0.47);
    const stalk = kitMesh(
      geo(strut(v3(0.8, 0.66, s * 0.42), v3(0.86, 0.52, s * 0.3), 0.008)),
      'carbon',
    );
    body.add(mirror, stalk);
  }

  // --- sidepods: left solid, right (camera side) cut open over the radiator ---------------
  for (const s of [-1, 1]) {
    const st = sidepod(s * POD_Z);
    body.add(paintMesh(geo(loftGeometry(st, radial, sub)), s > 0 ? paintPod : paintPlain));
    const inlet = kitMesh(geo(new THREE.CircleGeometry(1, 24).rotateY(Math.PI / 2)), 'rubber');
    inlet.scale.set(1, 0.08, 0.1);
    inlet.position.set(0.865, 0.45, s * POD_Z);
    body.add(inlet);
    if (s > 0) {
      // horizontal section: same band routine on the y↔z-swapped skin, swapped back
      const swapped = st.map((q) => ({ x: q.x, w: q.h, h: q.w, y: q.z ?? 0, z: q.y, n: q.n }));
      const band = sectionBand(swapped, sub * 2, POD_CUT_Y + 0.0005, 0.012);
      if (band) {
        band.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
        body.add(ownMesh(geo(band), sectionMat));
      }
    }
    // radiator: aluminium core with fins, tilted back like a real side-pod cooler
    const fins: THREE.BufferGeometry[] = [chamferBox(0.04, 0.24, 0.26, 0.006)];
    for (let k = 0; k < 14; k++) {
      const f = new THREE.BoxGeometry(0.07, 0.006, 0.25);
      f.translate(0, -0.11 + (k * 0.22) / 13, 0);
      fins.push(f);
    }
    const rad = kitMesh(merged(fins), 'steel', 'radiator');
    rad.position.set(RADIATOR.x, RADIATOR.y, s * POD_Z);
    rad.rotation.z = -0.35;
    body.add(rad);
  }

  // --- floor (plank, edges), diffuser with strakes ---------------------------------------
  const floorShape = new THREE.Shape();
  const outline: Array<[number, number]> = [
    [1.4, 0.32],
    [1.15, 0.62],
    [0.85, 0.88],
    [-1.15, 0.9],
    [-1.45, 0.68],
    [-1.62, 0.55],
    [-2.12, 0.5],
  ];
  floorShape.moveTo(outline[0]?.[0] ?? 0, -(outline[0]?.[1] ?? 0));
  for (const [x, z] of outline.slice(1)) floorShape.lineTo(x, -z);
  for (const [x, z] of [...outline].reverse()) floorShape.lineTo(x, z);
  const floor = aeroMesh(
    geo(
      new THREE.ExtrudeGeometry(floorShape, { depth: 0.025, bevelEnabled: false }).rotateX(
        Math.PI / 2,
      ),
    ),
  );
  floor.position.y = CAR_DIMS.rideHeight + 0.025;
  const plank = kitMesh(geo(chamferBox(2.6, 0.012, 0.3, 0.004)), 'plastic', 'plank');
  plank.position.set(-0.2, CAR_DIMS.rideHeight - 0.004, 0);
  body.add(floor, plank);
  for (const s of [-1, 1]) {
    const edge = aeroMesh(geo(chamferBox(1.9, 0.06, 0.014, 0.005)));
    edge.position.set(-0.15, CAR_DIMS.rideHeight + 0.05, s * 0.895);
    body.add(edge);
  }
  const diff: THREE.BufferGeometry[] = [chamferBox(0.6, 0.02, 1.0, 0.008)];
  for (const zz of [-0.45, -0.22, 0, 0.22, 0.45]) {
    const k = new THREE.BoxGeometry(0.56, 0.1, 0.012);
    k.translate(0, 0.05, zz);
    diff.push(k);
  }
  const diffuser = aeroMesh(merged(diff));
  diffuser.position.set(-1.95, 0.12, 0);
  diffuser.rotation.z = 0.3;
  body.add(diffuser);

  // --- wings: 4-element front wing, rear wing with DRS flap and beam wing ----------------
  const fw = [
    { c: 0.32, span: 1.9, x: 2.72, y: 0.1, a: -0.04 },
    { c: 0.17, span: 1.8, x: 2.53, y: 0.14, a: -0.28 },
    { c: 0.13, span: 1.7, x: 2.43, y: 0.19, a: -0.5 },
    { c: 0.1, span: 1.6, x: 2.37, y: 0.24, a: -0.72 },
  ];
  for (const e of fw) {
    const m = aeroMesh(geo(wingGeometry(e.c, e.span, 0.1, 0.06)));
    m.position.set(e.x, e.y, 0);
    m.rotation.z = e.a;
    body.add(m);
  }
  for (const s of [-1, 1]) {
    const ep = aeroMesh(geo(chamferBox(0.46, 0.22, 0.014, 0.02)));
    ep.position.set(2.58, 0.15, s * 0.96);
    const pillar = aeroMesh(geo(chamferBox(0.18, 0.12, 0.012, 0.004)));
    pillar.position.set(2.5, 0.17, s * 0.08);
    body.add(ep, pillar);
  }
  const rw = [
    { c: 0.36, x: -2.46, y: 0.8, a: -0.12 },
    { c: 0.22, x: -2.67, y: 0.94, a: -0.5 },
  ];
  for (const e of rw) {
    const m = aeroMesh(geo(wingGeometry(e.c, 1.0, 0.11, 0.06)));
    m.position.set(e.x, e.y, 0);
    m.rotation.z = e.a;
    body.add(m);
  }
  const beam = aeroMesh(geo(wingGeometry(0.17, 0.9, 0.1, 0.05)));
  beam.position.set(-2.36, 0.4, 0);
  beam.rotation.z = -0.15;
  const pylon = aeroMesh(geo(chamferBox(0.16, 0.5, 0.02, 0.006)));
  pylon.position.set(-2.32, 0.55, 0);
  const rainLight = kitMesh(geo(chamferBox(0.03, 0.06, 0.08, 0.008)), 'darkSteel');
  rainLight.position.set(-2.42, 0.24, 0);
  body.add(beam, pylon, rainLight);
  for (const s of [-1, 1]) {
    const ep = aeroMesh(geo(chamferBox(0.66, 0.6, 0.016, 0.06)));
    ep.position.set(-2.52, 0.73, s * 0.51);
    body.add(ep);
  }

  // --- suspension: faired carbon wishbones, push/pull rods, track rods, driveshafts -------
  const arms: THREE.BufferGeometry[] = [];
  const shafts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const F = CAR_DIMS.frontAxleX;
    const R = CAR_DIMS.rearAxleX;
    const zf = s * (CAR_DIMS.trackFront - 0.12);
    const zr = s * (CAR_DIMS.trackRear - 0.17);
    arms.push(
      strut(v3(F - 0.22, 0.42, s * 0.17), v3(F, 0.48, zf), 0.014, 2.6),
      strut(v3(F + 0.16, 0.42, s * 0.15), v3(F, 0.48, zf), 0.014, 2.6),
      strut(v3(F - 0.26, 0.23, s * 0.18), v3(F, 0.22, zf), 0.014, 2.6),
      strut(v3(F + 0.2, 0.23, s * 0.14), v3(F, 0.22, zf), 0.014, 2.6),
      // pushrod (wheel bottom → rocker high on the chassis) and track rod
      strut(v3(F - 0.02, 0.24, zf * 0.95), v3(F - 0.08, 0.53, s * 0.17), 0.012, 1.8),
      strut(v3(F + 0.08, 0.3, zf * 0.97), v3(F + 0.12, 0.3, s * 0.16), 0.01, 2),
      strut(v3(R + 0.26, 0.44, s * 0.16), v3(R, 0.48, zr), 0.014, 2.6),
      strut(v3(R - 0.16, 0.44, s * 0.13), v3(R, 0.48, zr), 0.014, 2.6),
      strut(v3(R + 0.26, 0.19, s * 0.15), v3(R, 0.19, zr), 0.014, 2.6),
      strut(v3(R - 0.2, 0.19, s * 0.13), v3(R, 0.19, zr), 0.014, 2.6),
      // pullrod (wheel top → rocker low on the gearbox) and toe link
      strut(v3(R + 0.02, 0.46, zr * 0.95), v3(R + 0.08, 0.18, s * 0.11), 0.012, 1.8),
      strut(v3(R - 0.1, 0.3, zr * 0.97), v3(R - 0.12, 0.3, s * 0.12), 0.01, 2),
    );
    shafts.push(strut(v3(R, 0.34, s * 0.1), v3(R, 0.36, zr), 0.022, 1, 14));
    // CV joint boots
    shafts.push(new THREE.SphereGeometry(0.036, 14, 10).translate(R, 0.36, zr * 0.93));
  }
  body.add(kitMesh(merged(arms), 'carbon', 'susp'));
  body.add(kitMesh(merged(shafts), 'steel', 'shaft'));

  // --- power unit: 90° V6, gearbox, turbo, exhausts -------------------------------------
  const ICE = { x: -0.85, len: 0.98 };
  const crank = kitMesh(geo(chamferBox(ICE.len, 0.14, 0.24, 0.03)), 'iron', 'pu');
  crank.position.set(ICE.x, 0.2, 0);
  const sump = kitMesh(geo(chamferBox(ICE.len * 0.9, 0.05, 0.2, 0.02)), 'darkSteel', 'pu');
  sump.position.set(ICE.x, 0.115, 0);
  body.add(crank, sump);
  const coilGeo = geo(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12));
  const bankGeo = geo(chamferBox(0.94, 0.24, 0.13, 0.025));
  const camGeo = geo(chamferBox(0.92, 0.035, 0.12, 0.015));
  for (const s of [-1, 1]) {
    const bank = new THREE.Group();
    bank.position.set(ICE.x, 0.36, s * 0.1);
    bank.rotation.x = (s * Math.PI) / 4;
    const block = kitMesh(bankGeo, 'iron', 'pu');
    const cam = kitMesh(camGeo, 'steel', 'cam');
    cam.position.y = 0.135;
    bank.add(block, cam);
    for (let k = 0; k < 3; k++) {
      const coil = kitMesh(coilGeo, 'plastic', 'coil');
      coil.position.set(-0.3 + k * 0.3, 0.165, 0);
      bank.add(coil);
    }
    body.add(bank);
    // exhaust primaries: three per bank from the outer face to the turbine
    const prim: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const x0 = ICE.x + 0.3 - k * 0.3;
      prim.push(
        pipe(
          [
            v3(x0, 0.43, s * 0.19),
            v3(x0 - 0.1, 0.43, s * 0.25),
            v3(-1.2, 0.4, s * (0.2 - k * 0.012)),
            v3(-1.42, 0.38, s * 0.09),
          ],
          0.017,
          28,
          10,
        ),
      );
    }
    body.add(kitMesh(merged(prim), 'steel', 'exhaust'));
  }
  body.add(kitMesh(geo(loftGeometry(PLENUM, radial, sub)), 'carbon', 'plenum'));
  const turbo = kitMesh(
    merged([
      new THREE.TorusGeometry(0.065, 0.032, 12, 32).rotateY(Math.PI / 2),
      new THREE.CylinderGeometry(0.05, 0.05, 0.1, 24).rotateZ(Math.PI / 2),
      new THREE.CylinderGeometry(0.028, 0.03, 0.24, 16).translate(0, 0.12, 0).rotateZ(-0.6),
    ]),
    'steel',
    'turbo',
  );
  turbo.position.set(-1.48, 0.38, 0);
  body.add(turbo);
  body.add(kitMesh(geo(loftGeometry(GEARBOX, radial, sub)), 'iron', 'gearbox'));

  // --- MGU-K: opened housing, stator teeth, copper end windings, glowing rotor band ------
  const mguk = new THREE.Group();
  mguk.position.set(MGUK.x, MGUK.y, MGUK.z);
  const hs = base ? 24 : Math.max(32, Math.round(64 * tess));
  const housing = ownMesh(
    geo(new THREE.CylinderGeometry(MGUK.r, MGUK.r, MGUK.len, hs, 1, true).rotateZ(Math.PI / 2)),
    housingMat,
  );
  const ends: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    ends.push(
      new THREE.RingGeometry(0.02, MGUK.r, hs)
        .rotateY(Math.PI / 2)
        .translate((sx * MGUK.len) / 2, 0, 0),
    );
  }
  const endPlates = ownMesh(merged(ends), housingMat);
  // red rim on the cut faces of the housing wall
  const rim = ownMesh(
    geo(
      new THREE.CylinderGeometry(MGUK.r - 0.001, MGUK.r - 0.001, MGUK.len, hs, 1, true).rotateZ(
        Math.PI / 2,
      ),
    ),
    housingCapMat,
  );
  rim.scale.set(1, 0.93, 0.93);
  const teeth = kitMesh(
    merged([
      ...radialTeeth(24, 0.054, 0.08, 0.012, MGUK.len * 0.66),
      new THREE.CylinderGeometry(0.08, 0.08, MGUK.len * 0.66, hs, 1, true).rotateZ(Math.PI / 2),
    ]),
    'iron',
    'stator',
  );
  const band = kitMesh(
    geo(new THREE.CylinderGeometry(0.05, 0.05, MGUK.len * 0.62, hs, 1, true).rotateZ(Math.PI / 2)),
    'glowEnergy',
    'mguk',
  );
  const windGeo = geo(new THREE.TorusGeometry(0.066, 0.014, 10, 36).rotateY(Math.PI / 2));
  const w1 = kitMesh(windGeo, 'copper', 'mgukWind');
  w1.position.x = MGUK.len * 0.36;
  const w2 = kitMesh(windGeo, 'copper', 'mgukWind');
  w2.position.x = -MGUK.len * 0.36;
  const shaft = kitMesh(
    geo(new THREE.CylinderGeometry(0.016, 0.016, MGUK.len + 0.08, 16).rotateZ(Math.PI / 2)),
    'steel',
  );
  mguk.add(housing, endPlates, rim, teeth, band, w1, w2, shaft);
  body.add(mguk);
  // drive gear from the crank nose to the MGU-K pinion
  const gear = kitMesh(
    merged([
      ...radialTeeth(28, 0.06, 0.072, 0.012, 0.025),
      new THREE.CylinderGeometry(0.062, 0.062, 0.025, 32).rotateZ(Math.PI / 2),
    ]),
    'steel',
    'gear',
  );
  gear.position.set(MGUK.x + MGUK.len / 2 + 0.03, 0.2, 0.12);
  body.add(gear);

  // --- energy store: open case, cell modules, side charge gauge -------------------------
  const batCase = kitMesh(
    merged([
      chamferBox(BAT.len, 0.018, BAT.w, 0.006).translate(0, -BAT.h / 2, 0),
      new THREE.BoxGeometry(BAT.len, BAT.h, 0.012).translate(0, 0, -BAT.w / 2),
      new THREE.BoxGeometry(BAT.len, BAT.h, 0.012).translate(0, 0, BAT.w / 2),
      new THREE.BoxGeometry(0.012, BAT.h, BAT.w).translate(BAT.len / 2, 0, 0),
      new THREE.BoxGeometry(0.012, BAT.h, BAT.w).translate(-BAT.len / 2, 0, 0),
    ]),
    'plastic',
    'battery',
  );
  batCase.position.set(BAT.x, BAT.y, 0);
  const cells: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 7; j++) {
      const c = chamferBox(0.048, BAT.h * 0.8, 0.054, 0.006);
      c.translate(-BAT.len / 2 + 0.035 + i * 0.058, -0.004, -BAT.w / 2 + 0.042 + j * 0.0625);
      cells.push(c);
    }
  const cellMesh = kitMesh(merged(cells), 'darkSteel', 'cells');
  cellMesh.position.set(BAT.x, BAT.y, 0);
  const busbars: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    busbars.push(
      new THREE.BoxGeometry(0.012, 0.006, BAT.w * 0.88).translate(
        -BAT.len / 2 + 0.035 + i * 0.058,
        BAT.h * 0.4,
        0,
      ),
    );
  }
  const bus = kitMesh(merged(busbars), 'copper', 'busbar');
  bus.position.set(BAT.x, BAT.y, 0);
  const GAUGE = { len: BAT.len * 0.86, h: BAT.h * 0.42 };
  const gaugeBack = kitMesh(
    geo(chamferBox(GAUGE.len + 0.014, GAUGE.h + 0.014, 0.006, 0.003)),
    'rubber',
  );
  gaugeBack.position.set(BAT.x, BAT.y, BAT.w / 2 + 0.008);
  const batFill = kitMesh(geo(new THREE.BoxGeometry(1, GAUGE.h, 0.006)), 'glowEnergy', 'battery');
  batFill.position.set(BAT.x, BAT.y, BAT.w / 2 + 0.012);
  body.add(batCase, cellMesh, bus, gaugeBack, batFill);
  // HV cables MGU-K ↔ store (three phases, black sleeves)
  const hv: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const dz = (k - 1) * 0.018;
    hv.push(
      pipe(
        [
          v3(MGUK.x + 0.06, MGUK.y + 0.07, MGUK.z - 0.06 + dz),
          v3(-0.36, 0.22, 0.17 + dz),
          v3(BAT.x - BAT.len / 2 + 0.02, 0.2, 0.12 + dz),
        ],
        0.008,
        16,
        6,
      ),
    );
  }
  body.add(kitMesh(merged(hv), 'rubber', 'hv'));

  // --- wheels (unsprung: not pitched) ----------------------------------------------------------
  interface Wheel {
    group: THREE.Group;
    spin: THREE.Group;
    spokes: THREE.Mesh;
    blur: THREE.Mesh;
    patch: THREE.Mesh | null;
  }
  const wheels: Wheel[] = [];
  const R = CAR_DIMS.tyreRadius;
  const rimR = CAR_DIMS.rimRadius;
  const latheSegs = base ? 20 : Math.max(28, Math.round(64 * tess));
  const makeTyre = (W: number): THREE.BufferGeometry => {
    const hw = W / 2;
    const p = [
      [rimR + 0.004, -hw + 0.03],
      [0.285, -hw - 0.004],
      [0.335, -hw + 0.008],
      [R - 0.002, -hw + 0.03],
      [R, -hw + 0.06],
      [R, hw - 0.06],
      [R - 0.002, hw - 0.03],
      [0.335, hw - 0.008],
      [0.285, hw + 0.004],
      [rimR + 0.004, hw - 0.03],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(p, latheSegs).rotateX(Math.PI / 2);
  };
  const tyreGeo = {
    front: geo(makeTyre(CAR_DIMS.tyreWidthFront)),
    rear: geo(makeTyre(CAR_DIMS.tyreWidthRear)),
  };
  const bandGeo = geo(new THREE.RingGeometry(0.262, 0.27, latheSegs));
  const lipGeo = geo(new THREE.TorusGeometry(rimR + 0.002, 0.011, 8, latheSegs));
  const barrel = (W: number): THREE.BufferGeometry =>
    geo(
      flipFaces(
        new THREE.CylinderGeometry(rimR, rimR * 0.92, W * 0.9, latheSegs, 1, true).rotateX(
          Math.PI / 2,
        ),
      ),
    );
  const barrelGeo = {
    front: barrel(CAR_DIMS.tyreWidthFront),
    rear: barrel(CAR_DIMS.tyreWidthRear),
  };
  const spokeParts: THREE.BufferGeometry[] = [];
  const NSPOKE = 10;
  for (let k = 0; k < NSPOKE; k++) {
    const g = new THREE.BoxGeometry(0.17, 0.02, 0.016);
    g.translate(0.135, 0, 0);
    g.rotateZ((k / NSPOKE) * Math.PI * 2);
    spokeParts.push(g);
  }
  spokeParts.push(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 24).rotateX(Math.PI / 2));
  const spokesGeo = merged(spokeParts);
  const nutGeo = geo(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 6).rotateX(Math.PI / 2));
  const makeDisc = (d: {
    outer: number;
    inner: number;
    thickness: number;
  }): THREE.BufferGeometry => {
    const t = d.thickness / 2;
    return new THREE.LatheGeometry(
      [
        new THREE.Vector2(d.inner, -t),
        new THREE.Vector2(d.outer, -t),
        new THREE.Vector2(d.outer, t),
        new THREE.Vector2(d.inner, t),
        new THREE.Vector2(d.inner, -t),
      ],
      latheSegs,
    ).rotateX(Math.PI / 2);
  };
  const discGeo = {
    front: geo(makeDisc(CAR_DIMS.discFront)),
    rear: geo(makeDisc(CAR_DIMS.discRear)),
  };
  // flat faces with planar UVs so the machining rings are concentric
  const discFaceGeo = {
    front: geo(
      new THREE.RingGeometry(CAR_DIMS.discFront.inner, CAR_DIMS.discFront.outer, latheSegs),
    ),
    rear: geo(new THREE.RingGeometry(CAR_DIMS.discRear.inner, CAR_DIMS.discRear.outer, latheSegs)),
  };
  const blurGeo = geo(new THREE.CircleGeometry(rimR, 48));
  const caliperGeo = geo(chamferBox(0.1, 0.17, 0.075, 0.02));
  const uprightGeo = geo(chamferBox(0.08, 0.36, 0.05, 0.015));
  const ductGeo = geo(
    new THREE.CylinderGeometry(0.2, 0.21, 0.08, latheSegs, 1, true).rotateX(Math.PI / 2),
  );
  const patchGeo = geo(new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2));

  const corners = [
    { axle: 'front' as const, x: CAR_DIMS.frontAxleX, z: CAR_DIMS.trackFront },
    { axle: 'front' as const, x: CAR_DIMS.frontAxleX, z: -CAR_DIMS.trackFront },
    { axle: 'rear' as const, x: CAR_DIMS.rearAxleX, z: CAR_DIMS.trackRear },
    { axle: 'rear' as const, x: CAR_DIMS.rearAxleX, z: -CAR_DIMS.trackRear },
  ];
  for (const c of corners) {
    const W = c.axle === 'front' ? CAR_DIMS.tyreWidthFront : CAR_DIMS.tyreWidthRear;
    const dsk = c.axle === 'front' ? CAR_DIMS.discFront : CAR_DIMS.discRear;
    const group = new THREE.Group();
    group.position.set(c.x, R, c.z);
    group.scale.z = Math.sign(c.z); // +z = outer face
    const spin = new THREE.Group();
    group.add(spin);
    const tyre = kitMesh(tyreGeo[c.axle], 'rubber');
    const bandM = kitMesh(bandGeo, 'ceramic', 'sidewall');
    bandM.position.z = W / 2 + 0.006;
    const lip = kitMesh(lipGeo, 'steel', 'rim');
    lip.position.z = W / 2 - 0.02;
    const barrelM = kitMesh(barrelGeo[c.axle], 'darkSteel', 'rim');
    const spokes = kitMesh(spokesGeo, 'darkSteel', 'rim');
    spokes.position.z = W / 2 - 0.04;
    const nut = kitMesh(nutGeo, 'steel', 'rim');
    nut.position.z = W / 2 - 0.01;
    const disc = ownMesh(discGeo[c.axle], discMat[c.axle]);
    disc.position.z = -0.01;
    const face = ownMesh(discFaceGeo[c.axle], discMat[c.axle]);
    face.position.z = -0.01 + dsk.thickness / 2 + 0.0005;
    const blur = ownMesh(blurGeo, blurMat);
    blur.position.z = W / 2 - 0.028;
    blur.renderOrder = 5;
    spin.add(tyre, bandM, lip, barrelM, spokes, nut, disc, face, blur);
    // caliper on the upright, rear-top of the disc; brake duct drum on the inner side
    const caliper = kitMesh(caliperGeo, 'darkSteel', 'caliper');
    const ang = Math.PI * 0.62;
    caliper.position.set(
      Math.cos(ang) * (dsk.outer - 0.03),
      Math.sin(ang) * (dsk.outer - 0.03),
      -0.01,
    );
    caliper.rotation.z = ang - Math.PI / 2;
    const upright = kitMesh(uprightGeo, 'iron', 'upright');
    upright.position.z = -0.06;
    const duct = kitMesh(ductGeo, 'carbon', 'duct');
    duct.position.z = -W / 2 + 0.02;
    group.add(caliper, upright, duct);
    root.add(group);
    let patch: THREE.Mesh | null = null;
    if (opts.patches) {
      patch = ownMesh(patchGeo, patchMat[c.axle]);
      patch.position.set(c.x, 0.004, c.z);
      patch.scale.set(0.62, 1, W + 0.12);
      patch.renderOrder = 2;
      root.add(patch);
      noShadow.push(patch);
    }
    noShadow.push(blur);
    wheels.push({ group, spin, spokes, blur, patch });
  }

  // work lamp over the opened bay (no shadows): lifts the power unit out of the dark studio
  const bayLamp = new THREE.PointLight(0xfff1e0, 2.4, 2.4, 1.6);
  bayLamp.position.set(-0.5, 1.05, 0.75);
  body.add(bayLamp);

  stage.castShadows(root);
  for (const o of noShadow) o.castShadow = false;

  // --- energy ribbons (re-parented into the body so they pitch with it) ----------------------
  const ribbonOpts = {
    widthPerWatt: RIBBON_M_PER_W,
    minRadius: 0.006,
    maxRadius: 0.11,
    pRef: 120e3,
  };
  const mx0 = MGUK.x - MGUK.len / 2;
  const mx1 = MGUK.x + MGUK.len / 2;
  const mech = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v3(CAR_DIMS.rearAxleX, 0.36, 0.6),
      v3(CAR_DIMS.rearAxleX + 0.05, 0.34, 0.24),
      v3(-1.4, 0.2, 0.25),
      v3(-0.95, 0.17, 0.3),
      v3(mx0 - 0.02, MGUK.y, MGUK.z + 0.03),
    ],
  });
  const elec = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v3(mx1, MGUK.y + 0.02, MGUK.z),
      v3(-0.36, MGUK.y + 0.06, MGUK.z + 0.04),
      v3(BAT.x - 0.06, BAT.y + 0.07, BAT.w / 2 - 0.02),
      v3(BAT.x + 0.06, BAT.y + 0.02, 0.12),
    ],
  });
  // Losses become heat: same ribbon, dimmed colour (it is not stored energy).
  const loss = createEnergyRibbon(stage, {
    ...ribbonOpts,
    dim: 0.42,
    path: [
      v3(MGUK.x, MGUK.y + 0.08, MGUK.z + 0.04),
      v3(-0.3, 0.4, 0.42),
      v3(0.05, 0.42, POD_Z - 0.04),
      v3(RADIATOR.x - 0.04, RADIATOR.y, POD_Z),
    ],
  });
  for (const r of [mech, elec, loss]) {
    body.add(r.object);
    r.object.renderOrder = 7;
  }
  // base tier: bake the static body parts to one mesh per material (draw-call budget). Kept as
  // they are: the paint meshes (swapped on a tier switch), the battery fill gauge, the glowing
  // MGU-K band and the energy ribbons (rebuilt every frame).
  if (base) {
    mergeStatic(body, {
      kit,
      track: geo,
      drop: (g) => {
        if (geometries.delete(g)) carStats.liveGeometries--;
        g.dispose();
      },
      keep: [
        ...paintSlots.flatMap((sl) => sl.meshes),
        batFill,
        band,
        mech.object,
        elec.object,
        loss.object,
      ],
    });
  }
  // kit materials animated every frame (re-fetched after a tier/theme switch)
  const glow = { battery: kit.get('glowEnergy', 'battery'), mguk: kit.get('glowEnergy', 'mguk') };
  const refetch = (): void => {
    glow.battery = kit.get('glowEnergy', 'battery');
    glow.mguk = kit.get('glowEnergy', 'mguk');
  };
  const offTheme = stage.onThemeChange(() => refetch());

  const offTier = stage.onTierChange(() => {
    refetch();
    for (const slot of paintSlots) {
      const old = slot.mat;
      slot.mat = own(makePaint(slot.clip));
      for (const m of slot.meshes) m.material = slot.mat;
      const i = materials.indexOf(old);
      if (i >= 0) materials.splice(i, 1);
      old.dispose();
      carStats.liveMaterials--;
    }
  });

  // --- anchors ---------------------------------------------------------------------------------------
  const local: Record<keyof CarAnchors, THREE.Vector3> = {
    mguk: v3(MGUK.x, MGUK.y + MGUK.r, MGUK.z + 0.04),
    battery: v3(BAT.x, BAT.y, BAT.w / 2 + 0.02),
    radiator: v3(RADIATOR.x, 0.55, POD_Z),
    discFront: v3(CAR_DIMS.frontAxleX, R, CAR_DIMS.trackFront + 0.16),
    discRear: v3(CAR_DIMS.rearAxleX, R, CAR_DIMS.trackRear + 0.21),
    frontWing: v3(2.7, 0.3, 0.6),
    rearWing: v3(-2.5, 1.02, 0),
    frontTop: v3(CAR_DIMS.frontAxleX - 0.2, 0.52, 0),
    rearTop: v3(-2.46, 0.92, 0),
    contactFront: v3(CAR_DIMS.frontAxleX, 0, CAR_DIMS.trackFront + 0.25),
    contactRear: v3(CAR_DIMS.rearAxleX, 0, CAR_DIMS.trackRear + 0.3),
    dragPoint: v3(-2.85, 0.7, 0),
  };
  const unsprung = new Set<keyof CarAnchors>([
    'discFront',
    'discRear',
    'contactFront',
    'contactRear',
  ]);
  const anchors = {} as CarAnchors;
  for (const k of Object.keys(local) as Array<keyof CarAnchors>) anchors[k] = local[k].clone();

  let fillLast = -1;
  const update = (f: CarFrame): void => {
    body.rotation.z = -f.pitch;
    body.position.y = -f.heave;
    // wheels: φ = x / r (rolling without slip)
    const phi = f.x / R;
    const omega = Math.abs(f.v) / R;
    const blurO = Math.min(0.9, Math.max(0, (omega - 20) / 45));
    blurMat.opacity = blurO;
    for (const w of wheels) {
      w.spin.rotation.z = -phi;
      w.spokes.visible = blurO < 0.55;
      w.blur.visible = blurO > 0.01;
    }
    applyHeatGlow(discMat.front, f.tFront);
    applyHeatGlow(discMat.rear, f.tRear);
    const fill = Math.min(1, Math.max(0, f.batteryFill));
    if (fill !== fillLast) {
      fillLast = fill;
      const len = Math.max(1e-3, GAUGE.len * fill);
      batFill.scale.x = len;
      batFill.position.x = BAT.x - GAUGE.len / 2 + len / 2;
      batFill.visible = fill > 0.002;
    }
    glow.battery.emissiveIntensity = 0.6 + 1.2 * fill;
    const pRel = Math.min(1, Math.abs(f.pElec) / 350e3);
    glow.mguk.emissiveIntensity = 0.08 + 3.2 * Math.sqrt(pRel);
    mech.setPower(f.pMech);
    elec.setPower(f.pElec);
    loss.setPower(f.pLoss);
    for (const w of wheels) {
      if (!w.patch) continue;
      const front = w.group.position.x > 0;
      const s = front ? f.slipFront : f.slipRear;
      w.patch.visible = s !== undefined;
      const mat = front ? patchMat.front : patchMat.rear;
      const k = Math.min(1.2, Math.max(0, s ?? 0));
      mat.opacity = 0.9 * k * k;
    }
    root.updateMatrixWorld(true);
    // the MGU-K cut planes follow the pitching body
    for (const [w, l] of [
      [mgukCut, mgukCutLocal],
      [podCut, podCutLocal],
    ] as const) {
      for (let i = 0; i < w.length; i++) {
        (w[i] as THREE.Plane).copy(l[i] as THREE.Plane).applyMatrix4(body.matrixWorld);
      }
    }
    for (const k of Object.keys(local) as Array<keyof CarAnchors>) {
      anchors[k].copy(local[k]).applyMatrix4(unsprung.has(k) ? root.matrixWorld : body.matrixWorld);
    }
  };

  carStats.liveCars++;
  let disposed = false;
  return {
    root,
    body,
    anchors,
    ribbons: { mech, elec, loss },
    textures,
    update,
    meshCount: () => meshes,
    dispose() {
      if (disposed) return;
      disposed = true;
      offTheme();
      offTier();
      for (const r of [mech, elec, loss]) {
        body.remove(r.object);
        r.dispose();
      }
      stage.scene.remove(root);
      for (const g of geometries) g.dispose();
      carStats.liveGeometries -= geometries.size;
      geometries.clear();
      for (const m of materials.splice(0)) {
        m.dispose();
        carStats.liveMaterials--;
      }
      for (const t of textures.splice(0)) {
        t.dispose();
        carStats.liveTextures--;
      }
      carStats.liveCars--;
    },
  };
}
