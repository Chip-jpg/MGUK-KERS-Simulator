/**
 * Assembly of the MGU-K teardown scene: the MGU-K (mguk.ts) with its single gear pair, the
 * schematic driveline to a rear wheel with its brake (shared car dimensions and disc texture),
 * the inverter and the energy store (power.ts), the AC busbars and the orange HV cables.
 * Owns every material: kit materials for the common looks, own ones for the rest, clipped
 * twins for the parts the quarter section ("Spaccato") cuts, flat section caps.
 * Layout in metres inside a root scaled by SCENE_SCALE; the MGU-K frame is in mm × MGUK_ZOOM.
 */
import * as THREE from 'three';
import { applyHeatGlow, chamferBox, type MaterialKind, type Stage } from '../../render';
import { BRAKE_DISC_ILLUSTRATIVE } from '../../physics';
import { CAR_DIMS } from '../shared/car/dims';
import { DISC_START_DEFAULT_C } from '../shared/car/discs';
import { discFace } from '../shared/car/textures';
import { carbonAlbedo } from '../../render/textures';
import {
  BATTERY_POS,
  CABLE_R,
  CRANK_GEAR_DIR,
  CRANK_GEAR_TEETH,
  GEARBOX,
  GEAR_CENTRE_DISTANCE,
  GEAR_MODULE,
  INVERTER_POS,
  MGUK_Y,
  MGUK_ZOOM,
  PINION_TEETH,
  PRESSURE_ANGLE,
  REAR_DISC_HEAT_SHARE,
  SCENE_SCALE,
  WHEEL_INNER_X,
  WHEEL_Z,
} from './dims';
import { buildMguk, type CutLook, type Look, type PartSink } from './mguk';
import { extrudeZ, involuteGearShape, ringZ, sweptRect, type CapKind } from './parts';
import { buildPower } from './power';

export type HousingMode = 'cutaway' | 'glass';

export interface TeardownAnchors {
  mguk: THREE.Vector3;
  gears: THREE.Vector3;
  wheel: THREE.Vector3;
  brake: THREE.Vector3;
  inverter: THREE.Vector3;
  battery: THREE.Vector3;
  stator: THREE.Vector3;
  hairpin: THREE.Vector3;
  magnets: THREE.Vector3;
  bearing: THREE.Vector3;
  jacket: THREE.Vector3;
  busbars: THREE.Vector3;
  gearbox: THREE.Vector3;
}

export interface Teardown {
  readonly root: THREE.Group;
  /** Energy path wheel → gears → MGU-K → AC busbars → inverter → HV cable → ES [world]. */
  readonly flowPath: THREE.Vector3[];
  readonly anchors: TeardownAnchors;
  /** World centre of the MGU-K (for framing). */
  readonly mgukCentre: THREE.Vector3;
  setHousingMode(m: HousingMode): void;
  /** State of charge 0..1 on the cell tops. */
  setSoc(soc: number): void;
  /** Rotor angle θ [rad] and the wheel turns per rotor turn; everything else follows. */
  setAngles(theta: number, wheelPerRotor: number): void;
  /** Friction-brake heat since braking started [J] → rear-disc glow. */
  setBrakeHeat(heatJ: number): void;
  dispose(): void;
}

const MM = 0.001 * MGUK_ZOOM;
const TAU = Math.PI * 2;

/** Rear-disc temperature [K] from the friction-brake heat (no cooling: illustrative). */
export function rearDiscTemperature(heatJ: number): number {
  const d = BRAKE_DISC_ILLUSTRATIVE.rear;
  return (
    DISC_START_DEFAULT_C + 273.15 + (Math.max(0, heatJ) * REAR_DISC_HEAT_SHARE) / (d.mass * d.c)
  );
}

