/**
 * Power electronics and energy store of the teardown, in metres (each group centred on its box):
 * - inverter (CE): cast tray with mounting ears and bolts, liquid cold plate with a serpentine
 *   channel and coolant fittings, three SiC phase-leg modules (open: DBC substrate, dies, bond
 *   wires, terminals), DC-link capacitor, laminated DC busbars, three AC busbars to the left
 *   wall, HV DC connector, hinged lid (after ref 16, ref 11);
 * - energy store (ES): carbon tray with a bolted flange seam and stepped lid (ref 03), rows of
 *   prismatic cells with terminals and copper busbars (ref 17), SoC shown on the cell tops,
 *   HV connector and warning label.
 * Sizes from dims.ts; cell count and internal layout are ILLUSTRATIVE.
 */
import * as THREE from 'three';
import { chamferBox } from '../../render';
import { BATTERY, ES_COLS, ES_ROWS, INVERTER } from './dims';
import type { Look, PartSink } from './mguk';

export interface Lid {
  /** Hinge: rotation.x opens it. */
  readonly pivot: THREE.Group;
  /** Opening angle [rad] in "Spaccato". */
  readonly open: number;
}

export interface Power {
  readonly inverter: THREE.Group;
  readonly es: THREE.Group;
  /** AC busbar exits on the inverter's left wall, phase U, V, W [inverter frame]. */
  readonly acExits: THREE.Vector3[];
  /** HV DC connector [inverter frame] and the ES connector [ES frame]. */
  readonly dcPort: THREE.Vector3;
  readonly esPort: THREE.Vector3;
  readonly lids: Lid[];
  /** Points for labels / the energy path [own frames]. */
  readonly at: { modules: THREE.Vector3; module: THREE.Vector3; cells: THREE.Vector3 };
  /** Show the state of charge on the cell tops: charged cells take `on`, the rest `off`. */
  setSoc(soc: number, on: THREE.Color, off: THREE.Color): void;
  /** The SoC caps' material (owned by the caller). */
  readonly socMesh: THREE.InstancedMesh;
}

function hvLabel(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 86, 96);
  g.fillStyle = '#111111';
  g.beginPath();
  g.moveTo(43, 14);
  g.lineTo(78, 80);
  g.lineTo(8, 80);
  g.closePath();
  g.fill();
  g.fillStyle = '#f2c230';
  g.beginPath();
  g.moveTo(47, 32);
  g.lineTo(34, 58);
  g.lineTo(44, 58);
  g.lineTo(39, 74);
  g.lineTo(54, 50);
  g.lineTo(44, 50);
  g.closePath();
  g.fill();
  g.fillStyle = '#111111';
  g.font = 'bold 26px sans-serif';
  g.fillText('PERICOLO', 98, 42);
  g.font = '20px sans-serif';
  g.fillText('alta tensione', 98, 72);
  return c;
}

