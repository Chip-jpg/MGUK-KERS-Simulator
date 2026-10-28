/**
 * Three.js scene of the `pmsm-dq` simulator: a three-phase stator with the
 * conductors of windings a, b, c (neutral tones + labels, not the §4.5 quantity
 * colours), a rotor with one north and one south magnet, the rotor d and q axes
 * and the rotating stator-field vector (∝ current space vector, blue = B).
 *
 * Drawn as the **two-pole equivalent** (one pole pair): mechanical angles in the
 * picture equal electrical angles θₑ of the model. Original abstract geometry.
 */
import * as THREE from 'three';
import { getPalette, quantityColorHex } from '../../ui';
import type { Theme } from '../../core/types';

const STATOR_R = { inner: 1.32, outer: 1.78 };
const ROTOR_R = { core: 0.6, outer: 1.02 };
const DEPTH = 0.5;
const SLOT_R = 1.18;
const UP = new THREE.Vector3(0, 1, 0);

export interface SceneView {
  /** Electrical rotor angle θₑ [rad] (= drawn angle). */
  thetaE: number;
  /** Angle of the stator current vector [rad]. */
  currentAngle: number;
  /** |i| / reference current ∈ [0, ~1.2]. */
  currentRel: number;
  /** Phase currents (sign decides ⊙ / ⊗). */
  ia: number;
  ib: number;
  ic: number;
}

export interface SceneInfo {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
}

export interface PmsmScene {
  update(v: SceneView): void;
  render(): void;
  setTheme(theme: Theme): void;
  info(): SceneInfo;
  dispose(): void;
}

/** Phase-conductor layout: magnetic axis of phase X at φ_X; "go" side at φ_X + 90°. */
export const PHASES = [
  { name: 'a', axis: 0 },
  { name: 'b', axis: (2 * Math.PI) / 3 },
  { name: 'c', axis: (4 * Math.PI) / 3 },
] as const;

/** ⊙ (out of the screen) for positive current in the go conductor, ⊗ otherwise. */
export function conductorSymbol(current: number, goSide: boolean, eps = 1e-6): string {
  if (Math.abs(current) <= eps) return '·';
  return current > 0 === goSide ? '⊙' : '⊗';
}

function sectorShape(rIn: number, rOut: number, a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(rOut * Math.cos(a0), rOut * Math.sin(a0));
  s.absarc(0, 0, rOut, a0, a1, false);
  s.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1));
  s.absarc(0, 0, rIn, a1, a0, true);
  s.closePath();
  return s;
}

