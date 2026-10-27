/**
 * Three.js scene of the `alternator-motor` simulator: abstract N/S stator
 * blocks, uniform-B arrows (InstancedMesh, blue), the rotating rectangular coil,
 * current arrows on the active sides (red) and Lorentz-force arrows (green).
 * Original abstract geometry only (no logos, photos or external assets).
 *
 * World frame = model frame (see model.ts): B along +x, rotor axis +y.
 * Lengths are drawn at DRAW_SCALE × the real coil size.
 */
import * as THREE from 'three';
import { getPalette, quantityColorHex } from '../../ui';
import type { Theme } from '../../core/types';
import type { MachineMode } from './model';

/** World units per metre of coil. */
const DRAW_SCALE = 4;
/** Pole faces at x = ±POLE_X (world units). */
const POLE_X = 0.95;
const MAGNET_SIZE = { x: 0.45, y: 1.4, z: 1.1 };
const B_ROWS_Y = [-0.55, -0.275, 0, 0.275, 0.55];
const B_ROWS_Z = [-0.4, 0, 0.4];
const ARROW_MAX = 0.6;
const TUBE_R = 0.025;

export interface SceneView {
  mode: MachineMode;
  theta: number;
  /** B / B_max ∈ [0,1] (arrow opacity). */
  bRel: number;
  L: number;
  w: number;
  /** Current in the reference side along +y, normalised to [-1, 1]. */
  iRel: number;
  /** Lorentz force on the reference side, normalised to [-1, 1]. */
  fRel: number;
}

export interface SceneInfo {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
}

export interface MachineScene {
  update(v: SceneView): void;
  render(): void;
  setTheme(theme: Theme): void;
  info(): SceneInfo;
  dispose(): void;
}

