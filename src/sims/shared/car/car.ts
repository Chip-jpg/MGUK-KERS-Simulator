/**
 * Shared procedural car of the `kers-braking` and `car-dynamics` scenes: an ORIGINAL,
 * abstract open-wheel single-seater (no logos, no liveries, no copy of a real car),
 * built from lofted superellipse sections ({@link loftGeometry}), airfoil wings and
 * lathe-turned wheels. Shown as a "cut-away" museum exhibit: the engine cover and the
 * sidepods are transparent, revealing the power unit, the MGU-K, the energy store
 * (battery) in the floor and the radiators.
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
  type EnergyRibbon,
  type MaterialKind,
  type Stage,
} from '../../../render';
import { quantityColorHex } from '../../../ui/colors';
import { CAR_DIMS } from './dims';
import { loftGeometry, wingGeometry, type LoftStation } from './loft';
import { discFace, spinBlur } from './textures';
import { radialFade } from '../../../render/textures';

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

/** Flip the faces of a geometry (to see the inside of an open cylinder). */
function flipFaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    for (let k = 0; k < idx.count; k += 3) {
      const t = idx.getX(k + 1);
      idx.setX(k + 1, idx.getX(k + 2));
      idx.setX(k + 2, t);
    }
  }
  const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Cylinder between two points (for suspension arms). */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

