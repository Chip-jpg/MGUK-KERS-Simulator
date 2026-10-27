import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { getPalette, quantityColorHex } from '../../ui';
import { glowFromFraction, particleFlow, visualTurns, type TransmissionResult } from './model';
import { fmtSI, fmtPercent } from './panel';

/**
 * Abstract schematic of the transport chain (slides 21–23): plant → step-up
 * transformer → HV line on pylons → step-down transformer → houses. Orthographic
 * camera, original geometry only. Red particles = current (density and speed
 * ∝ current), line heat glow ∝ Joule loss fraction.
 */

/** Live resource counters across all mounts (debug / leak check). */
export const sceneCounters = { renderers: 0, geometries: 0, materials: 0 };

export interface TransformerScene {
  readonly canvas: HTMLCanvasElement;
  update(r: TransmissionResult, N1: number, N2: number): void;
  /** Draw at simulation time `t` [s] (particles are a pure function of t). */
  render(t: number): void;
  setTheme(theme: Theme): void;
  /** `renderer.info.memory` + scene object count. */
  info(): { geometries: number; textures: number; objects: number; antialias: boolean };
  dispose(): void;
}

const MAX_RINGS = 24;
const MAX_PARTICLES = 28;
const WORLD_W = 22;
const WORLD_H = 9;

interface Segment {
  pts: THREE.Vector3[];
  len: number[];
  total: number;
  mesh: THREE.InstancedMesh;
  count: number;
  speed: number;
}

/**
 * MSAA is nearly free on a GPU but ~3× slower on CPU rasterisers (SwiftShader /
 * llvmpipe, e.g. headless CI or no GPU driver): enable it only on hardware GL.
 */
function hardwareAntialias(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return true;
  }
}

