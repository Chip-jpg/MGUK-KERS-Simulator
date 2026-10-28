/**
 * Three.js scene of the `lenz` simulator: coil (torus rings) on the x axis,
 * bar magnet on the +x side, arrows for B of the magnet, induced B, current
 * (instanced arrowheads along the coil) and force on the magnet.
 *
 * Scene units: 1 unit = 0.1 m (SCALE). Original abstract geometry only.
 */
import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { getPalette, quantityColorHex } from '../../ui';
import { MAGNET_LENGTH, type Pole } from './model';

/** Scene units per metre. */
export const SCALE = 10;
/** Number of animated arrowheads along the coil. */
const CURRENT_MARKS = 12;
/** Torus rings drawn for the coil (visual only, independent of N). */
const COIL_RINGS = 5;
const COIL_LENGTH = 0.3; // scene units
const MAGNET_SIDE = 0.3; // scene units

/** Live counters of GPU resources created by every lenz scene (leak check). */
const live = { geometries: 0, materials: 0, textures: 0, renderers: 0 };
export function liveResources(): Readonly<typeof live> {
  return { ...live };
}

function trackGeometry<T extends THREE.BufferGeometry>(g: T): T {
  live.geometries += 1;
  g.addEventListener('dispose', () => void (live.geometries -= 1));
  return g;
}
function trackMaterial<T extends THREE.Material>(m: T): T {
  live.materials += 1;
  m.addEventListener('dispose', () => void (live.materials -= 1));
  return m;
}
function trackTexture<T extends THREE.Texture>(t: T): T {
  live.textures += 1;
  t.addEventListener('dispose', () => void (live.textures -= 1));
  return t;
}