// --- body sections (x, w, h, y[, z, n, flat]) -------------------------------------------
const FUSELAGE: LoftStation[] = [
  { x: 2.8, w: 0.11, h: 0.065, y: 0.205, n: 2.4 },
  { x: 2.45, w: 0.2, h: 0.125, y: 0.24, n: 2.6 },
  { x: 2.0, w: 0.3, h: 0.21, y: 0.295, n: 2.8 },
  { x: 1.45, w: 0.42, h: 0.31, y: 0.355, n: 3, flat: 0.4 },
  { x: 0.95, w: 0.56, h: 0.41, y: 0.395, n: 3.4, flat: 0.7 },
  { x: 0.45, w: 0.72, h: 0.47, y: 0.395, n: 3.8, flat: 0.8 },
  { x: 0.05, w: 0.78, h: 0.5, y: 0.4, n: 4, flat: 0.8 },
];
const ENGINE_COVER: LoftStation[] = [
  { x: 0.05, w: 0.78, h: 0.5, y: 0.4, n: 4, flat: 0.8 },
  { x: -0.45, w: 0.74, h: 0.5, y: 0.38, n: 3.6, flat: 0.8 },
  { x: -1.05, w: 0.58, h: 0.45, y: 0.35, n: 3.2, flat: 0.6 },
  { x: -1.65, w: 0.36, h: 0.32, y: 0.3, n: 2.8 },
  { x: -2.15, w: 0.18, h: 0.18, y: 0.27, n: 2.4 },
];
const AIRBOX: LoftStation[] = [
  { x: 0.02, w: 0.2, h: 0.2, y: 0.8, n: 2.6 },
  { x: -0.25, w: 0.27, h: 0.3, y: 0.76, n: 2.8 },
  { x: -0.7, w: 0.2, h: 0.26, y: 0.7, n: 2.6 },
  { x: -1.2, w: 0.1, h: 0.14, y: 0.62, n: 2.4 },
  { x: -1.55, w: 0.03, h: 0.04, y: 0.56 },
];
const sidepod = (z: number): { front: LoftStation[]; glass: LoftStation[] } => ({
  front: [
    { x: 0.84, w: 0.27, h: 0.22, y: 0.42, z, n: 3.6 },
    { x: 0.74, w: 0.33, h: 0.29, y: 0.41, z, n: 3.8 },
  ],
  glass: [
    { x: 0.74, w: 0.33, h: 0.29, y: 0.41, z, n: 3.8 },
    { x: 0.4, w: 0.35, h: 0.31, y: 0.4, z, n: 3.8 },
    { x: -0.3, w: 0.3, h: 0.26, y: 0.34, z: z * 0.94, n: 3.4 },
    { x: -1.1, w: 0.14, h: 0.14, y: 0.26, z: z * 0.68, n: 2.8 },
    { x: -1.45, w: 0.05, h: 0.05, y: 0.22, z: z * 0.5 },
  ],
});

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

  // --- own materials: paint (tier-aware), discs, spin blur, contact patches ------------
  const makePaint = (): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial =>
    stage.settings.pbr
      ? new THREE.MeshPhysicalMaterial({
          color: 0x9aa5b1,
          metalness: 0.55,
          roughness: 0.36,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
        })
      : new THREE.MeshLambertMaterial({ color: 0xa9b3bd });
  let paint = own(makePaint());
  const paintMeshes: THREE.Mesh[] = [];
  const paintMesh = (g: THREE.BufferGeometry): THREE.Mesh => {
    const m = new THREE.Mesh(g, paint);
    paintMeshes.push(m);
    meshes++;
    return m;
  };
  const accentMat = own(
    new THREE.MeshStandardMaterial({ color: 0x2fbfb1, roughness: 0.4, metalness: 0.2 }),
  );
  const discTex = texture(discFace());
  const discMat = {
    front: own(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: discTex,
        roughness: 0.75,
        metalness: 0.05,
      }),
    ),
    rear: own(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: discTex,
        roughness: 0.75,
        metalness: 0.05,
      }),
    ),
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
  const patchMat = {
    front: own(
      new THREE.MeshBasicMaterial({
        color: 0x3dd6c6,
        alphaMap: patchFade,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
    rear: own(
      new THREE.MeshBasicMaterial({
        color: 0x3dd6c6,
        alphaMap: patchFade,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  };

  const root = new THREE.Group();
  root.name = 'car';
  const body = new THREE.Group();
  body.name = 'car-body';
  root.add(body);
  stage.scene.add(root);
  const glassMeshes: THREE.Mesh[] = [];

  const radial = Math.max(14, Math.round(30 * tess));
  const sub = tess >= 0.9 ? 5 : 3;

  // --- monocoque, nose, engine cover, airbox ---------------------------------------------
  body.add(paintMesh(geo(loftGeometry(FUSELAGE, radial, sub))));
  const cover = kitMesh(geo(loftGeometry(ENGINE_COVER, radial, sub)), 'glass');
  cover.renderOrder = 6;
  glassMeshes.push(cover);
  body.add(cover);
  body.add(paintMesh(geo(loftGeometry(AIRBOX, radial, sub))));
  const intake = kitMesh(geo(new THREE.CircleGeometry(1, 20).rotateY(Math.PI / 2)), 'rubber');
  intake.scale.set(1, 0.075, 0.085);
  intake.position.set(0.023, 0.81, 0);
  body.add(intake);
  // cockpit opening, driver's helmet and visor
  const opening = kitMesh(geo(new THREE.SphereGeometry(1, 24, 12)), 'rubber');
  opening.scale.set(0.36, 0.05, 0.25);
  opening.position.set(0.52, 0.625, 0);
  const helmet = kitMesh(geo(new THREE.SphereGeometry(0.115, 24, 16)), 'ceramic');
  helmet.position.set(0.3, 0.7, 0);
  const visor = kitMesh(geo(new THREE.SphereGeometry(1, 20, 10)), 'plastic');
  visor.scale.set(0.05, 0.045, 0.095);
  visor.position.set(0.38, 0.71, 0);
  body.add(opening, helmet, visor);
  // halo-like hoop: one tube over the cockpit + a front pillar
  const haloArc = new THREE.CatmullRomCurve3([
    v3(0.02, 0.6, 0.3),
    v3(0.3, 0.74, 0.29),
    v3(0.56, 0.8, 0.16),
    v3(0.72, 0.81, 0),
    v3(0.56, 0.8, -0.16),
    v3(0.3, 0.74, -0.29),
    v3(0.02, 0.6, -0.3),
  ]);
  const haloPillar = new THREE.CatmullRomCurve3([
    v3(0.72, 0.81, 0),
    v3(0.85, 0.74, 0),
    v3(0.95, 0.6, 0),
  ]);
  const halo = kitMesh(
    geo(
      mergeGeometries([
        new THREE.TubeGeometry(haloArc, Math.round(48 * tess) + 12, 0.024, 10, false),
        new THREE.TubeGeometry(haloPillar, 12, 0.026, 10, false),
      ]),
    ),
    'darkSteel',
    'halo',
  );
  body.add(halo);
  // mirrors
  for (const s of [-1, 1]) {
    const mirror = kitMesh(geo(chamferBox(0.06, 0.05, 0.12, 0.012)), 'carbon');
    mirror.position.set(0.78, 0.69, s * 0.47);
    body.add(mirror);
  }

  // --- sidepods (painted inlet + transparent body), radiators --------------------------
  for (const s of [-1, 1]) {
    const sp = sidepod(s * 0.6);
    body.add(paintMesh(geo(loftGeometry(sp.front, radial, 2))));
    const glass = kitMesh(geo(loftGeometry(sp.glass, radial, sub)), 'glass');
    glass.renderOrder = 6;
    glassMeshes.push(glass);
    body.add(glass);
    const inlet = kitMesh(geo(new THREE.CircleGeometry(1, 20).rotateY(Math.PI / 2)), 'rubber');
    inlet.scale.set(1, 0.085, 0.11);
    inlet.position.set(0.845, 0.42, s * 0.6);
    body.add(inlet);
    const rad = kitMesh(geo(chamferBox(0.05, 0.22, 0.26, 0.01)), 'iron', 'radiator');
    rad.position.set(0.38, 0.4, s * 0.6);
    rad.rotation.z = -0.35;
    body.add(rad);
  }

  // --- floor, diffuser, accent edge ----------------------------------------------------------
  const floorShape = new THREE.Shape();
  const outline: Array<[number, number]> = [
    [1.4, 0.32],
    [1.15, 0.62],
    [0.85, 0.86],
    [-1.15, 0.88],
    [-1.45, 0.66],
    [-1.62, 0.54],
    [-2.12, 0.5],
  ];
  floorShape.moveTo(outline[0]?.[0] ?? 0, -(outline[0]?.[1] ?? 0));
  for (const [x, z] of outline.slice(1)) floorShape.lineTo(x, -z);
  for (const [x, z] of [...outline].reverse()) floorShape.lineTo(x, z);
  const floorGeo = geo(
    new THREE.ExtrudeGeometry(floorShape, { depth: 0.025, bevelEnabled: false }).rotateX(
      Math.PI / 2,
    ),
  );
  const floor = kitMesh(floorGeo, 'carbon', 'floor');
  floor.position.y = CAR_DIMS.rideHeight + 0.025;
  body.add(floor);
  const diffuser = kitMesh(geo(chamferBox(0.6, 0.02, 1.0, 0.008)), 'carbon');
  diffuser.position.set(-1.95, 0.15, 0);
  diffuser.rotation.z = 0.34;
  body.add(diffuser);
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(geo(chamferBox(1.9, 0.018, 0.03, 0.006)), accentMat);
    meshes++;
    edge.position.set(-0.15, CAR_DIMS.rideHeight + 0.03, s * 0.875);
    body.add(edge);
  }

  // --- wings ------------------------------------------------------------------------------------
  const fwMain = kitMesh(geo(wingGeometry(0.3, 1.86, 0.1, 0.05)), 'carbon');
  fwMain.position.set(2.72, 0.1, 0);
  fwMain.rotation.z = -0.06;
  const fwFlap1 = kitMesh(geo(wingGeometry(0.16, 1.7, 0.1, 0.07)), 'carbon');
  fwFlap1.position.set(2.55, 0.15, 0);
  fwFlap1.rotation.z = -0.3;
  const fwFlap2 = kitMesh(geo(wingGeometry(0.12, 1.6, 0.1, 0.07)), 'carbon');
  fwFlap2.position.set(2.45, 0.2, 0);
  fwFlap2.rotation.z = -0.55;
  body.add(fwMain, fwFlap1, fwFlap2);
  for (const s of [-1, 1]) {
    const ep = kitMesh(geo(chamferBox(0.42, 0.2, 0.014, 0.006)), 'carbon');
    ep.position.set(2.6, 0.14, s * 0.94);
    const tip = new THREE.Mesh(geo(chamferBox(0.42, 0.022, 0.02, 0.008)), accentMat);
    meshes++;
    tip.position.set(2.6, 0.245, s * 0.94);
    body.add(ep, tip);
  }
  const rwMain = kitMesh(geo(wingGeometry(0.34, 1.0, 0.11, 0.06)), 'carbon');
  rwMain.position.set(-2.46, 0.8, 0);
  rwMain.rotation.z = -0.12;
  const rwFlap = kitMesh(geo(wingGeometry(0.21, 1.0, 0.1, 0.07)), 'carbon');
  rwFlap.position.set(-2.66, 0.93, 0);
  rwFlap.rotation.z = -0.5;
  const beam = kitMesh(geo(wingGeometry(0.17, 0.9, 0.1, 0.05)), 'carbon');
  beam.position.set(-2.36, 0.4, 0);
  beam.rotation.z = -0.15;
  const pylon = kitMesh(geo(chamferBox(0.16, 0.5, 0.02, 0.006)), 'carbon');
  pylon.position.set(-2.32, 0.55, 0);
  body.add(rwMain, rwFlap, beam, pylon);
  for (const s of [-1, 1]) {
    const ep = kitMesh(geo(chamferBox(0.66, 0.58, 0.016, 0.03)), 'carbon');
    ep.position.set(-2.52, 0.72, s * 0.51);
    const tip = new THREE.Mesh(geo(chamferBox(0.66, 0.03, 0.022, 0.01)), accentMat);
    meshes++;
    tip.position.set(-2.52, 1.0, s * 0.51);
    body.add(ep, tip);
  }

  // --- suspension (merged carbon struts) ----------------------------------------------------
  const struts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const F = CAR_DIMS.frontAxleX;
    const R = CAR_DIMS.rearAxleX;
    const zf = s * (CAR_DIMS.trackFront - 0.1);
    const zr = s * (CAR_DIMS.trackRear - 0.16);
    struts.push(
      strut(v3(F - 0.2, 0.42, s * 0.18), v3(F, 0.47, zf), 0.016),
      strut(v3(F + 0.15, 0.42, s * 0.16), v3(F, 0.47, zf), 0.016),
      strut(v3(F - 0.25, 0.22, s * 0.2), v3(F, 0.22, zf), 0.016),
      strut(v3(F + 0.2, 0.22, s * 0.16), v3(F, 0.22, zf), 0.016),
      strut(v3(F, 0.24, zf * 0.96), v3(F - 0.05, 0.55, s * 0.2), 0.014),
      strut(v3(R + 0.25, 0.44, s * 0.16), v3(R, 0.48, zr), 0.016),
      strut(v3(R - 0.15, 0.44, s * 0.14), v3(R, 0.48, zr), 0.016),
      strut(v3(R + 0.25, 0.2, s * 0.16), v3(R, 0.2, zr), 0.016),
      strut(v3(R - 0.2, 0.2, s * 0.14), v3(R, 0.2, zr), 0.016),
      // drive shaft
      strut(v3(R, 0.34, s * 0.12), v3(R, 0.36, zr), 0.024),
    );
  }
  const susp = kitMesh(geo(mergeGeometries(struts)), 'carbon', 'susp');
  struts.forEach((g) => g.dispose());
  body.add(susp);

  // --- power unit (inside the transparent cover) ----------------------------------------------
  const ice = kitMesh(geo(chamferBox(0.9, 0.32, 0.3, 0.04)), 'darkSteel', 'pu');
  ice.position.set(-0.85, 0.3, 0);
  const gearbox = kitMesh(geo(chamferBox(0.62, 0.2, 0.22, 0.04)), 'darkSteel', 'pu');
  gearbox.position.set(-1.72, 0.3, 0);
  body.add(ice, gearbox);
  // MGU-K: steel housing, copper end windings, purple band glowing with the power
  const mguk = new THREE.Group();
  mguk.position.set(-1.0, 0.205, 0.215);
  const housing = kitMesh(
    geo(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 32).rotateZ(Math.PI / 2)),
    'steel',
  );
  const band = kitMesh(
    geo(new THREE.CylinderGeometry(0.088, 0.088, 0.07, 32, 1, true).rotateZ(Math.PI / 2)),
    'glowEnergy',
    'mguk',
  );
  const windGeo = geo(new THREE.TorusGeometry(0.062, 0.016, 10, 28).rotateY(Math.PI / 2));
  const w1 = kitMesh(windGeo, 'enamel');
  w1.position.x = 0.11;
  const w2 = kitMesh(windGeo, 'enamel');
  w2.position.x = -0.11;
  mguk.add(housing, band, w1, w2);
  body.add(mguk);
  // battery (energy store) in the floor, ahead of the engine: shell + purple fill gauge
  const BAT = { x: -0.2, y: 0.14, len: 0.4, h: 0.11, w: 0.5 };
  const batShell = kitMesh(geo(chamferBox(BAT.len, BAT.h, BAT.w, 0.015)), 'plastic', 'battery');
  batShell.position.set(BAT.x, BAT.y, 0);
  const batFill = kitMesh(
    geo(new THREE.BoxGeometry(1, BAT.h * 0.7, BAT.w * 0.86)),
    'glowEnergy',
    'battery',
  );
  batFill.position.set(BAT.x, BAT.y + 0.03, 0);
  const batLid = kitMesh(geo(chamferBox(BAT.len * 1.02, 0.012, BAT.w * 1.02, 0.004)), 'glass');
  batLid.position.set(BAT.x, BAT.y + BAT.h / 2 + 0.008, 0);
  batShell.scale.y = 0.6;
  batShell.position.y = BAT.y - BAT.h * 0.2;
  body.add(batShell, batFill, batLid);

  // --- wheels (unsprung: not pitched) --------------------------------------------------------------
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
  const latheSegs = Math.max(24, Math.round(56 * tess));
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
  const bandGeo = geo(new THREE.RingGeometry(0.262, 0.274, latheSegs));
  const lipGeo = geo(new THREE.TorusGeometry(rimR + 0.002, 0.011, 8, latheSegs));
  const barrelGeo = {
    front: geo(
      flipFaces(
        new THREE.CylinderGeometry(
          rimR,
          rimR * 0.92,
          CAR_DIMS.tyreWidthFront * 0.9,
          latheSegs,
          1,
          true,
        ).rotateX(Math.PI / 2),
      ),
    ),
    rear: geo(
      flipFaces(
        new THREE.CylinderGeometry(
          rimR,
          rimR * 0.92,
          CAR_DIMS.tyreWidthRear * 0.9,
          latheSegs,
          1,
          true,
        ).rotateX(Math.PI / 2),
      ),
    ),
  };
  const spokeParts: THREE.BufferGeometry[] = [];
  const NSPOKE = 10;
  for (let k = 0; k < NSPOKE; k++) {
    const g = new THREE.BoxGeometry(0.165, 0.026, 0.018);
    g.translate(0.135, 0, 0);
    g.rotateZ((k / NSPOKE) * Math.PI * 2);
    spokeParts.push(g);
  }
  spokeParts.push(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 20).rotateX(Math.PI / 2));
  const spokesGeo = geo(mergeGeometries(spokeParts));
  spokeParts.forEach((g) => g.dispose());
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
  const blurGeo = geo(new THREE.CircleGeometry(rimR, 40));
  const caliperGeo = geo(chamferBox(0.1, 0.17, 0.075, 0.02));
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
    const barrel = kitMesh(barrelGeo[c.axle], 'darkSteel', 'rim');
    const spokes = kitMesh(spokesGeo, 'darkSteel', 'rim');
    spokes.position.z = W / 2 - 0.04;
    const nut = kitMesh(nutGeo, 'steel', 'rim');
    nut.position.z = W / 2 - 0.01;
    const disc = new THREE.Mesh(discGeo[c.axle], discMat[c.axle]);
    disc.position.z = -0.01;
    const face = new THREE.Mesh(discFaceGeo[c.axle], discMat[c.axle]);
    face.position.z = -0.01 + dsk.thickness / 2 + 0.0005;
    meshes += 2;
    const blur = new THREE.Mesh(blurGeo, blurMat);
    meshes++;
    blur.position.z = W / 2 - 0.028;
    blur.renderOrder = 5;
    spin.add(tyre, bandM, lip, barrel, spokes, nut, disc, face, blur);
    // caliper: fixed to the upright, at the rear-top of the disc
    const caliper = kitMesh(caliperGeo, 'darkSteel', 'caliper');
    const ang = Math.PI * 0.62;
    caliper.position.set(
      Math.cos(ang) * (dsk.outer - 0.03),
      Math.sin(ang) * (dsk.outer - 0.03),
      -0.01,
    );
    caliper.rotation.z = ang - Math.PI / 2;
    group.add(caliper);
    root.add(group);
    let patch: THREE.Mesh | null = null;
    if (opts.patches) {
      patch = new THREE.Mesh(patchGeo, patchMat[c.axle]);
      meshes++;
      patch.position.set(c.x, 0.004, c.z);
      patch.scale.set(0.62, 1, W + 0.12);
      patch.renderOrder = 2;
      root.add(patch);
    }
    wheels.push({ group, spin, spokes, blur, patch });
  }

  stage.castShadows(root);
  for (const g of glassMeshes) g.castShadow = false;
  for (const w of wheels) {
    w.blur.castShadow = false;
    if (w.patch) w.patch.castShadow = false;
  }

  // --- energy ribbons (re-parented into the body so they pitch with it) ----------------------
  const ribbonOpts = {
    widthPerWatt: RIBBON_M_PER_W,
    minRadius: 0.006,
    maxRadius: 0.13,
    pRef: 120e3,
  };
  const mech = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [v3(-1.8, 0.36, 0.52), v3(-1.8, 0.35, 0.2), v3(-1.5, 0.27, 0.22), v3(-1.13, 0.21, 0.215)],
  });
  const elec = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [
      v3(-0.88, 0.205, 0.215),
      v3(-0.62, 0.2, 0.25),
      v3(-0.38, 0.19, 0.17),
      v3(-0.24, 0.17, 0.06),
    ],
  });
  const loss = createEnergyRibbon(stage, {
    ...ribbonOpts,
    path: [v3(-1.0, 0.29, 0.24), v3(-0.72, 0.42, 0.42), v3(-0.2, 0.42, 0.56), v3(0.3, 0.4, 0.6)],
  });
  for (const r of [mech, elec, loss]) {
    body.add(r.object);
    r.object.renderOrder = 7; // over the transparent cover, not dimmed by it
  }
  // Losses become heat: same ribbon, dimmed colour (it is not stored energy).
  const dimLoss = (): void => {
    const u = (loss.object.material as THREE.ShaderMaterial).uniforms['uColor'] as {
      value: THREE.Color;
    };
    u.value.setHex(quantityColorHex('energy', stage.theme)).multiplyScalar(0.42);
  };
  dimLoss();
  // kit materials animated every frame (re-fetched after a tier/theme switch)
  const glow = { battery: kit.get('glowEnergy', 'battery'), mguk: kit.get('glowEnergy', 'mguk') };
  const refetch = (): void => {
    glow.battery = kit.get('glowEnergy', 'battery');
    glow.mguk = kit.get('glowEnergy', 'mguk');
  };
  const offTheme = stage.onThemeChange(() => {
    dimLoss();
    refetch();
  });

  const offTier = stage.onTierChange(() => {
    refetch();
    const old = paint;
    paint = own(makePaint());
    for (const m of paintMeshes) m.material = paint;
    const i = materials.indexOf(old);
    if (i >= 0) materials.splice(i, 1);
    old.dispose();
    carStats.liveMaterials--;
  });

  // --- anchors ---------------------------------------------------------------------------------------
  const local: Record<keyof CarAnchors, THREE.Vector3> = {
    mguk: v3(-1.0, 0.3, 0.3),
    battery: v3(BAT.x, BAT.y + 0.08, 0.2),
    radiator: v3(0.38, 0.55, 0.62),
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
      const len = Math.max(1e-3, BAT.len * 0.92 * fill);
      batFill.scale.x = len;
      batFill.position.x = BAT.x - (BAT.len * 0.92) / 2 + len / 2;
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