/** Arrow built from shared unit geometries (shaft along +y, length 1). */
interface Arrow {
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Arrow length for a normalised value: hidden below 2 %, then 25 %…100 % of ARROW_MAX. */
export function arrowLength(rel: number): number {
  const r = Math.min(1, Math.abs(rel));
  return r < 0.02 ? 0 : ARROW_MAX * (0.25 + 0.75 * r);
}

export function createMachineScene(
  container: HTMLElement,
  overlay: HTMLElement,
  theme: Theme,
): MachineScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 50);
  camera.position.set(1.5, 2.1, 3.1);
  camera.lookAt(0, -0.15, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => (geometries.push(g), g);
  const mat = <M extends THREE.Material>(m: M): M => (materials.push(m), m);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 4);
  scene.add(sun);

  // --- stator: abstract N and S blocks ------------------------------------
  const magnetGeo = geo(new THREE.BoxGeometry(MAGNET_SIZE.x, MAGNET_SIZE.y, MAGNET_SIZE.z));
  const matN = mat(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }));
  const matS = mat(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }));
  const magN = new THREE.Mesh(magnetGeo, matN);
  magN.position.x = -POLE_X - MAGNET_SIZE.x / 2;
  const magS = new THREE.Mesh(magnetGeo, matS);
  magS.position.x = POLE_X + MAGNET_SIZE.x / 2;
  scene.add(magN, magS);

  // Pole labels: HTML in the (aria-hidden) overlay, placed by projecting the block tops.
  const poleLabels = (['N', 'S'] as const).map((txt) => {
    const d = document.createElement('div');
    d.className = 'am-pole';
    d.textContent = txt;
    overlay.append(d);
    return d;
  });

  // --- shared arrow geometry -----------------------------------------------
  const shaftGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0));
  const headGeo = geo(new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0));

  // --- uniform B: InstancedMesh arrows from N to S --------------------------
  const nB = B_ROWS_Y.length * B_ROWS_Z.length;
  const matB = mat(new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.5 }));
  const bShafts = new THREE.InstancedMesh(shaftGeo, matB, nB);
  const bHeads = new THREE.InstancedMesh(headGeo, matB, nB);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0));
    const len = 2 * POLE_X - 0.12;
    let k = 0;
    for (const y of B_ROWS_Y) {
      for (const z of B_ROWS_Z) {
        const start = new THREE.Vector3(-POLE_X + 0.02, y, z);
        m.compose(start, q, new THREE.Vector3(0.008, len - 0.08, 0.008));
        bShafts.setMatrixAt(k, m);
        m.compose(
          start.clone().add(new THREE.Vector3(len - 0.08, 0, 0)),
          q,
          new THREE.Vector3(0.03, 0.08, 0.03),
        );
        bHeads.setMatrixAt(k, m);
        k++;
      }
    }
  }
  scene.add(bShafts, bHeads);

  // --- rotor: axle + coil ---------------------------------------------------
  const axleMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }));
  const axleGeo = geo(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 12));
  const axle = new THREE.Mesh(axleGeo, axleMat);
  scene.add(axle);

  const coilMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 }));
  const tubeGeo = geo(new THREE.CylinderGeometry(TUBE_R, TUBE_R, 1, 10));
  const coil = new THREE.Group();
  const sideA = new THREE.Mesh(tubeGeo, coilMat);
  const sideB = new THREE.Mesh(tubeGeo, coilMat);
  const endTop = new THREE.Mesh(tubeGeo, coilMat);
  const endBot = new THREE.Mesh(tubeGeo, coilMat);
  endTop.rotation.x = Math.PI / 2;
  endBot.rotation.x = Math.PI / 2;
  coil.add(sideA, sideB, endTop, endBot);
  scene.add(coil);

  const makeArrow = (material: THREE.Material): Arrow => {
    const shaft = new THREE.Mesh(shaftGeo, material);
    const head = new THREE.Mesh(headGeo, material);
    const group = new THREE.Group();
    group.add(shaft, head);
    return { group, shaft, head };
  };
  const setArrow = (a: Arrow, origin: THREE.Vector3, dir: THREE.Vector3, length: number): void => {
    if (length < 0.02) {
      a.group.visible = false;
      return;
    }
    a.group.visible = true;
    a.group.position.copy(origin);
    a.group.quaternion.setFromUnitVectors(UP, dir);
    const headLen = Math.min(0.12, length * 0.45);
    a.shaft.scale.set(0.022, length - headLen, 0.022);
    a.head.position.y = length - headLen;
    a.head.scale.set(0.065, headLen, 0.065);
  };

  const matI = mat(new THREE.MeshStandardMaterial({ roughness: 0.4 }));
  const matF = mat(new THREE.MeshStandardMaterial({ roughness: 0.4 }));
  const iA = makeArrow(matI);
  const iB = makeArrow(matI);
  coil.add(iA.group, iB.group); // current arrows rotate with the coil
  const fA = makeArrow(matF);
  const fB = makeArrow(matF);
  scene.add(fA.group, fB.group); // force arrows are along world ∓z

  let geomKey = '';
  let halfW = 0.2;
  const setCoilSize = (L: number, w: number): void => {
    const key = `${L}|${w}`;
    if (key === geomKey) return;
    geomKey = key;
    const h = L * DRAW_SCALE;
    halfW = (w * DRAW_SCALE) / 2;
    sideA.scale.set(1, h, 1);
    sideA.position.set(0, 0, halfW);
    sideB.scale.set(1, h, 1);
    sideB.position.set(0, 0, -halfW);
    endTop.scale.set(1, 2 * halfW, 1);
    endTop.position.set(0, h / 2, 0);
    endBot.scale.set(1, 2 * halfW, 1);
    endBot.position.set(0, -h / 2, 0);
  };

  const tmpO = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const update = (v: SceneView): void => {
    setCoilSize(v.L, v.w);
    coil.rotation.y = v.theta;
    matB.opacity = 0.25 + 0.75 * Math.min(1, Math.max(0, v.bRel));
    // current: reference side (A, +z in the coil frame) along sign(i)·y, side B opposite
    const iLen = arrowLength(v.iRel);
    const sgnI = Math.sign(v.iRel);
    setArrow(iA, tmpO.set(0.06, (-sgnI * iLen) / 2, halfW), tmpD.set(0, sgnI || 1, 0), iLen);
    setArrow(iB, tmpO.set(0.06, (sgnI * iLen) / 2, -halfW), tmpD.set(0, -sgnI || 1, 0), iLen);
    // Lorentz force F = i L × B: side A along −sign(s)·z, side B opposite (world frame)
    const fLen = arrowLength(v.fRel);
    const sgnF = Math.sign(v.fRel);
    const ax = Math.sin(v.theta) * halfW;
    const az = Math.cos(v.theta) * halfW;
    setArrow(fA, tmpO.set(ax, 0, az), tmpD.set(0, 0, -sgnF || 1), fLen);
    setArrow(fB, tmpO.set(-ax, 0, -az), tmpD.set(0, 0, sgnF || 1), fLen);
  };

  const setTheme = (t: Theme): void => {
    const pal = getPalette(t);
    scene.background = new THREE.Color(pal.surface);
    matN.color.set(t === 'dark' ? 0x5a6472 : 0x8a94a3);
    matS.color.set(t === 'dark' ? 0x3a424d : 0xb7c0cc);
    axleMat.color.set(pal.neutral);
    coilMat.color.set(t === 'dark' ? 0xd0d6dd : 0x9aa3ae);
    matB.color.setHex(quantityColorHex('b', t));
    matI.color.setHex(quantityColorHex('i', t));
    matF.color.setHex(quantityColorHex('f', t));
  };
  setTheme(theme);

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const v = new THREE.Vector3();
    [magN, magS].forEach((m, k) => {
      v.set(m.position.x, MAGNET_SIZE.y / 2 + 0.12, 0).project(camera);
      const lbl = poleLabels[k] as HTMLElement;
      lbl.style.left = `${((v.x + 1) / 2) * w}px`;
      lbl.style.top = `${((1 - v.y) / 2) * h}px`;
    });
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
      bShafts.dispose();
      bHeads.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      for (const l of poleLabels) l.remove();
    },
  };
}