/** What the scene draws for one frame (scene-independent, SI units). */
export interface LenzFrame {
  /** Magnet centre distance [m]. */
  z: number;
  pole: Pole;
  /** Coil radius [m]. */
  a: number;
  /** Mean field of the magnet at the coil, along +x [T]. */
  B: number;
  /** Induced field at the coil centre, along +x [T]. */
  Bind: number;
  /** lenzSign: +1 counter-clockwise seen from the magnet, −1 clockwise, 0 none. */
  sign: -1 | 0 | 1;
  /** |i| [A] (sets the animation speed of the current marks). */
  absI: number;
  /** Force on the magnet along +x [N]. */
  F: number;
  /** Time advanced since the last frame [s] (0 while paused). */
  animDt: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface LenzScene {
  readonly canvas: HTMLCanvasElement;
  setTheme(theme: Theme): void;
  resize(width: number, height: number): void;
  render(frame: LenzFrame): void;
  /** Does the pointer (client coords) hit the magnet? */
  hitMagnet(clientX: number, clientY: number): boolean;
  /** x [m] where the pointer ray meets the plane z = 0 (null if parallel). */
  axisX(clientX: number, clientY: number): number | null;
  /** Screen positions (CSS px, relative to the canvas) of the label anchors. */
  anchors(): Record<'bMag' | 'bInd' | 'current' | 'force' | 'face', ScreenPoint>;
  info(): { geometries: number; textures: number; calls: number; triangles: number };
  dispose(): void;
}

/** Arrow (shaft + head) along +x or −x with a given length. */
interface Arrow {
  group: THREE.Group;
  set(originX: number, y: number, z: number, sign: number, length: number): void;
  tipWorld(): THREE.Vector3;
}

/** Log-scale arrow length: maps |q| in [lo, hi] to [minLen, maxLen]. */
export function logLength(q: number, lo: number, hi: number, minLen: number, maxLen: number) {
  const aq = Math.abs(q);
  if (!(aq > 0)) return 0;
  const f = (Math.log10(aq) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return minLen + Math.min(1, Math.max(0, f)) * (maxLen - minLen);
}

function letterTexture(letter: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = fg;
    g.font = 'bold 84px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 64, 70);
  }
  const t = trackTexture(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLenzScene(theme: Theme): LenzScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  live.renderers += 1;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  const target = new THREE.Vector3(1.15, -0.05, 0);
  /** Place the camera so the stage x ∈ [−0.9, 3.2] (scene units) fits the canvas width. */
  const fitCamera = (): void => {
    const halfW = 2.05;
    const halfH = 1.25;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfW / (tanV * camera.aspect), halfH / tanV);
    const dir = new THREE.Vector3(-0.28, 0.42, 1).normalize();
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 5, 6);
  scene.add(sun);

  // --- materials ---------------------------------------------------------------
  const mat = {
    coil: trackMaterial(new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.45 })),
    axis: trackMaterial(new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.08 })),
    bMag: trackMaterial(new THREE.MeshStandardMaterial({ roughness: 0.5 })),
    bInd: trackMaterial(
      new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, opacity: 0.55 }),
    ),
    current: trackMaterial(new THREE.MeshStandardMaterial({ roughness: 0.4 })),
    force: trackMaterial(new THREE.MeshStandardMaterial({ roughness: 0.5 })),
  };
  // Pole colours are neutral (no quantity colour): dark = N, light = S, with letters.
  const texN = letterTexture('N', '#2b313b', '#f2f4f7');
  const texS = letterTexture('S', '#c9ced6', '#1b1f24');
  const matN = trackMaterial(new THREE.MeshStandardMaterial({ map: texN, roughness: 0.6 }));
  const matS = trackMaterial(new THREE.MeshStandardMaterial({ map: texS, roughness: 0.6 }));

  // --- geometries --------------------------------------------------------------
  const shaftGeo = trackGeometry(new THREE.CylinderGeometry(0.04, 0.04, 1, 12));
  shaftGeo.translate(0, 0.5, 0); // base at origin, along +y
  const headGeo = trackGeometry(new THREE.ConeGeometry(0.1, 0.22, 16));
  headGeo.translate(0, 0.11, 0);
  const markGeo = trackGeometry(new THREE.ConeGeometry(0.07, 0.18, 12));
  const halfGeo = trackGeometry(
    new THREE.BoxGeometry((MAGNET_LENGTH * SCALE) / 2, MAGNET_SIDE, MAGNET_SIDE),
  );
  let torusGeo = trackGeometry(new THREE.TorusGeometry(0.4, 0.035, 12, 64));
  const axisGeo = trackGeometry(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.4, 0, 0),
      new THREE.Vector3(3.6, 0, 0),
    ]),
  );

  // --- objects -----------------------------------------------------------------
  const axisLine = new THREE.Line(axisGeo, mat.axis);
  axisLine.computeLineDistances();
  scene.add(axisLine);

  const coil = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  for (let k = 0; k < COIL_RINGS; k++) {
    const ring = new THREE.Mesh(torusGeo, mat.coil);
    ring.rotation.y = Math.PI / 2; // torus normal → x axis
    ring.position.x = -COIL_LENGTH / 2 + (k * COIL_LENGTH) / (COIL_RINGS - 1);
    rings.push(ring);
    coil.add(ring);
  }
  scene.add(coil);

  const magnet = new THREE.Group();
  const nearHalf = new THREE.Mesh(halfGeo, matN);
  const farHalf = new THREE.Mesh(halfGeo, matS);
  const halfLen = (MAGNET_LENGTH * SCALE) / 2;
  nearHalf.position.x = -halfLen / 2;
  farHalf.position.x = halfLen / 2;
  magnet.add(nearHalf, farHalf);
  scene.add(magnet);

  const makeArrow = (material: THREE.Material): Arrow => {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, material);
    const head = new THREE.Mesh(headGeo, material);
    group.add(shaft, head);
    group.rotation.z = -Math.PI / 2; // +y → +x
    scene.add(group);
    const tip = new THREE.Vector3();
    return {
      group,
      set(originX, y, z, sign, length) {
        group.visible = sign !== 0 && length > 0;
        if (!group.visible) return;
        const shaftLen = Math.max(0.02, length - 0.22);
        shaft.scale.set(1, shaftLen, 1);
        head.position.y = shaftLen;
        group.position.set(originX, y, z);
        group.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
        tip.set(originX + sign * length, y, z);
      },
      tipWorld: () => tip,
    };
  };
  const arrowBMag = makeArrow(mat.bMag);
  const arrowBInd = makeArrow(mat.bInd);
  const arrowForce = makeArrow(mat.force);

  const marks = new THREE.InstancedMesh(markGeo, mat.current, CURRENT_MARKS);
  marks.frustumCulled = false;
  scene.add(marks);

  // --- theme -------------------------------------------------------------------
  const setTheme = (t: Theme): void => {
    const p = getPalette(t);
    renderer.setClearColor(new THREE.Color(p.surface), 1);
    mat.coil.color.set(t === 'dark' ? 0xb8a58c : 0x8c6f4e);
    mat.axis.color.set(p.borderStrong);
    mat.bMag.color.setHex(quantityColorHex('b', t));
    mat.bInd.color.setHex(quantityColorHex('b', t));
    mat.current.color.setHex(quantityColorHex('i', t));
    mat.force.color.setHex(quantityColorHex('f', t));
  };
  setTheme(theme);

  // --- picking -----------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const toNdc = (clientX: number, clientY: number): void => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };

  // --- per-frame state ---------------------------------------------------------
  let phase = 0;
  let coilRadius = 0.4; // scene units of the current torus
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const faceAnchor = new THREE.Vector3();
  const currentAnchor = new THREE.Vector3();
  /** "B indotto" label: below the coil on the side away from the magnet (QA-017). */
  const bIndAnchor = new THREE.Vector3();
  let width = 1;
  let height = 1;

  const project = (v: THREE.Vector3): ScreenPoint => {
    const p = v.clone().project(camera);
    return {
      x: ((p.x + 1) / 2) * width,
      y: ((1 - p.y) / 2) * height,
      visible: p.z < 1,
    };
  };

  return {
    canvas,
    setTheme,
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCamera();
    },
    render(f) {
      const r = f.a * SCALE;
      if (Math.abs(r - coilRadius) > 1e-9) {
        torusGeo.dispose();
        torusGeo = trackGeometry(new THREE.TorusGeometry(r, 0.035, 12, 64));
        for (const ring of rings) ring.geometry = torusGeo;
        coilRadius = r;
      }

      const mx = f.z * SCALE;
      magnet.position.set(mx, 0, 0);
      nearHalf.material = f.pole === 'N' ? matN : matS;
      farHalf.material = f.pole === 'N' ? matS : matN;

      // B arrows centred on the coil, just above / below the axis.
      const lenB = logLength(f.B, 1e-6, 2e-2, 0.3, 1.9);
      arrowBMag.set((-Math.sign(f.B) * lenB) / 2, 0.09, 0, Math.sign(f.B), lenB);
      const lenI = logLength(f.Bind, 1e-6, 2e-2, 0.3, 1.9);
      arrowBInd.set((-Math.sign(f.Bind) * lenI) / 2, -0.09, 0, Math.sign(f.Bind), lenI);

      // Force on the magnet: from its top, along ±x.
      const lenF = logLength(f.F, 1e-9, 1, 0.3, 1.5);
      arrowForce.set(mx, MAGNET_SIDE / 2 + 0.18, 0, Math.sign(f.F), lenF);

      // Current: arrowheads on the coil face toward the magnet, tangent to the ring.
      const ringR = r + 0.07;
      marks.visible = f.sign !== 0;
      if (marks.visible) {
        const speed = 0.6 + Math.min(4, Math.max(0, Math.log10(f.absI) + 6) * 0.6);
        phase = (phase + f.sign * speed * f.animDt) % (2 * Math.PI);
        for (let k = 0; k < CURRENT_MARKS; k++) {
          const th = (2 * Math.PI * k) / CURRENT_MARKS + phase;
          pos.set(COIL_LENGTH / 2 + 0.06, ringR * Math.cos(th), ringR * Math.sin(th));
          // CCW seen from +x ⇔ θ increasing ⇔ tangent (0, −sin θ, cos θ).
          tangent.set(0, -Math.sin(th) * f.sign, Math.cos(th) * f.sign);
          q.setFromUnitVectors(up, tangent);
          m4.compose(pos, q, one);
          marks.setMatrixAt(k, m4);
        }
        marks.instanceMatrix.needsUpdate = true;
      }
      faceAnchor.set(COIL_LENGTH / 2, r + 0.35, 0);
      currentAnchor.set(COIL_LENGTH / 2, -r - 0.3, 0);
      // The induced-field arrow is short and mostly hidden inside the rings, so its
      // tip would put the label on top of the coil: anchor it under the far face.
      bIndAnchor.set(-COIL_LENGTH / 2, -r - 0.12, 0);

      renderer.render(scene, camera);
    },
    hitMagnet(clientX, clientY) {
      toNdc(clientX, clientY);
      return raycaster.intersectObject(magnet, true).length > 0;
    },
    axisX(clientX, clientY) {
      toNdc(clientX, clientY);
      const p = raycaster.ray.intersectPlane(plane, hit);
      return p ? p.x / SCALE : null;
    },
    anchors() {
      return {
        bMag: project(arrowBMag.tipWorld()),
        bInd: project(bIndAnchor),
        current: project(currentAnchor),
        force: project(arrowForce.tipWorld()),
        face: project(faceAnchor),
      };
    },
    info() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    dispose() {
      marks.dispose();
      for (const g of [shaftGeo, headGeo, markGeo, halfGeo, torusGeo, axisGeo]) g.dispose();
      for (const m of [...Object.values(mat), matN, matS]) m.dispose();
      texN.dispose();
      texS.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      live.renderers -= 1;
      canvas.remove();
    },
  };
}