export function createTeardown(stage: Stage): Teardown {
  const kit = stage.materials;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const own = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  const ownTex = (t: THREE.Texture): THREE.Texture => {
    texs.push(t);
    return t;
  };
  const tess = Math.max(0.5, stage.settings.tessellation);

  // ---------------------------------------------------------------- materials
  const KIT: Partial<Record<Look, [MaterialKind, string]>> = {
    iron: ['iron', 'mgt'],
    copper: ['copper', 'mgt'],
    steel: ['steel', 'mgt'],
    darkSteel: ['darkSteel', 'mgt'],
    carbon: ['carbon', 'mgt'],
    ceramic: ['ceramic', 'mgt'],
    plastic: ['plastic', 'mgt'],
    rubber: ['rubber', 'mgt'],
    brass: ['brass', 'mgt'],
  };
  const std = (color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const OWN: Partial<Record<Look, () => THREE.MeshStandardMaterial>> = {
    housing: () => std(0x464d57, 0.48, 0.55),
    alu: () => std(0xa4acb6, 0.4, 0.75),
    copperTip: () => std(0x8f5530, 0.5, 0.8),
    paper: () => std(0xe6d9b0, 0.8, 0),
    coolant: () => std(0x6f9cc8, 0.4, 0),
    magnetN: () => std(0xb0463e, 0.5, 0.3),
    magnetS: () => std(0x3e6496, 0.5, 0.3),
    die: () => std(0x22252b, 0.35, 0.4),
    insulator: () => std(0xd6c38e, 0.7, 0),
    orange: () => std(0xee7a1f, 0.5, 0.05),
    pcb: () => std(0x2e6a47, 0.6, 0.1),
    // ES casing: darker satin carbon than the clear-coated kit one, so it holds against the
    // white studio at "Insieme" distance (ref 03)
    esCarbon: () => {
      const map = ownTex(new THREE.CanvasTexture(carbonAlbedo()));
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(6, 6);
      return new THREE.MeshPhysicalMaterial({
        color: 0x5c616a,
        map,
        roughness: 0.42,
        metalness: 0.15,
        clearcoat: 0.45,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.6,
      });
    },
    // blue-wrapped prismatic cells: the rows read apart from the alu module walls
    cell: () => std(0x35547d, 0.55, 0.15),
    // black PBT power-module frames, so DBC, dies and copper stand out (ref 16)
    module: () => std(0x24272c, 0.6, 0.05),
  };
  const ownLook = new Map<Look, THREE.MeshStandardMaterial>();
  const ownMat = (look: Look): THREE.MeshStandardMaterial => {
    let m = ownLook.get(look);
    if (!m) {
      m = own((OWN[look] ?? (() => std(0x888888, 0.5, 0.3)))());
      ownLook.set(look, m);
    }
    return m;
  };
  /** Clipped twins: kit looks re-fetched (they are rebuilt on tier change), own looks cloned. */
  const cutOwn = new Map<Look, THREE.MeshStandardMaterial>();
  const cutMat = (look: CutLook): THREE.Material => {
    const k = KIT[look];
    if (k) return kit.get(k[0], `${k[1]}-cut`);
    let m = cutOwn.get(look);
    if (!m) {
      m = own(ownMat(look).clone());
      cutOwn.set(look, m);
    }
    return m;
  };
  const solidMeshes: Array<{ o: THREE.Mesh | THREE.InstancedMesh; look: Look }> = [];
  const cutMeshes: Array<{ o: THREE.Mesh | THREE.InstancedMesh; look: CutLook; glass: boolean }> =
    [];
  const covers: Array<{ o: THREE.Mesh; look: Look }> = [];
  const setSolid = (o: THREE.Mesh | THREE.InstancedMesh, look: Look): void => {
    const k = KIT[look];
    if (k) kit.assign(o, k[0], k[1]);
    else o.material = ownMat(look);
  };
  const sink: PartSink = {
    solid(o, look) {
      solidMeshes.push({ o, look });
      setSolid(o, look);
    },
    cut(o, look, glass) {
      cutMeshes.push({ o, look, glass });
    },
    cover(o, look) {
      covers.push({ o, look });
    },
    geo(g) {
      geos.push(g);
      return g;
    },
  };

  // ---------------------------------------------------------------- scene root and the MGU-K
  const root = new THREE.Group();
  root.name = 'mguk-teardown';
  root.scale.setScalar(SCENE_SCALE);
  stage.scene.add(root);

  const mg = buildMguk(sink, tess);
  mg.root.scale.setScalar(MM);
  mg.root.position.set(0, MGUK_Y, 0);
  root.add(mg.root);
  /** MGU-K frame [mm] → root [m]. */
  const fromMm = (v: THREE.Vector3): THREE.Vector3 =>
    v.clone().multiplyScalar(MM).add(mg.root.position);

  // section caps
  const CAP_COLOR: Record<CapKind, number> = {
    // red section faces, as on the exhibition cutaways (refs 08, 15)
    cast: 0xc8463c,
    // the stator stack is cut as grey laminated iron (ref 10), apart from the red housing
    iron: 0xffffff,
    steel: 0xd9786c,
    carbon: 0x2a2d32,
    copper: 0xc97b4a,
    coolant: 0x6f9cc8,
  };
  const capGroup = new THREE.Group();
  mg.root.add(capGroup);
  /** Lamination stripes: one light sheet and a dark insulation line per texel row pair. */
  const lamTex = (): THREE.Texture => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 8;
    const x = c.getContext('2d');
    if (x) {
      x.fillStyle = '#8d939c';
      x.fillRect(0, 0, 4, 8);
      x.fillStyle = '#3c4047';
      x.fillRect(0, 6, 4, 2);
    }
    const t = ownTex(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1 / 1.6); // one sheet per 1.6 mm (illustrative: real sheets are 0.1–0.2 mm)
    return t;
  };
  for (const [kind, g] of mg.caps) {
    sink.geo(g);
    const m = new THREE.Mesh(
      g,
      own(
        new THREE.MeshStandardMaterial({
          color: CAP_COLOR[kind],
          ...(kind === 'iron' ? { map: lamTex() } : {}),
          roughness: kind === 'iron' ? 0.55 : 0.85,
          metalness: kind === 'iron' ? 0.35 : 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      ),
    );
    capGroup.add(m);
  }

  // crank-side gear of the single pair (60 teeth, lightened web, hub), meshing with the pinion
  const mGear = GEAR_MODULE * 1000;
  const cd = GEAR_CENTRE_DISTANCE * 1000;
  const crank = new THREE.Group();
  crank.position.set(Math.cos(CRANK_GEAR_DIR) * cd, Math.sin(CRANK_GEAR_DIR) * cd, 0);
  mg.root.add(crank);
  {
    const s = involuteGearShape(CRANK_GEAR_TEETH, mGear, PRESSURE_ANGLE, 12);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * 46, Math.sin(a) * 46, 13, 0, TAU, true);
      s.holes.push(h);
    }
    const [z0, z1] = mg.pinionZ;
    const gear = new THREE.Mesh(sink.geo(extrudeZ(s, z0 + 1, z1 - z0 - 2, 0.4, 6)));
    crank.add(gear);
    sink.solid(gear, 'steel');
    const hub = new THREE.Mesh(sink.geo(ringZ(9, 22, z0 - 10, z1 + 6, 48, 1)));
    crank.add(hub);
    sink.solid(hub, 'darkSteel');
    const sh = new THREE.Mesh(sink.geo(ringZ(0, 9, z0 - 12, z1 + 8, 32, 0.8)));
    crank.add(sh);
    sink.solid(sh, 'steel');
    // a flat on the shaft end so its turning reads
    const key = new THREE.Mesh(sink.geo(new THREE.BoxGeometry(3, 10, 4)));
    key.position.set(0, 14, z1 + 7);
    crank.add(key);
    sink.solid(key, 'steel');
  }
  // gap of the crank gear on the line of centres when the pinion has a tooth there
  const crank0 = CRANK_GEAR_DIR - Math.PI + Math.PI / CRANK_GEAR_TEETH;

  // ---------------------------------------------------------------- driveline (schematic)
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, look: Look): THREE.Mesh => {
    const m = new THREE.Mesh(sink.geo(g));
    parent.add(m);
    sink.solid(m, look);
    return m;
  };
  const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 20, 1);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      ),
    );
    const m = a.clone().add(b).multiplyScalar(0.5);
    return g.translate(m.x, m.y, m.z);
  };
  const crankC = fromMm(crank.position.clone());
  const gbC = new THREE.Vector3(crankC.x, crankC.y, WHEEL_Z);
  const gearbox = add(root, chamferBox(GEARBOX.x, GEARBOX.y, GEARBOX.z, 0.012, 2), 'darkSteel');
  gearbox.position.copy(gbC);
  const shaftA = fromMm(crank.position.clone().setZ(mg.pinionZ[0] - 12));
  const shaftB = new THREE.Vector3(crankC.x, crankC.y, WHEEL_Z + GEARBOX.z / 2);
  add(root, strut(shaftA, shaftB, 0.009), 'steel');
  const R = CAR_DIMS.tyreRadius;
  const Wt = CAR_DIMS.tyreWidthRear;
  const wheelC = new THREE.Vector3(WHEEL_INNER_X - Wt / 2, R, WHEEL_Z);
  const hubIn = new THREE.Vector3(wheelC.x + 0.13, R, WHEEL_Z);
  const gbOut = new THREE.Vector3(gbC.x - GEARBOX.x / 2, gbC.y, WHEEL_Z);
  add(root, strut(gbOut, hubIn, 0.013), 'steel');
  for (const p of [gbOut, hubIn]) {
    const boot = add(root, new THREE.SphereGeometry(0.03, 20, 14), 'rubber');
    boot.position.copy(p);
    boot.scale.set(1.3, 1, 1);
  }

  // ---------------------------------------------------------------- rear wheel and brake
  // Same recipe and sizes as the shared car (CAR_DIMS): 18" rim, 720 mm tyre, rear disc Ø 280.
  const wheel = new THREE.Group();
  wheel.position.copy(wheelC);
  wheel.rotation.y = -Math.PI / 2; // local +z (outer face) → world −x
  root.add(wheel);
  const spin = new THREE.Group();
  wheel.add(spin);
  const segs = Math.max(32, Math.round(72 * tess));
  {
    const rimR = CAR_DIMS.rimRadius;
    const hw = Wt / 2;
    const prof = [
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
    add(spin, new THREE.LatheGeometry(prof, segs).rotateX(Math.PI / 2), 'rubber');
    for (const s of [1, -1]) {
      const band = add(spin, new THREE.RingGeometry(0.262, 0.274, segs), 'ceramic');
      band.position.z = s * (hw + 0.006);
      if (s < 0) band.rotation.y = Math.PI;
    }
    add(spin, ringZ(rimR - 0.008, rimR, -hw * 0.9, hw * 0.9, segs, 0.002), 'darkSteel');
    const lip = add(spin, new THREE.TorusGeometry(rimR + 0.002, 0.011, 8, segs), 'steel');
    lip.position.z = hw - 0.02;
    const spokeG = new THREE.BoxGeometry(0.165, 0.026, 0.018).translate(0.135, 0, 0);
    const spokes = new THREE.InstancedMesh(sink.geo(spokeG), undefined, 10);
    for (let k = 0; k < 10; k++)
      spokes.setMatrixAt(
        k,
        new THREE.Matrix4().makeRotationZ((k / 10) * TAU).setPosition(0, 0, hw - 0.04),
      );
    spin.add(spokes);
    sink.solid(spokes, 'darkSteel');
    const hubG = add(
      spin,
      new THREE.CylinderGeometry(0.055, 0.06, 0.05, 24).rotateX(Math.PI / 2),
      'darkSteel',
    );
    hubG.position.z = hw - 0.04;
    const nut = add(
      spin,
      new THREE.CylinderGeometry(0.028, 0.028, 0.05, 6).rotateX(Math.PI / 2),
      'steel',
    );
    nut.position.z = hw - 0.01;
    // axle stub through the upright to the half-shaft
    add(spin, ringZ(0, 0.022, -hw + 0.02, hw - 0.04, 24), 'steel');
  }
  // carbon disc (black-body glow from the computed temperature), drilled edge, titanium bell
  const disc = CAR_DIMS.discRear;
  const discTex = ownTex(new THREE.CanvasTexture(discFace()));
  discTex.colorSpace = THREE.SRGBColorSpace;
  const discMat = own(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: discTex,
      roughness: 0.75,
      metalness: 0.05,
    }),
  );
  const discZ = -0.06;
  {
    const t = disc.thickness / 2;
    const ring = new THREE.Mesh(
      sink.geo(
        new THREE.LatheGeometry(
          [
            [disc.inner, -t],
            [disc.outer, -t],
            [disc.outer, t],
            [disc.inner, t],
            [disc.inner, -t],
          ].map(([r, z]) => new THREE.Vector2(r, z)),
          segs,
        ).rotateX(Math.PI / 2),
      ),
      discMat,
    );
    ring.position.z = discZ;
    spin.add(ring);
    for (const s of [1, -1]) {
      const face = new THREE.Mesh(
        sink.geo(new THREE.RingGeometry(disc.inner, disc.outer, segs)),
        discMat,
      );
      face.position.z = discZ + s * (t + 0.0004);
      if (s < 0) face.rotation.y = Math.PI;
      spin.add(face);
    }
    const holeG = new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 8).rotateZ(Math.PI / 2);
    const n = 72;
    const holes = new THREE.InstancedMesh(sink.geo(holeG), undefined, n * 3);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++)
      for (let row = 0; row < 3; row++) {
        const a = ((k + row * 0.5) / n) * TAU;
        m4.makeRotationZ(a).setPosition(
          Math.cos(a) * (disc.outer + 0.0005),
          Math.sin(a) * (disc.outer + 0.0005),
          discZ + (row - 1) * 0.009,
        );
        holes.setMatrixAt(k * 3 + row, m4);
      }
    spin.add(holes);
    sink.solid(holes, 'die');
    const bell = add(
      spin,
      ringZ(0.05, disc.inner + 0.004, discZ - 0.006, discZ + 0.006, segs, 0.002),
      'alu',
    );
    void bell;
  }
  // caliper and upright (fixed)
  const brakeAnchorLocal = new THREE.Vector3();
  {
    const ang = Math.PI * 0.62;
    const cal = add(wheel, chamferBox(0.1, 0.17, 0.075, 0.02), 'plastic');
    cal.position.set(
      Math.cos(ang) * (disc.outer - 0.03),
      Math.sin(ang) * (disc.outer - 0.03),
      discZ,
    );
    cal.rotation.z = ang - Math.PI / 2;
    brakeAnchorLocal.copy(cal.position);
    const up = add(wheel, chamferBox(0.08, 0.3, 0.035, 0.012), 'darkSteel');
    up.position.set(0.02, 0.0, discZ - 0.06);
  }

  // ---------------------------------------------------------------- inverter, ES, busbars, cables
  const pw = buildPower(sink, own, ownTex);
  pw.inverter.position.set(INVERTER_POS.x, INVERTER_POS.y, INVERTER_POS.z);
  pw.es.position.set(BATTERY_POS.x, BATTERY_POS.y, BATTERY_POS.z);
  root.add(pw.inverter, pw.es);
  const invP = (v: THREE.Vector3): THREE.Vector3 => v.clone().add(pw.inverter.position);
  const esP = (v: THREE.Vector3): THREE.Vector3 => v.clone().add(pw.es.position);
  // AC busbars: MGU-K lugs U/V/W up and across to the inverter's left wall
  const busPaths: THREE.Vector3[][] = mg.lugs.map((lug, i) => {
    const a = fromMm(lug);
    const b = invP(pw.acExits[i] ?? new THREE.Vector3());
    return [
      a,
      a.clone().add(new THREE.Vector3(0, 0.05, 0)),
      new THREE.Vector3(a.x + 0.06, a.y + 0.09, (a.z + b.z) / 2),
      new THREE.Vector3(b.x - 0.07, b.y + 0.01, b.z),
      b,
    ];
  });
  for (const p of busPaths) add(root, sweptRect(p, 0.0035, 0.012, 48), 'copper');
  // HV cables (orange): inverter DC connector down to the ES connector, a gentle sag
  const dcA = invP(pw.dcPort);
  const dcB = esP(pw.esPort);
  const cablePaths: THREE.Vector3[][] = [-1, 1].map((s) => [
    dcA.clone().add(new THREE.Vector3(0, 0, s * 0.008)),
    dcA.clone().add(new THREE.Vector3(0.06, -0.02, s * 0.008)),
    new THREE.Vector3(
      (dcA.x + dcB.x) / 2 + 0.05,
      (dcA.y + dcB.y) / 2 - 0.06,
      (dcA.z + dcB.z) / 2 + s * 0.01,
    ),
    dcB.clone().add(new THREE.Vector3(s * 0.012, 0.07, 0.02)),
    dcB.clone().add(new THREE.Vector3(s * 0.012, 0, 0)),
  ]);
  for (const p of cablePaths)
    add(
      root,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 48, CABLE_R, 10, false),
      'orange',
    );

  stage.castShadows(root);
  for (const c of capGroup.children) c.castShadow = false;

  // ---------------------------------------------------------------- energy path (world)
  root.updateMatrixWorld(true);
  const up = (v: THREE.Vector3, dy: number): THREE.Vector3 =>
    v.clone().add(new THREE.Vector3(0, dy, 0));
  const mmPolar = (r: number, a: number, z: number): THREE.Vector3 =>
    fromMm(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z));
  const meshPoint = fromMm(
    new THREE.Vector3(Math.cos(CRANK_GEAR_DIR), Math.sin(CRANK_GEAR_DIR), 0)
      .multiplyScalar(((GEAR_MODULE * PINION_TEETH) / 2) * 1000)
      .setZ(mg.pinionZ[1] + 4),
  );
  const q = Math.PI / 4;
  const busV = busPaths[1] ?? [];
  const pathRoot: THREE.Vector3[] = [
    up(new THREE.Vector3(wheelC.x + 0.06, R, WHEEL_Z), 0.05),
    up(hubIn, 0.04),
    up(gbOut, 0.04),
    up(gbC, GEARBOX.y / 2 + 0.02),
    up(shaftB, 0.035),
    up(shaftA, 0.03),
    meshPoint,
    // shaft → across the air gap at the drive-end winding overhang (z < −stack/2), so the
    // ribbon does not hide the magnets in the open quarter → over the housing to the terminal
    mmPolar(26, q, -70),
    mmPolar(30, q, -46),
    mmPolar(44, q, -44),
    mmPolar(60, q * 1.3, -46),
    mmPolar(72, TERMINAL_UP, -40),
    mmPolar(76, TERMINAL_UP, 0),
    mmPolar(76, TERMINAL_UP, 18),
    ...busV.slice(1).map((v) => up(v, 0.014)),
    invP(pw.at.modules),
    invP(new THREE.Vector3(0, pw.at.modules.y + 0.02, -0.045)),
    up(dcA, 0.0),
    ...(cablePaths[0] ?? []).slice(1, 4).map((v) => up(v, 0.012)),
    up(dcB, 0.0),
    esP(pw.at.cells).add(new THREE.Vector3(0, 0.02, 0)),
  ];
  const toWorld = (v: THREE.Vector3): THREE.Vector3 => root.localToWorld(v.clone());
  const flowPath = pathRoot.map(toWorld);

  const W = (v: THREE.Vector3): THREE.Vector3 => toWorld(v);
  const anchors: TeardownAnchors = {
    mguk: W(fromMm(new THREE.Vector3(-30, 70, -20))),
    gears: W(fromMm(crank.position.clone().add(new THREE.Vector3(-40, -60, mg.pinionZ[0])))),
    wheel: W(new THREE.Vector3(wheelC.x, R * 2, WHEEL_Z)),
    brake: W(
      wheel.localToWorld(brakeAnchorLocal.clone()).applyMatrix4(root.matrixWorld.clone().invert()),
    ),
    inverter: W(invP(pw.at.modules)),
    battery: W(esP(pw.at.cells)),
    stator: W(fromMm(mg.at.stator)),
    hairpin: W(fromMm(mg.at.hairpin)),
    magnets: W(fromMm(mg.at.magnets)),
    bearing: W(fromMm(mg.at.bearing)),
    jacket: W(fromMm(mg.at.jacket)),
    busbars: W(busV[2] ?? new THREE.Vector3()),
    gearbox: W(gbC),
  };
  const mgukCentre = W(mg.root.position.clone());

  // ---------------------------------------------------------------- modes
  const planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), mgukCentre.x),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), mgukCentre.y),
  ];
  stage.renderer.localClippingEnabled = true;
  let mode: HousingMode = 'cutaway';
  const glassMat = (): THREE.Material => kit.get('glass', 'mgt');
  const apply = (): void => {
    const cutting = mode === 'cutaway';
    const touched = new Set<THREE.Material>();
    for (const c of cutMeshes) {
      if (!cutting && c.glass) {
        c.o.material = glassMat();
        c.o.castShadow = false;
        continue;
      }
      const m = cutMat(c.look);
      c.o.material = m;
      c.o.castShadow = true;
      if (!touched.has(m)) {
        touched.add(m);
        m.clippingPlanes = cutting ? planes : null;
        m.clipIntersection = true;
        m.clipShadows = true;
        m.side =
          c.look === 'copper' ||
          c.look === 'paper' ||
          c.look === 'copperTip' ||
          c.look === 'plastic'
            ? THREE.DoubleSide
            : THREE.FrontSide;
        m.needsUpdate = true;
      }
    }
    for (const c of covers) {
      if (cutting) setSolid(c.o, c.look);
      else c.o.material = glassMat();
      c.o.castShadow = cutting;
    }
    // lids stay open in both modes: closed, their stacked glass fins hid modules and cells
    for (const l of pw.lids) l.pivot.rotation.x = l.open;
    capGroup.visible = cutting;
  };
  apply();
  const offTier = stage.onTierChange(() => {
    for (const s of solidMeshes) if (!KIT[s.look]) s.o.material = ownMat(s.look);
    apply();
  });

  const socOn = new THREE.Color();
  const socOff = new THREE.Color(0x3a3f47);
  let lastSoc = -1;

  return {
    root,
    flowPath,
    anchors,
    mgukCentre,
    setHousingMode(m) {
      mode = m;
      apply();
    },
    setSoc(soc) {
      if (Math.abs(soc - lastSoc) < 1e-4) return;
      lastSoc = soc;
      socOn.setHex(stage.theme === 'dark' ? 0xb68cff : 0x8b5cf6);
      pw.setSoc(soc, socOn, socOff);
    },
    setAngles(theta, wheelPerRotor) {
      mg.rotor.rotation.z = theta;
      for (const c of mg.cages) c.rotation.z = theta * 0.42;
      crank.rotation.z = crank0 - theta * (PINION_TEETH / CRANK_GEAR_TEETH);
      spin.rotation.z = -theta * wheelPerRotor;
    },
    setBrakeHeat(heatJ) {
      applyHeatGlow(discMat, rearDiscTemperature(heatJ));
    },
    dispose() {
      offTier();
      stage.scene.remove(root);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

/** Where the energy path climbs over the housing to the terminal block [rad]. */
const TERMINAL_UP = (100 * Math.PI) / 180;