export function buildPower(
  sink: PartSink,
  own: <T extends THREE.Material>(m: T) => T,
  ownTex: (t: THREE.Texture) => THREE.Texture,
): Power {
  const box = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    look: Look,
    r = 0.002,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(sink.geo(chamferBox(w, h, d, r, 1)));
    m.position.set(x, y, z);
    parent.add(m);
    sink.solid(m, look);
    return m;
  };
  const inst = (
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    pos: Array<[number, number, number]>,
    look: Look,
  ): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(sink.geo(g), undefined, pos.length);
    const t = new THREE.Matrix4();
    pos.forEach(([x, y, z], i) => m.setMatrixAt(i, t.makeTranslation(x, y, z)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    parent.add(m);
    sink.solid(m, look);
    return m;
  };
  const tube = (
    parent: THREE.Object3D,
    pts: THREE.Vector3[],
    r: number,
    look: Look,
    seg = 32,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(
      sink.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false)),
    );
    parent.add(m);
    sink.solid(m, look);
    return m;
  };
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const lids: Lid[] = [];

  // ================================================================ inverter
  const inverter = new THREE.Group();
  inverter.name = 'inverter';
  const W = INVERTER.x;
  const H = INVERTER.y;
  const D = INVERTER.z;
  const wall = 0.007;
  const yb = -H / 2;
  box(inverter, W, 0.012, D, 0, yb + 0.006, 0, 'alu', 0.003);
  box(inverter, W, H - 0.012, wall, 0, yb + H / 2 + 0.006, -D / 2 + wall / 2, 'alu');
  box(inverter, W, H - 0.012, wall, 0, yb + H / 2 + 0.006, D / 2 - wall / 2, 'alu');
  box(inverter, wall, H - 0.012, D - 2 * wall, -W / 2 + wall / 2, yb + H / 2 + 0.006, 0, 'alu');
  box(inverter, wall, H - 0.012, D - 2 * wall, W / 2 - wall / 2, yb + H / 2 + 0.006, 0, 'alu');
  // mounting ears and bolts round the rim
  for (const [x, z] of [
    [-W / 2 - 0.012, -D / 2 + 0.03],
    [-W / 2 - 0.012, D / 2 - 0.03],
    [W / 2 + 0.012, -D / 2 + 0.03],
    [W / 2 + 0.012, D / 2 - 0.03],
  ] as const) {
    box(inverter, 0.026, 0.01, 0.03, x, yb + 0.005, z, 'alu', 0.003);
  }
  {
    const pos: Array<[number, number, number]> = [];
    for (let k = 0; k < 6; k++) {
      const x = -W / 2 + 0.02 + (k * (W - 0.04)) / 5;
      pos.push([x, H / 2 + 0.002, -D / 2 + 0.0035], [x, H / 2 + 0.002, D / 2 - 0.0035]);
    }
    for (let k = 0; k < 4; k++) {
      const z = -D / 2 + 0.03 + (k * (D - 0.06)) / 3;
      pos.push([-W / 2 + 0.0035, H / 2 + 0.002, z], [W / 2 - 0.0035, H / 2 + 0.002, z]);
    }
    inst(inverter, new THREE.CylinderGeometry(0.0032, 0.0032, 0.003, 6), pos, 'steel');
  }
  // cold plate with its serpentine coolant channel and two fittings out of the back wall
  const yCp = yb + 0.012 + 0.004;
  box(inverter, W - 0.03, 0.008, D - 0.03, 0, yCp, 0, 'darkSteel', 0.0015);
  {
    const pts: THREE.Vector3[] = [V(-W / 2 + 0.03, yCp + 0.005, -D / 2 - 0.02)];
    const xs = [-0.1, -0.05, 0, 0.05, 0.1];
    xs.forEach((x, i) => {
      const za = i % 2 === 0 ? -0.075 : 0.075;
      pts.push(V(x, yCp + 0.005, -za), V(x, yCp + 0.005, za));
    });
    pts.push(V(W / 2 - 0.03, yCp + 0.005, -D / 2 - 0.02));
    tube(inverter, pts, 0.0035, 'steel', 120);
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
      const f = new THREE.Mesh(sink.geo(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 16)));
      f.rotation.x = Math.PI / 2;
      f.position.set(x, yCp + 0.005, -D / 2 - 0.016);
      inverter.add(f);
      sink.solid(f, 'plastic');
    }
  }
  // three SiC phase-leg modules (U, V, W), open: frame, DBC, dies, bond wires, terminals
  const yM = yCp + 0.004;
  const modX = [-0.075, 0, 0.075];
  const modW = 0.056;
  const modD = 0.09;
  const acTabs: THREE.Vector3[] = [];
  for (const x of modX) {
    box(inverter, modW, 0.004, modD, x, yM + 0.002, 0.01, 'plastic', 0.001);
    box(inverter, modW, 0.012, 0.004, x, yM + 0.006, 0.01 - modD / 2 + 0.002, 'plastic', 0.001);
    box(inverter, modW, 0.012, 0.004, x, yM + 0.006, 0.01 + modD / 2 - 0.002, 'plastic', 0.001);
    box(inverter, 0.004, 0.012, modD, x - modW / 2 + 0.002, yM + 0.006, 0.01, 'plastic', 0.001);
    box(inverter, 0.004, 0.012, modD, x + modW / 2 - 0.002, yM + 0.006, 0.01, 'plastic', 0.001);
    box(inverter, modW - 0.01, 0.0015, modD - 0.01, x, yM + 0.0048, 0.01, 'ceramic', 0.0004);
    box(inverter, 0.02, 0.001, modD - 0.02, x - 0.011, yM + 0.006, 0.01, 'copper', 0.0003);
    box(inverter, 0.02, 0.001, modD - 0.02, x + 0.011, yM + 0.006, 0.01, 'copper', 0.0003);
    const dies: Array<[number, number, number]> = [];
    for (const dx of [-0.011, 0.011])
      for (const dz of [-0.022, -0.004, 0.014, 0.032]) dies.push([x + dx, yM + 0.0071, dz]);
    inst(inverter, new THREE.BoxGeometry(0.0075, 0.0007, 0.0075), dies, 'die');
    // bond wires: small arcs from each die to the next pad
    const wire = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.0035, 0.004, 0), V(0.008, 0, 0)]),
      8,
      0.0003,
      4,
      false,
    );
    const wires: Array<[number, number, number]> = [];
    for (const [dx, , dz] of dies)
      for (const o of [-0.002, 0, 0.002]) wires.push([dx - 0.001, yM + 0.0074, dz + o]);
    inst(inverter, wire, wires, 'copperTip');
    // DC terminals at the back, AC tab at the front
    box(
      inverter,
      0.012,
      0.016,
      0.004,
      x - 0.012,
      yM + 0.012,
      0.01 - modD / 2 - 0.002,
      'copper',
      0.0005,
    );
    box(
      inverter,
      0.012,
      0.016,
      0.004,
      x + 0.012,
      yM + 0.012,
      0.01 - modD / 2 - 0.002,
      'copper',
      0.0005,
    );
    box(inverter, 0.016, 0.016, 0.004, x, yM + 0.012, 0.01 + modD / 2 + 0.002, 'copper', 0.0005);
    acTabs.push(V(x, yM + 0.02, 0.01 + modD / 2 + 0.002));
  }
  // DC-link capacitor and the laminated DC busbars (+, insulation, −) over the module backs
  const zCap = -D / 2 + wall + 0.022;
  box(inverter, W - 0.05, 0.05, 0.034, 0, yM + 0.027, zCap, 'plastic', 0.003);
  box(inverter, W - 0.06, 0.002, 0.03, 0, yM + 0.053, zCap, 'insulator', 0.0005);
  box(inverter, W - 0.04, 0.003, 0.026, 0, yM + 0.022, -0.045, 'copper', 0.0008);
  box(inverter, W - 0.036, 0.0015, 0.03, 0, yM + 0.0245, -0.045, 'insulator', 0.0004);
  box(inverter, W - 0.04, 0.003, 0.026, 0, yM + 0.027, -0.045, 'copper', 0.0008);
  // AC busbars: from each module's front tab, up and out through the left wall
  const acExits: THREE.Vector3[] = [];
  acTabs.forEach((t, i) => {
    const y = yM + 0.03 + i * 0.008;
    const zz = D / 2 - 0.03 + i * 0.008 - 0.008;
    const exit = V(-W / 2 - 0.004, y, zz);
    const pts = [t, V(t.x, y, t.z + 0.004), V(t.x - 0.02, y, zz), V(-W / 2 + 0.02, y, zz), exit];
    const g = new THREE.Mesh(
      sink.geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
          24,
          0.0026,
          4,
          false,
        ),
      ),
    );
    inverter.add(g);
    sink.solid(g, 'copper');
    acExits.push(exit);
  });
  // HV DC connector on the right wall (orange shell)
  const dcPort = V(W / 2 + 0.018, yM + 0.03, -0.045);
  {
    const c = new THREE.Mesh(sink.geo(new THREE.CylinderGeometry(0.014, 0.014, 0.026, 20)));
    c.rotation.z = Math.PI / 2;
    c.position.set(W / 2 + 0.008, yM + 0.03, -0.045);
    inverter.add(c);
    sink.solid(c, 'orange');
  }
  // gate-driver board over the modules (half-width, so the modules stay visible)
  box(inverter, 0.07, 0.002, 0.07, 0.085, yM + 0.06, -0.01, 'pcb', 0.0005);
  // hinged lid (opens about the back edge)
  {
    const pivot = new THREE.Group();
    pivot.position.set(0, H / 2, -D / 2);
    inverter.add(pivot);
    const lid = new THREE.Mesh(sink.geo(chamferBox(W + 0.006, 0.008, D + 0.004, 0.003, 1)));
    lid.position.set(0, 0.004, D / 2);
    pivot.add(lid);
    sink.cover(lid, 'alu');
    // outer cooling fins (along z) and inner stiffening ribs + gasket rim, so the open lid
    // reads as a cast part rather than a blank plate
    const ribs = (
      w: number,
      h: number,
      d: number,
      y: number,
      xs: number[],
      look: Look,
      zs = [D / 2],
    ): void => {
      for (const x of xs)
        for (const z of zs) {
          const r = new THREE.Mesh(sink.geo(chamferBox(w, h, d, Math.min(w, h) * 0.3, 1)));
          r.position.set(x, y, z);
          pivot.add(r);
          sink.cover(r, look);
        }
    };
    const nFin = 9;
    ribs(
      0.004,
      0.008,
      D - 0.02,
      0.012,
      Array.from({ length: nFin }, (_, k) => (k / (nFin - 1) - 0.5) * (W - 0.03)),
      'alu',
    );
    ribs(0.006, 0.006, D - 0.01, -0.003, [-W / 2 + 0.004, W / 2 - 0.004, -W / 6, W / 6], 'housing');
    ribs(W - 0.01, 0.006, 0.006, -0.003, [0], 'housing', [0.006, D - 0.004, D / 2]);
    lids.push({ pivot, open: -2.95 });
  }

  // ================================================================ energy store
  const es = new THREE.Group();
  es.name = 'es';
  const EW = BATTERY.x;
  const EH = BATTERY.y;
  const ED = BATTERY.z;
  const ew = 0.008;
  const eyb = -EH / 2;
  const trayH = EH * 0.78;
  box(es, EW, 0.01, ED, 0, eyb + 0.005, 0, 'carbon', 0.004);
  box(es, EW, trayH, ew, 0, eyb + trayH / 2, -ED / 2 + ew / 2, 'carbon', 0.003);
  box(es, EW, trayH, ew, 0, eyb + trayH / 2, ED / 2 - ew / 2, 'carbon', 0.003);
  box(es, ew, trayH, ED - 2 * ew, -EW / 2 + ew / 2, eyb + trayH / 2, 0, 'carbon', 0.003);
  box(es, ew, trayH, ED - 2 * ew, EW / 2 - ew / 2, eyb + trayH / 2, 0, 'carbon', 0.003);
  // flange seam with bolts (ref 03)
  const ySeam = eyb + trayH;
  box(es, EW + 0.014, 0.006, 0.014, 0, ySeam, -ED / 2, 'darkSteel', 0.002);
  box(es, EW + 0.014, 0.006, 0.014, 0, ySeam, ED / 2, 'darkSteel', 0.002);
  box(es, 0.014, 0.006, ED, -EW / 2, ySeam, 0, 'darkSteel', 0.002);
  box(es, 0.014, 0.006, ED, EW / 2, ySeam, 0, 'darkSteel', 0.002);
  {
    const pos: Array<[number, number, number]> = [];
    for (let k = 0; k < 9; k++) {
      const x = -EW / 2 + 0.02 + (k * (EW - 0.04)) / 8;
      pos.push([x, ySeam + 0.004, -ED / 2], [x, ySeam + 0.004, ED / 2]);
    }
    for (let k = 0; k < 5; k++) {
      const z = -ED / 2 + 0.03 + (k * (ED - 0.06)) / 4;
      pos.push([-EW / 2, ySeam + 0.004, z], [EW / 2, ySeam + 0.004, z]);
    }
    inst(es, new THREE.CylinderGeometry(0.003, 0.003, 0.003, 6), pos, 'steel');
  }
  // cells: ES_ROWS rows (z) × ES_COLS columns (x) of prismatic cells, module walls between rows
  const cw = (EW - 2 * ew - 0.02) / ES_COLS;
  const cd = (ED - 2 * ew - 0.012 - (ES_ROWS - 1) * 0.006) / ES_ROWS;
  const ch = trayH - 0.022;
  const cy = eyb + 0.01 + ch / 2;
  const cellPos: Array<[number, number, number]> = [];
  const termPos: Array<[number, number, number]> = [];
  const capPos: Array<[number, number, number]> = [];
  for (let r = 0; r < ES_ROWS; r++) {
    const z = -ED / 2 + ew + 0.006 + cd / 2 + r * (cd + 0.006);
    for (let c = 0; c < ES_COLS; c++) {
      const x = -EW / 2 + ew + 0.01 + cw / 2 + c * cw;
      cellPos.push([x, cy, z]);
      capPos.push([x, cy + ch / 2 + 0.0008, z]);
      termPos.push([x, cy + ch / 2 + 0.003, z - cd * 0.3], [x, cy + ch / 2 + 0.003, z + cd * 0.3]);
    }
    // busbar strips along the row over the terminals
    for (const s of [-1, 1])
      box(
        es,
        EW - 2 * ew - 0.03,
        0.0015,
        0.007,
        0,
        cy + ch / 2 + 0.006,
        z + s * cd * 0.3,
        'copper',
        0.0005,
      );
    if (r > 0)
      box(es, EW - 2 * ew - 0.012, ch * 0.9, 0.003, 0, cy, z - cd / 2 - 0.003, 'alu', 0.001);
  }
  inst(es, new THREE.BoxGeometry(cw * 0.9, ch, cd), cellPos, 'ceramic');
  inst(es, new THREE.CylinderGeometry(0.0028, 0.0028, 0.006, 10), termPos, 'brass');
  const socMesh = new THREE.InstancedMesh(
    sink.geo(new THREE.BoxGeometry(cw * 0.78, 0.0016, cd * 0.34)),
    own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 })),
    capPos.length,
  );
  {
    const t = new THREE.Matrix4();
    capPos.forEach(([x, y, z], i) => socMesh.setMatrixAt(i, t.makeTranslation(x, y, z)));
    socMesh.instanceMatrix.needsUpdate = true;
    socMesh.computeBoundingSphere();
    es.add(socMesh);
  }
  // HV connector (top front-left) and the warning label on the front wall
  const esPort = V(-EW / 2 + 0.05, ySeam + 0.03, -ED / 2 + 0.05);
  {
    const c = new THREE.Mesh(sink.geo(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 20)));
    c.position.set(esPort.x, ySeam + 0.012, esPort.z);
    es.add(c);
    sink.solid(c, 'orange');
    const tex = ownTex(new THREE.CanvasTexture(hvLabel()));
    tex.colorSpace = THREE.SRGBColorSpace;
    const lab = new THREE.Mesh(
      sink.geo(new THREE.PlaneGeometry(0.12, 0.045)),
      own(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      ),
    );
    lab.position.set(0.08, eyb + trayH * 0.5, ED / 2 + 0.0005);
    es.add(lab);
  }
  // stepped carbon lid (ref 03), hinged at the back edge
  {
    const pivot = new THREE.Group();
    pivot.position.set(0, ySeam + 0.003, -ED / 2);
    es.add(pivot);
    const main = new THREE.Mesh(sink.geo(chamferBox(EW + 0.01, 0.022, ED + 0.01, 0.006, 2)));
    main.position.set(0, 0.011, ED / 2);
    pivot.add(main);
    sink.cover(main, 'carbon');
    const step = new THREE.Mesh(sink.geo(chamferBox(EW * 0.62, 0.014, ED * 0.7, 0.005, 2)));
    step.position.set(EW * 0.12, 0.028, ED / 2 + ED * 0.08);
    pivot.add(step);
    sink.cover(step, 'carbon');
    lids.push({ pivot, open: -1.75 });
  }

  const nCells = capPos.length;
  return {
    inverter,
    es,
    acExits,
    dcPort,
    esPort,
    lids,
    socMesh,
    at: {
      modules: V(0, yM + 0.02, 0.01),
      module: V(0, yM + 0.012, 0.0),
      cells: V(0, cy + ch / 2, 0),
    },
    setSoc(soc, on, off) {
      const k = Math.round(Math.min(1, Math.max(0, soc)) * nCells);
      for (let i = 0; i < nCells; i++) socMesh.setColorAt(i, i < k ? on : off);
      if (socMesh.instanceColor) socMesh.instanceColor.needsUpdate = true;
    },
  };
}