export function createPmsmScene(
  container: HTMLElement,
  overlay: HTMLElement,
  theme: Theme,
): PmsmScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 50);
  camera.position.set(0, -2.1, 5.6);
  camera.lookAt(0, 0, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => (geometries.push(g), g);
  const mat = <M extends THREE.Material>(m: M): M => (materials.push(m), m);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, -2, 5);
  scene.add(sun);

  const extrude = (shape: THREE.Shape, depth = DEPTH): THREE.ExtrudeGeometry =>
    geo(
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 }).translate(
        0,
        0,
        -depth / 2,
      ),
    );

  // --- stator ring -----------------------------------------------------------
  const statorMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }));
  const ring = new THREE.Shape();
  ring.absarc(0, 0, STATOR_R.outer, 0, 2 * Math.PI, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, STATOR_R.inner, 0, 2 * Math.PI, true);
  ring.holes.push(hole);
  scene.add(new THREE.Mesh(extrude(ring), statorMat));

  // --- phase conductors (two per phase) ----------------------------------------
  const condGeo = geo(new THREE.BoxGeometry(0.2, 0.2, DEPTH + 0.16));
  const phaseMats = PHASES.map(() =>
    mat(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 })),
  );
  interface Conductor {
    phase: number;
    go: boolean;
    pos: THREE.Vector3;
    label: HTMLElement;
  }
  const conductors: Conductor[] = [];
  PHASES.forEach((ph, k) => {
    for (const go of [true, false]) {
      const ang = ph.axis + (go ? Math.PI / 2 : -Math.PI / 2);
      const pos = new THREE.Vector3(SLOT_R * Math.cos(ang), SLOT_R * Math.sin(ang), 0);
      const mesh = new THREE.Mesh(condGeo, phaseMats[k]);
      mesh.position.copy(pos);
      mesh.rotation.z = ang;
      scene.add(mesh);
      const label = document.createElement('div');
      label.className = 'pm-label pm-label--phase';
      overlay.append(label);
      conductors.push({ phase: k, go, pos: pos.clone().multiplyScalar(1.33), label });
    }
  });

  // --- rotor: core + N/S magnets, rotating group --------------------------------
  const rotor = new THREE.Group();
  const coreMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.5 }));
  const core = new THREE.Shape();
  core.absarc(0, 0, ROTOR_R.core, 0, 2 * Math.PI, false);
  rotor.add(new THREE.Mesh(extrude(core, DEPTH + 0.02), coreMat));
  const matN = mat(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }));
  const matS = mat(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }));
  rotor.add(
    new THREE.Mesh(
      extrude(sectorShape(ROTOR_R.core, ROTOR_R.outer, -Math.PI / 2, Math.PI / 2)),
      matN,
    ),
    new THREE.Mesh(
      extrude(sectorShape(ROTOR_R.core, ROTOR_R.outer, Math.PI / 2, (3 * Math.PI) / 2)),
      matS,
    ),
  );
  const shaftMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.7 }));
  const shaft = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 20)), shaftMat);
  shaft.rotation.x = Math.PI / 2;
  rotor.add(shaft);

  // shared arrow geometry (unit length along +y)
  const shaftGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0));
  const headGeo = geo(new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0));
  const makeArrow = (
    material: THREE.Material,
    radius: number,
  ): { group: THREE.Group; set(dir: THREE.Vector3, len: number): void } => {
    const s = new THREE.Mesh(shaftGeo, material);
    const h = new THREE.Mesh(headGeo, material);
    const group = new THREE.Group();
    group.add(s, h);
    return {
      group,
      set(dir, len) {
        group.visible = len > 0.03;
        if (!group.visible) return;
        group.quaternion.setFromUnitVectors(UP, dir);
        const headLen = Math.min(0.22, len * 0.4);
        s.scale.set(radius, len - headLen, radius);
        h.position.y = len - headLen;
        h.scale.set(radius * 2.8, headLen, radius * 2.8);
      },
    };
  };
  const axisMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const dAxis = makeArrow(axisMat, 0.018);
  const qAxis = makeArrow(axisMat, 0.018);
  dAxis.set(new THREE.Vector3(1, 0, 0), 1.12);
  qAxis.set(new THREE.Vector3(0, 1, 0), 1.12);
  dAxis.group.position.z = DEPTH / 2 + 0.05;
  qAxis.group.position.z = DEPTH / 2 + 0.05;
  rotor.add(dAxis.group, qAxis.group);
  scene.add(rotor);

  // --- stator field vector (∝ current space vector) ------------------------------
  const fieldMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4 }));
  const field = makeArrow(fieldMat, 0.045);
  field.group.position.z = DEPTH / 2 + 0.12;
  scene.add(field.group);

  // --- overlay labels ---------------------------------------------------------------
  const mkLabel = (cls: string, text: string): HTMLElement => {
    const d = document.createElement('div');
    d.className = `pm-label ${cls}`;
    d.textContent = text;
    overlay.append(d);
    return d;
  };
  const lblN = mkLabel('pm-label--pole', 'N');
  const lblS = mkLabel('pm-label--pole', 'S');
  const lblD = mkLabel('pm-label--axis', 'd');
  const lblQ = mkLabel('pm-label--axis', 'q');
  const allLabels = [lblN, lblS, lblD, lblQ, ...conductors.map((c) => c.label)];

  let width = 1;
  let height = 1;
  const tmp = new THREE.Vector3();
  const place = (lbl: HTMLElement, x: number, y: number, z: number): void => {
    tmp.set(x, y, z).project(camera);
    lbl.style.left = `${(((tmp.x + 1) / 2) * width).toFixed(1)}px`;
    lbl.style.top = `${(((1 - tmp.y) / 2) * height).toFixed(1)}px`;
  };
  const placeStatic = (): void => {
    for (const c of conductors) place(c.label, c.pos.x, c.pos.y, DEPTH / 2);
  };

  const dir = new THREE.Vector3();
  const lastSym: string[] = conductors.map(() => '');
  const update = (v: SceneView): void => {
    rotor.rotation.z = v.thetaE;
    const len = Math.min(1.25, Math.max(0, v.currentRel)) * 1.2;
    field.set(dir.set(Math.cos(v.currentAngle), Math.sin(v.currentAngle), 0), len);
    const c = Math.cos(v.thetaE);
    const s = Math.sin(v.thetaE);
    const z = DEPTH / 2 + 0.05;
    place(lblN, 0.82 * c, 0.82 * s, z);
    place(lblS, -0.82 * c, -0.82 * s, z);
    place(lblD, 1.24 * c, 1.24 * s, z);
    place(lblQ, -1.24 * s, 1.24 * c, z);
    const currents = [v.ia, v.ib, v.ic];
    conductors.forEach((cd, k) => {
      const txt = `${PHASES[cd.phase]?.name ?? ''}${cd.go ? '' : '′'} ${conductorSymbol(currents[cd.phase] ?? 0, cd.go)}`;
      if (lastSym[k] !== txt) {
        lastSym[k] = txt;
        cd.label.textContent = txt;
      }
    });
  };

  const setTheme = (t: Theme): void => {
    const pal = getPalette(t);
    scene.background = new THREE.Color(pal.surface);
    const dark = t === 'dark';
    statorMat.color.set(dark ? 0x4a525d : 0xc3cad3);
    coreMat.color.set(dark ? 0x6b7480 : 0x9aa3ae);
    shaftMat.color.set(pal.neutral);
    matN.color.set(dark ? 0x9aa4b0 : 0x5c6672);
    matS.color.set(dark ? 0x39414b : 0xdfe4ea);
    // three neutral tones for phases a, b, c (labels carry the identity)
    const tones = dark ? [0xe8ecf0, 0xb8c0c9, 0x858f9a] : [0x2f363d, 0x5c6672, 0x8a94a3];
    phaseMats.forEach((m, k) => m.color.set(tones[k] ?? 0x888888));
    axisMat.color.set(pal.textMuted);
    fieldMat.color.setHex(quantityColorHex('b', t));
  };
  setTheme(theme);

  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // keep the whole stator visible on narrow scenes
    camera.position.set(0, -2.3, 6.6 * Math.max(1, 1.25 / camera.aspect));
    camera.lookAt(0, -0.12, 0);
    camera.updateProjectionMatrix();
    placeStatic();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return {
    update,
    render: () => renderer.render(scene, camera),
    setTheme,
    info: () => ({
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      calls: renderer.info.render.calls,
    }),
    dispose() {
      ro.disconnect();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      for (const l of allLabels) l.remove();
    },
  };
}
