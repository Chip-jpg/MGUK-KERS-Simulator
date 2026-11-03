/**
 * Procedural geometry of the MGU-K teardown (D14: no downloaded assets), all built from the
 * real dimensions in `dims.ts` in metres inside one group scaled by SCENE_SCALE.
 *
 * Layout (machine axis = +Z, towards the camera; the car moves along +X):
 *   wheel + axle (left, behind) ← final drive ← gearbox ← crankshaft gear ⇄ MGU-K pinion
 *   MGU-K (origin) → HV cables → inverter → HV cables → ES battery with a SoC fill bar.
 * One accent colour (the palette "energy" purple) marks everything that carries energy:
 * the flow ribbon and the SoC fill; all other parts are neutral materials from the kit.
 */
import * as THREE from 'three';
import { renderStats, type Stage } from '../../render';
import {
  AXLE_R,
  BATTERY,
  BATTERY_X,
  CABLE_R,
  CAP_T,
  CRANK_GEAR_R,
  CRANK_GEAR_TEETH,
  CRANK_TO_ROTOR_RATIO,
  END_TURN_L,
  GEAR_CENTRE_DISTANCE,
  GEAR_MODULE,
  GEAR_W,
  GEAR_Z,
  HOUSING_L,
  HOUSING_R,
  HOUSING_WALL,
  INVERTER,
  INVERTER_X,
  MAGNET_R_OUT,
  MAGNET_T,
  PINION_R,
  PINION_TEETH,
  POLE_COUNT,
  RIM_R,
  SCENE_SCALE,
  SHAFT_L,
  SHAFT_R,
  SLOT_COUNT,
  SLOT_FILL,
  SLOT_R_BOTTOM,
  STACK_L,
  STATOR_R_BORE,
  STATOR_R_OUT,
  WHEEL_R,
  WHEEL_W,
  WHEEL_X,
  WHEEL_Z,
} from './dims';

export type HousingMode = 'cutaway' | 'glass';

export interface TeardownAnchors {
  mguk: THREE.Vector3;
  gears: THREE.Vector3;
  wheel: THREE.Vector3;
  inverter: THREE.Vector3;
  battery: THREE.Vector3;
}

export interface Teardown {
  readonly root: THREE.Group;
  /** Rotor + shaft + pinion (rotates with the rotor angle θ). */
  readonly rotor: THREE.Group;
  readonly crankGear: THREE.Group;
  readonly wheel: THREE.Group;
  /** Scene-unit points of the energy path wheel → MGU-K → inverter → battery. */
  readonly flowPath: THREE.Vector3[];
  readonly anchors: TeardownAnchors;
  /** Scene-space Y of the lowest point (tyre contact), for the studio floor. */
  readonly floorY: number;
  setHousingMode(m: HousingMode): void;
  /** SoC fill bar height fraction (0..1). */
  setSoc(soc: number): void;
  /** Rotor angle θ [rad] drives pinion, crank gear and wheel through their ratios. */
  setAngles(theta: number, wheelPerRotor: number): void;
  dispose(): void;
}

/** Window of the battery fill bar, as a fraction of the pack's height and width. */
const SOC_WINDOW = { h: 0.8, w: 0.8 };
/** Pinion tooth at π, gear gap at 0: teeth mesh for every θ (see setAngles). */
const MESH_PHASE = Math.PI / CRANK_GEAR_TEETH;

/** Gear outline: `n` teeth, pitch radius `rp`, module `m` (addendum m, dedendum 1.25 m). */
export function gearShape(n: number, rp: number, m: number): THREE.Shape {
  const ro = rp + m;
  const rr = rp - 1.25 * m;
  const pitch = (2 * Math.PI) / n;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = i * pitch;
    for (const [r, k] of [
      [rr, -0.5],
      [rr, -0.3],
      [ro, -0.14],
      [ro, 0.14],
      [rr, 0.3],
    ] as const) {
      pts.push([r * Math.cos(a + k * pitch), r * Math.sin(a + k * pitch)]);
    }
  }
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Annular sector (or a full ring when a1 − a0 ≥ 2π) as an extrudable shape. */
export function ringShape(ro: number, ri: number, a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  if (a1 - a0 >= 2 * Math.PI - 1e-6) {
    s.absarc(0, 0, ro, 0, 2 * Math.PI, false);
    const h = new THREE.Path();
    h.absarc(0, 0, ri, 0, 2 * Math.PI, true);
    s.holes.push(h);
  } else {
    s.moveTo(ro * Math.cos(a0), ro * Math.sin(a0));
    s.absarc(0, 0, ro, a0, a1, false);
    s.lineTo(ri * Math.cos(a1), ri * Math.sin(a1));
    s.absarc(0, 0, ri, a1, a0, true);
    s.closePath();
  }
  return s;
}