export function createTransformerScene(
  container: HTMLElement,
  overlay: HTMLElement,
  theme: Theme,
): TransformerScene {
  const renderer = new THREE.WebGLRenderer({ antialias: hardwareAntialias(), alpha: true });
  sceneCounters.renderers++;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-11, 11, 4.5, -4.5, 0.1, 100);
  camera.position.set(0, 1.2, 30);
  camera.lookAt(0, 0, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    sceneCounters.geometries++;
    return g;
  };
  const mat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    sceneCounters.materials++;
    return m;
  };

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(-4, 8, 10);
  scene.add(dir);

  const pal0 = getPalette(theme);
  const neutralMat = mat(new THREE.MeshLambertMaterial({ color: pal0.neutral }));
  const coreMat = mat(new THREE.MeshLambertMaterial({ color: 0x8a939e }));
  const coilMat = mat(new THREE.MeshLambertMaterial({ color: 0xc8793a }));
  const wireMat = mat(new THREE.MeshBasicMaterial({ color: pal0.textMuted }));
  const particleMat = mat(new THREE.MeshBasicMaterial({ color: quantityColorHex('i', theme) }));
  const glowMat = mat(
    new THREE.MeshBasicMaterial({
      color: quantityColorHex('i', theme),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const box = geo(new THREE.BoxGeometry(1, 1, 1));

  const addBox = (
    m: THREE.Material,
    x: number,
    y: number,
    sx: number,
    sy: number,
    sz = 0.4,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(box, m);
    mesh.position.set(x, y, 0);
    mesh.scale.set(sx, sy, sz);
    scene.add(mesh);
    return mesh;
  };

  // Ground.
  addBox(wireMat, 0, -3.3, 21, 0.05, 0.05);
  // Plant: block + chimney-free abstract turbine disc.
  addBox(neutralMat, -9, -1.8, 2.2, 3, 1.2);
  const disc = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 32)), coreMat);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(-9, -1.4, 0.75);
  scene.add(disc);

  // Transformer (core frame + two coils of instanced rings).
  const ringGeo = geo(new THREE.TorusGeometry(0.42, 0.06, 8, 24));
  const coils: THREE.InstancedMesh[] = [];
  const legH = 2.6;
  const buildTransformer = (cx: number, cy: number): [THREE.InstancedMesh, THREE.InstancedMesh] => {
    addBox(coreMat, cx - 0.9, cy, 0.35, legH + 0.35, 0.35);
    addBox(coreMat, cx + 0.9, cy, 0.35, legH + 0.35, 0.35);
    addBox(coreMat, cx, cy + legH / 2, 2.15, 0.35, 0.35);
    addBox(coreMat, cx, cy - legH / 2, 2.15, 0.35, 0.35);
    const left = new THREE.InstancedMesh(ringGeo, coilMat, MAX_RINGS);
    const right = new THREE.InstancedMesh(ringGeo, coilMat, MAX_RINGS);
    left.position.set(cx - 0.9, cy, 0);
    right.position.set(cx + 0.9, cy, 0);
    scene.add(left, right);
    coils.push(left, right);
    return [left, right];
  };
  const [upPrim, upSec] = buildTransformer(-5, -1.6);
  const [downPrim, downSec] = buildTransformer(5, -1.6);

  const placeRings = (coil: THREE.InstancedMesh, n: number): void => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2 - 0.25,
    );
    const span = legH - 0.5;
    for (let k = 0; k < n; k++) {
      const y = n === 1 ? 0 : -span / 2 + (span * k) / (n - 1);
      m.compose(new THREE.Vector3(0, y, 0), q, new THREE.Vector3(1, 1, 1));
      coil.setMatrixAt(k, m);
    }
    coil.count = n;
    coil.instanceMatrix.needsUpdate = true;
  };

  // Pylons and HV line.
  const lineY = 2.4;
  for (const px of [-2, 2]) {
    addBox(neutralMat, px, -0.45, 0.18, 5.7, 0.18);
    addBox(neutralMat, px, lineY + 0.1, 1.4, 0.14, 0.14);
  }
  addBox(wireMat, 0, lineY, 7.6, 0.07, 0.07);
  const glow = addBox(glowMat, 0, lineY, 7.6, 0.5, 0.05);

  // Houses.
  const roofGeo = geo(new THREE.ConeGeometry(0.7, 0.7, 4));
  for (const [hx, s] of [
    [8.2, 1],
    [9.4, 0.8],
    [10.3, 0.9],
  ] as const) {
    addBox(neutralMat, hx, -3.3 + 0.45 * s, 0.9 * s, 0.9 * s, 0.6);
    const roof = new THREE.Mesh(roofGeo, coilMat);
    roof.position.set(hx, -3.3 + 0.9 * s + 0.3 * s, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.setScalar(s);
    scene.add(roof);
  }

  // Wires along which particles flow.
  const v = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, 0.5);
  const segPaths = [
    [v(-7.9, -1.6), v(-6.4, -1.6)], // plant → step-up primary
    [v(-3.6, -1.6), v(-3.2, -1.6), v(-3.2, lineY), v(3.2, lineY), v(3.2, -1.6), v(3.6, -1.6)], // HV line
    [v(6.4, -1.6), v(7.2, -1.6), v(7.2, -2.6), v(10.3, -2.6)], // step-down → users
  ];
  const sphere = geo(new THREE.SphereGeometry(0.1, 10, 8));
  const segments: Segment[] = segPaths.map((pts) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k] as THREE.Vector3;
      const b = pts[k + 1] as THREE.Vector3;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const d = b.clone().sub(a);
      const w = addBox(
        wireMat,
        mid.x,
        mid.y,
        Math.max(Math.abs(d.x), 0.05),
        Math.max(Math.abs(d.y), 0.05),
        0.05,
      );
      w.position.z = 0.3;
    }
    const len: number[] = [0];
    for (let k = 1; k < pts.length; k++)
      len.push(
        (len[k - 1] ?? 0) + (pts[k] as THREE.Vector3).distanceTo(pts[k - 1] as THREE.Vector3),
      );
    const mesh = new THREE.InstancedMesh(sphere, particleMat, MAX_PARTICLES);
    mesh.count = 0;
    scene.add(mesh);
    return { pts, len, total: len[len.length - 1] ?? 1, mesh, count: 0, speed: 0 };
  });

  // HTML labels in the overlay.
  const labels: Array<{ node: HTMLElement; at: THREE.Vector3 }> = [];
  const label = (x: number, y: number, cls = ''): HTMLElement => {
    const node = document.createElement('div');
    node.className = `jt-label ${cls}`;
    overlay.append(node);
    labels.push({ node, at: new THREE.Vector3(x, y, 0) });
    return node;
  };
  const lPlant = label(-8.6, -3.55, 'jt-label--below');
  const lUp = label(-5, 0.35);
  const lLine = label(0, lineY + 0.9, 'jt-label--line');
  const lDown = label(5, 0.35);
  const lUsers = label(9.2, -3.55, 'jt-label--below');

  const placeLabels = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const { node, at } of labels) {
      const p = at.clone().project(camera);
      // Keep the (centred) label inside the scene.
      const half = node.offsetWidth / 2 + 4;
      const left = Math.min(Math.max(((p.x + 1) / 2) * w, half), Math.max(half, w - half));
      node.style.left = `${left}px`;
      node.style.top = `${((1 - p.y) / 2) * h}px`;
    }
  };

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    let halfW = WORLD_W / 2;
    let halfH = halfW / aspect;
    if (halfH < WORLD_H / 2) {
      halfH = WORLD_H / 2;
      halfW = halfH * aspect;
    }
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    placeLabels();
    renderer.render(scene, camera);
  };
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  ro?.observe(container);
  resize();

  const tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const pointAt = (s: Segment, d: number): THREE.Vector3 => {
    let k = 1;
    while (k < s.len.length - 1 && (s.len[k] ?? 0) < d) k++;
    const a = s.pts[k - 1] as THREE.Vector3;
    const b = s.pts[k] as THREE.Vector3;
    const l0 = s.len[k - 1] ?? 0;
    const seg = (s.len[k] ?? 0) - l0 || 1;
    return tmpP.copy(a).lerp(b, (d - l0) / seg);
  };

  return {
    canvas: renderer.domElement,
    update(r, N1, N2) {
      const vt = visualTurns(N1, N2, MAX_RINGS);
      placeRings(upPrim, vt.n1);
      placeRings(upSec, vt.n2);
      placeRings(downPrim, vt.n2);
      placeRings(downSec, vt.n1);
      const Iref = Math.max(r.I1, r.I2, r.Iout);
      const flows = [r.I1, r.I2, r.Iout].map((I) => particleFlow(I, Iref, MAX_PARTICLES));
      segments.forEach((s, k) => {
        const f = flows[k] ?? { count: 0, speed: 0 };
        s.count = f.count;
        s.speed = f.speed * 2.2;
        s.mesh.count = f.count;
      });
      glowMat.opacity = 0.85 * glowFromFraction(r.line.fraction);
      glow.scale.y = 0.25 + 0.6 * glowFromFraction(r.line.fraction);
      lPlant.textContent = `Centrale · V₁ = ${fmtSI(r.V1, 'V')} · I₁ = ${fmtSI(r.I1, 'A')}`;
      lUp.textContent = `Elevatore N₁ : N₂ = ${N1} : ${N2}`;
      lLine.textContent = `Linea AT · V₂ = ${fmtSI(r.V2, 'V')} · I = ${fmtSI(r.I2, 'A')} · perdita ${fmtSI(r.line.loss, 'W')} (${fmtPercent(r.line.fraction)})`;
      lDown.textContent = `Abbassatore N₂ : N₁`;
      lUsers.textContent = r.valid ? `Utenze · ${fmtSI(r.Vout, 'V')}` : 'Utenze · —';
      placeLabels();
    },
    render(t) {
      for (const s of segments) {
        for (let j = 0; j < s.count; j++) {
          const phase = ((((t * s.speed) / s.total + j / s.count) % 1) + 1) % 1;
          tmpM.makeTranslation(pointAt(s, phase * s.total));
          s.mesh.setMatrixAt(j, tmpM);
        }
        s.mesh.instanceMatrix.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    setTheme(next) {
      const p = getPalette(next);
      neutralMat.color.set(p.neutral);
      wireMat.color.set(p.textMuted);
      particleMat.color.setHex(quantityColorHex('i', next));
      glowMat.color.setHex(quantityColorHex('i', next));
      renderer.render(scene, camera);
    },
    info() {
      let objects = 0;
      scene.traverse(() => void objects++);
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        objects,
        antialias: renderer.getContext().getContextAttributes()?.antialias ?? false,
      };
    },
    dispose() {
      ro?.disconnect();
      for (const c of coils) c.dispose();
      for (const s of segments) s.mesh.dispose();
      geometries.splice(0).forEach((g) => {
        g.dispose();
        sceneCounters.geometries--;
      });
      materials.splice(0).forEach((m) => {
        m.dispose();
        sceneCounters.materials--;
      });
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      sceneCounters.renderers--;
      labels.splice(0).forEach((l) => l.node.remove());
    },
  };
}