/** Stator lamination: outer circle, inner contour with SLOT_COUNT radial slots open to the bore. */
export function statorShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, STATOR_R_OUT, 0, 2 * Math.PI, false);
  const pitch = (2 * Math.PI) / SLOT_COUNT;
  const hs = (pitch * SLOT_FILL) / 2;
  const pts: Array<[number, number]> = [];
  const P = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const c = i * pitch;
    pts.push(P(STATOR_R_BORE, c - hs), P(SLOT_R_BOTTOM, c - hs));
    for (let k = 1; k < 4; k++) pts.push(P(SLOT_R_BOTTOM, c - hs + (2 * hs * k) / 4));
    pts.push(P(SLOT_R_BOTTOM, c + hs), P(STATOR_R_BORE, c + hs));
    for (let k = 1; k < 3; k++) {
      pts.push(P(STATOR_R_BORE, c + hs + ((pitch - 2 * hs) * k) / 3));
    }
  }
  const hole = new THREE.Path();
  pts.forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
  hole.closePath();
  s.holes.push(hole);
  return s;
}

export function createTeardown(stage: Stage): Teardown {
  const kit = stage.materials;
  const geos: THREE.BufferGeometry[] = [];
  const root = new THREE.Group();
  root.name = 'mguk-teardown';
  root.scale.setScalar(SCENE_SCALE);

  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    renderStats.liveGeometries++;
    return g;
  };
  const q = stage.settings.tier === 'base' ? 0.5 : 1;
  const seg = (n: number): number => Math.max(6, Math.round(n * q));
  const mesh = (
    g: THREE.BufferGeometry,
    kind: Parameters<typeof kit.assign>[1],
    parent: THREE.Object3D,
    key?: string,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo(g), kit.get(kind, key));
    kit.assign(m, kind, key);
    parent.add(m);
    return m;
  };
  /** Extrude a shape along +Z from z0 to z0 + depth. */
  const extrude = (s: THREE.Shape, depth: number, z0: number, curve = 16): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: false,
      curveSegments: seg(curve),
    }).translate(0, 0, z0);
  /** Cylinder along Z from z0 to z1. */
  const cylZ = (r: number, z0: number, z1: number, n = 32): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), seg(n))
      .rotateX(Math.PI / 2)
      .translate(0, 0, (z0 + z1) / 2);
  /** Cylinder along X from x0 to x1. */
  const cylX = (r: number, x0: number, x1: number): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), seg(20))
      .rotateZ(Math.PI / 2)
      .translate((x0 + x1) / 2, 0, 0);

  const zMid = HOUSING_L / 2;
  const zStack0 = zMid - STACK_L / 2;

  // ---- housing: cutaway (open front, 90° window on top) / glass (closed, transparent) ----
  const housingCut = new THREE.Group();
  const housingGlass = new THREE.Group();
  const ri = HOUSING_R - HOUSING_WALL;
  // cutaway: only the lower half-shell is left, so the stator, windings and magnets are open
  mesh(
    extrude(ringShape(HOUSING_R, ri, Math.PI, Math.PI * 2), HOUSING_L, 0, 48),
    'steel',
    housingCut,
  );
  // glass: closed, ghosted shell (own material: the kit's glass is too faint on the pale studio)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7f9bb8,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3d5873, transparent: true, opacity: 0.8 });
  const glassGeos = [
    extrude(ringShape(HOUSING_R, ri, 0, Math.PI * 2), HOUSING_L, 0, 48),
    cylZ(HOUSING_R * 0.95, HOUSING_L - CAP_T, HOUSING_L),
  ].map(geo);
  for (const g of glassGeos) {
    const m = new THREE.Mesh(g, glassMat);
    m.renderOrder = 2;
    housingGlass.add(m);
    const e = new THREE.LineSegments(geo(new THREE.EdgesGeometry(g, 30)), edgeMat);
    e.renderOrder = 3;
    housingGlass.add(e);
  }
  // rear cap (solid in both modes)
  const rearCap = new THREE.Group();
  mesh(cylZ(HOUSING_R, 0, CAP_T), 'steel', rearCap);
  root.add(housingCut, housingGlass, rearCap);

  // ---- stator core + copper windings ----------------------------------------------------
  const stator = new THREE.Group();
  mesh(extrude(statorShape(), STACK_L, zStack0, 4), 'iron', stator);
  const pitch = (2 * Math.PI) / SLOT_COUNT;
  const slotDepth = SLOT_R_BOTTOM - STATOR_R_BORE;
  const barLen = STACK_L + 2 * END_TURN_L;
  const barGeo = geo(
    new THREE.BoxGeometry(
      slotDepth * 0.78,
      ((pitch * SLOT_FILL) / 2) * STATOR_R_BORE * 1.6,
      barLen,
    ),
  );
  const rBar = SLOT_R_BOTTOM - slotDepth * 0.45;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const a = i * pitch;
    const bar = new THREE.Mesh(barGeo, kit.get('copper'));
    kit.assign(bar, 'copper');
    bar.position.set(rBar * Math.cos(a), rBar * Math.sin(a), zMid);
    bar.rotation.z = a;
    stator.add(bar);
  }
  for (const side of [-1, 1]) {
    mesh(
      new THREE.TorusGeometry(rBar, 0.0035, seg(8), seg(48)).translate(
        0,
        0,
        zMid + (side * (STACK_L + END_TURN_L)) / 2 + side * (END_TURN_L / 2 - 0.0005),
      ),
      'enamel',
      stator,
    );
  }
  root.add(stator);

  // ---- rotor: core, 8 surface magnets, shaft, timing mark, pinion ----------------------
  const rotor = new THREE.Group();
  rotor.position.z = 0;
  mesh(cylZ(MAGNET_R_OUT - MAGNET_T, zStack0, zStack0 + STACK_L), 'steel', rotor);
  const poleP = (2 * Math.PI) / POLE_COUNT;
  for (let i = 0; i < POLE_COUNT; i++) {
    const a0 = i * poleP + poleP * 0.07;
    mesh(
      extrude(
        ringShape(MAGNET_R_OUT, MAGNET_R_OUT - MAGNET_T, a0, a0 + poleP * 0.86),
        STACK_L,
        zStack0,
        6,
      ),
      'magnet',
      rotor,
    );
  }
  const shaftZ1 = HOUSING_L - 0.004;
  mesh(cylZ(SHAFT_R, shaftZ1 - SHAFT_L, shaftZ1), 'darkSteel', rotor);
  // timing mark (a key on the shaft tip): makes the rotation readable
  const tick = mesh(new THREE.BoxGeometry(SHAFT_R * 0.5, SHAFT_R * 1.1, 0.008), 'brass', rotor);
  tick.position.set(0, SHAFT_R * 0.55, shaftZ1 - 0.002);
  const pinion = gearShape(PINION_TEETH, PINION_R, GEAR_MODULE);
  mesh(extrude(pinion, GEAR_W, GEAR_Z - GEAR_W / 2, 4), 'darkSteel', rotor);
  root.add(rotor);

  // ---- crankshaft gear (parallel axis, to the left) + lightening holes ---------------------
  const crankGear = new THREE.Group();
  crankGear.position.set(-GEAR_CENTRE_DISTANCE, 0, 0);
  const cg = gearShape(CRANK_GEAR_TEETH, CRANK_GEAR_R, GEAR_MODULE);
  const hubR = 0.014;
  const hub = new THREE.Path();
  hub.absarc(0, 0, hubR, 0, 2 * Math.PI, true);
  cg.holes.push(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    const h = new THREE.Path();
    h.absarc(
      0.5 * CRANK_GEAR_R * Math.cos(a),
      0.5 * CRANK_GEAR_R * Math.sin(a),
      0.016,
      0,
      2 * Math.PI,
      true,
    );
    cg.holes.push(h);
  }
  mesh(extrude(cg, GEAR_W, GEAR_Z - GEAR_W / 2, 4), 'steel', crankGear);
  const zDrive = GEAR_Z - 0.06;
  mesh(cylZ(0.02, zDrive, GEAR_Z + GEAR_W), 'darkSteel', crankGear);
  root.add(crankGear);

  // ---- driveline to the wheel: shafts, gearbox, final drive, axle --------------------------
  const driveline = new THREE.Group();
  const gbX = -0.32;
  mesh(cylX(0.016, -GEAR_CENTRE_DISTANCE, gbX), 'darkSteel', driveline).position.z = zDrive;
  const gearbox = mesh(new THREE.BoxGeometry(0.11, 0.1, 0.09), 'plastic', driveline);
  gearbox.position.set(gbX, 0, zDrive);
  mesh(cylX(0.016, gbX, WHEEL_X), 'darkSteel', driveline).position.z = zDrive;
  const finalDrive = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), 'plastic', driveline);
  finalDrive.position.set(WHEEL_X, 0, zDrive);
  root.add(driveline);

  // ---- wheel: tyre (lathe), rim face with holes, hub, axle -----------------------------------
  const wheel = new THREE.Group();
  wheel.position.set(WHEEL_X, 0, WHEEL_Z);
  const hw = WHEEL_W / 2;
  const prof = [
    [RIM_R, -hw * 0.92],
    [0.3, -hw],
    [0.345, -hw * 0.97],
    [WHEEL_R, -hw * 0.78],
    [WHEEL_R, hw * 0.78],
    [0.345, hw * 0.97],
    [0.3, hw],
    [RIM_R, hw * 0.92],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(prof, seg(64)).rotateX(Math.PI / 2), 'rubber', wheel);
  const rim = new THREE.Shape();
  rim.absarc(0, 0, RIM_R * 1.01, 0, 2 * Math.PI, false);
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 + Math.PI / 10;
    const h = new THREE.Path();
    h.absarc(0.115 * Math.cos(a), 0.115 * Math.sin(a), 0.055, 0, 2 * Math.PI, true);
    rim.holes.push(h);
  }
  mesh(extrude(rim, 0.03, hw * 0.55, 24), 'darkSteel', wheel);
  mesh(cylZ(RIM_R, -hw * 0.9, hw * 0.55, 48), 'steel', wheel);
  mesh(cylZ(0.04, -hw * 0.9, hw * 0.75, 20), 'brass', wheel);
  root.add(wheel);
  const axle = mesh(cylZ(AXLE_R, zDrive, WHEEL_Z), 'darkSteel', root);
  axle.position.x = WHEEL_X;

  // ---- inverter / converter box with cooling fins -------------------------------------------
  const zBox = zMid;
  const inverter = new THREE.Group();
  inverter.position.set(INVERTER_X, 0, zBox);
  mesh(new THREE.BoxGeometry(INVERTER.x, INVERTER.y, INVERTER.z), 'darkSteel', inverter);
  const finGeo = geo(new THREE.BoxGeometry(INVERTER.x * 0.8, 0.004, 0.012));
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(finGeo, kit.get('steel'));
    kit.assign(f, 'steel');
    f.position.set(0, INVERTER.y / 2 + 0.002, -INVERTER.z / 2 + 0.012 + i * 0.016);
    inverter.add(f);
  }
  root.add(inverter);

  // ---- ES battery pack with SoC window ----------------------------------------------------------
  const battery = new THREE.Group();
  battery.position.set(BATTERY_X, 0, zBox);
  mesh(new THREE.BoxGeometry(BATTERY.x, BATTERY.y, BATTERY.z), 'plastic', battery);
  const zFront = BATTERY.z / 2;
  const winH = BATTERY.y * SOC_WINDOW.h;
  const winW = BATTERY.x * SOC_WINDOW.w;
  const well = mesh(new THREE.BoxGeometry(winW + 0.012, winH + 0.012, 0.004), 'carbon', battery);
  well.position.z = zFront + 0.002;
  const fillGeo = geo(new THREE.BoxGeometry(winW, 1, 0.006).translate(0, 0.5, 0));
  const fill = new THREE.Mesh(fillGeo, kit.get('glowEnergy', 'soc'));
  kit.assign(fill, 'glowEnergy', 'soc');
  fill.position.set(0, -winH / 2, zFront + 0.006);
  fill.scale.y = 0.001;
  battery.add(fill);
  root.add(battery);

  // ---- HV cables: 3 phases MGU-K → inverter, DC ± inverter → battery ---------------------------
  const cable = (pts: THREE.Vector3[]): void => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    mesh(new THREE.TubeGeometry(c, seg(24), CABLE_R, seg(8), false), 'rubber', root);
  };
  for (const dy of [-0.016, 0, 0.016]) {
    cable([
      new THREE.Vector3(HOUSING_R - 0.004, dy, zMid + dy),
      new THREE.Vector3(HOUSING_R + 0.05, dy * 1.5, zMid - 0.01 + dy),
      new THREE.Vector3(INVERTER_X - INVERTER.x / 2, dy, zBox + dy * 0.5),
    ]);
  }
  for (const dy of [-0.03, 0.03]) {
    cable([
      new THREE.Vector3(INVERTER_X + INVERTER.x / 2, dy, zBox),
      new THREE.Vector3((INVERTER_X + BATTERY_X) / 2, dy * 1.4, zBox - 0.02),
      new THREE.Vector3(BATTERY_X - BATTERY.x / 2, dy, zBox),
    ]);
  }

  stage.scene.add(root);
  stage.castShadows(root, true);
  housingGlass.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  stage.occluders.push(root);

  // ---- energy-flow path (scene units): wheel → drivetrain → MGU-K → inverter → battery ---------
  const S = SCENE_SCALE;
  const v = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x * S, y * S, z * S);
  // The ribbon runs ABOVE the machine (clear of the cutaway window and the SoC window), never through it.
  const yTop = HOUSING_R + 0.035;
  const yBat = BATTERY.y / 2 + 0.03;
  const flowPath = [
    v(WHEEL_X, 0.02, WHEEL_Z + hw + 0.015),
    v(WHEEL_X + 0.1, yTop * 0.8, zMid * 0.4),
    v(-GEAR_CENTRE_DISTANCE - 0.05, yTop, 0),
    v(0, yTop, 0),
    v(INVERTER_X - INVERTER.x / 2 - 0.02, yTop, zMid * 0.5),
    v(INVERTER_X + INVERTER.x / 2 + 0.02, yTop + 0.015, zBox),
    v(BATTERY_X - 0.12, yBat, zBox),
    v(BATTERY_X + 0.1, yBat, zBox),
  ];
  // labels sit BELOW the parts (the ribbon is above); spacing is set in stage.ts
  const anchors: TeardownAnchors = {
    mguk: v(0, -HOUSING_R, zMid),
    gears: v(-GEAR_CENTRE_DISTANCE, -CRANK_GEAR_R, GEAR_Z),
    wheel: v(WHEEL_X, WHEEL_R, WHEEL_Z),
    inverter: v(INVERTER_X, -INVERTER.y / 2, zBox),
    battery: v(BATTERY_X, -BATTERY.y / 2, zBox),
  };

  const setHousingMode = (m: HousingMode): void => {
    housingCut.visible = m === 'cutaway';
    housingGlass.visible = m === 'glass';
  };
  setHousingMode('cutaway');

  let disposed = false;
  return {
    root,
    rotor,
    crankGear,
    wheel,
    flowPath,
    anchors,
    floorY: -WHEEL_R * SCENE_SCALE,
    setHousingMode,
    setSoc(soc) {
      const f = Number.isFinite(soc) ? Math.min(1, Math.max(0.001, soc)) : 0.001;
      fill.scale.y = winH * f;
    },
    setAngles(theta, wheelPerRotor) {
      rotor.rotation.z = theta;
      // rolling mesh: pinion tooth at π, gear gap at 0 → θg = −θ·Zp/Zg + π/Zg
      crankGear.rotation.z = -theta * CRANK_TO_ROTOR_RATIO + MESH_PHASE;
      wheel.rotation.z = -theta * wheelPerRotor; // car moves along +X: clockwise from +Z
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      glassMat.dispose();
      edgeMat.dispose();
      stage.scene.remove(root);
      const i = stage.occluders.indexOf(root);
      if (i >= 0) stage.occluders.splice(i, 1);
      for (const g of geos.splice(0)) {
        g.dispose();
        renderStats.liveGeometries--;
      }
    },
  };
}
