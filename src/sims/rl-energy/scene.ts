import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { formatIT, getPalette, quantityColorHex } from '../../ui';

/**
 * Abstract RL circuit (slides 12–17): generator, switch, resistor and a
 * solenoid whose B field lines (blue) grow with i; red dots = current (they
 * drift by ∫i dt), amber arrow = self-induced emf −L di/dt opposing the change.
 */

/** Live resource counters across all mounts (debug / leak check). */
export const sceneCounters = { renderers: 0, geometries: 0, materials: 0 };

export interface RlSceneState {
  closed: boolean;
  /** Current [A]. */
  i: number;
  /** Steady-state current I₀ [A]. */
  I0: number;
  /** Charge moved so far ∫i dt [C]. */
  q: number;
  /** Time constant τ [s]. */
  tau: number;
  /** Self-induced emf −L di/dt [V]. */
  emfSelf: number;
  E: number;
  R: number;
  L: number;
}

export interface RlScene {
  readonly canvas: HTMLCanvasElement;
  render(s: RlSceneState): void;
  setTheme(theme: Theme): void;
  info(): { geometries: number; textures: number; objects: number; antialias: boolean };
  dispose(): void;
}

const WORLD_W = 17;
const WORLD_H = 9.5;
const DOTS = 40;

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly cx: number,
    private readonly y0: number,
    private readonly y1: number,
    private readonly r: number,
    private readonly turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = 2 * Math.PI * this.turns * t;
    return target.set(
      this.cx + this.r * Math.sin(a),
      this.y1 + (this.y0 - this.y1) * t,
      this.r * Math.cos(a),
    );
  }
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

export function createRlScene(container: HTMLElement, overlay: HTMLElement, theme: Theme): RlScene {
  const renderer = new THREE.WebGLRenderer({ antialias: hardwareAntialias(), alpha: true });
  sceneCounters.renderers++;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8.5, 8.5, 4.75, -4.75, 0.1, 100);
  camera.position.set(0.6, 1.5, 30);
  camera.lookAt(0.6, 0, 0);

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
  const light = new THREE.DirectionalLight(0xffffff, 1.4);
  light.position.set(-4, 6, 10);
  scene.add(light);

  const pal = getPalette(theme);
  const wireMat = mat(new THREE.MeshBasicMaterial({ color: pal.textMuted }));
  const neutralMat = mat(new THREE.MeshLambertMaterial({ color: pal.neutral }));
  const copperMat = mat(new THREE.MeshLambertMaterial({ color: 0xc8793a }));
  const emfMat = mat(new THREE.MeshLambertMaterial({ color: quantityColorHex('emf', theme) }));
  const emfArrowMat = mat(
    new THREE.MeshBasicMaterial({ color: quantityColorHex('emf', theme), transparent: true }),
  );
  const dotMat = mat(
    new THREE.MeshBasicMaterial({ color: quantityColorHex('i', theme), transparent: true }),
  );
  const fieldLineMat = mat(
    new THREE.LineBasicMaterial({ color: quantityColorHex('b', theme), transparent: true }),
  );
  const fieldArrowMat = mat(
    new THREE.MeshBasicMaterial({ color: quantityColorHex('b', theme), transparent: true }),
  );

  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  const addBox = (m: THREE.Material, x: number, y: number, sx: number, sy: number, sz = 0.12) => {
    const mesh = new THREE.Mesh(box, m);
    mesh.position.set(x, y, 0);
    mesh.scale.set(sx, sy, sz);
    scene.add(mesh);
    return mesh;
  };
  const wire = (x0: number, y0: number, x1: number, y1: number): void => {
    addBox(
      wireMat,
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      Math.abs(x1 - x0) + 0.12,
      Math.abs(y1 - y0) + 0.12,
    );
  };

  // Wires (gaps for battery, switch, resistor, coil).
  wire(-6, 0.5, -6, 3);
  wire(-6, -3, -6, -0.5);
  wire(-6, 3, -3.6, 3);
  wire(-2.4, 3, 1, 3);
  wire(3, 3, 6, 3);
  wire(6, 3, 6, 2.2);
  wire(6, -2.2, 6, -3);
  wire(6, -3, -6, -3);

  // Generator: long (+) and short (−) plates.
  addBox(emfMat, -6, 0.3, 1.4, 0.12, 0.3);
  addBox(emfMat, -6, -0.3, 0.7, 0.28, 0.3);
  wire(-6, 0.3, -6, 0.5);
  wire(-6, -0.5, -6, -0.3);

  // Switch: pivot + lever (rotates open/closed).
  const sphereGeo = geo(new THREE.SphereGeometry(0.14, 12, 10));
  for (const x of [-3.6, -2.4]) {
    const c = new THREE.Mesh(sphereGeo, neutralMat);
    c.position.set(x, 3, 0.1);
    scene.add(c);
  }
  const lever = new THREE.Group();
  lever.position.set(-3.6, 3, 0.15);
  const leverBar = new THREE.Mesh(box, neutralMat);
  leverBar.scale.set(1.25, 0.1, 0.1);
  leverBar.position.x = 0.62;
  lever.add(leverBar);
  scene.add(lever);

  // Resistor: zig-zag tube.
  const zig = new THREE.CurvePath<THREE.Vector3>();
  const zpts: THREE.Vector3[] = [new THREE.Vector3(1, 3, 0)];
  for (let k = 1; k <= 8; k++)
    zpts.push(new THREE.Vector3(1 + (2 * k) / 9, 3 + (k % 2 ? 0.35 : -0.35), 0));
  zpts.push(new THREE.Vector3(3, 3, 0));
  for (let k = 0; k + 1 < zpts.length; k++)
    zig.add(new THREE.LineCurve3(zpts[k] as THREE.Vector3, zpts[k + 1] as THREE.Vector3));
  scene.add(new THREE.Mesh(geo(new THREE.TubeGeometry(zig, 64, 0.07, 6, false)), neutralMat));

  // Solenoid.
  const helix = new Helix(6, -2.2, 2.2, 0.75, 11);
  scene.add(new THREE.Mesh(geo(new THREE.TubeGeometry(helix, 500, 0.06, 6, false)), copperMat));

  // B field: lines inside the coil and closed loops outside (schematic).
  const fieldGroup = new THREE.Group();
  for (const x of [-0.35, 0, 0.35]) {
    const g = geo(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(6 + x, -2.7, 0),
        new THREE.Vector3(6 + x, 2.7, 0),
      ]),
    );
    fieldGroup.add(new THREE.Line(g, fieldLineMat));
  }
  for (const [a, b] of [
    [1.3, 3.0],
    [2.0, 3.4],
  ] as const) {
    const curve = new THREE.EllipseCurve(6, 0, a, b, 0, 2 * Math.PI, false, 0);
    const g = geo(new THREE.BufferGeometry().setFromPoints(curve.getPoints(96)));
    fieldGroup.add(new THREE.LineLoop(g, fieldLineMat));
  }
  scene.add(fieldGroup);
  const coneGeo = geo(new THREE.ConeGeometry(0.16, 0.4, 12));
  const fieldArrows = new THREE.InstancedMesh(coneGeo, fieldArrowMat, 6);
  const arrowAt: Array<[number, number, number]> = [
    [6, 0, 0], // inside, pointing down (current enters the coil from the top)
    [6, 1.6, 0],
    [6, -1.6, 0],
    [6 - 2.0, 0, 1], // outside return (up)
    [6 + 2.0, 0, 1],
    [6 + 1.3, 0, 1],
  ];
  scene.add(fieldArrows);

  // Self-induced emf arrow (amber), beside the coil.
  const emfArrow = new THREE.Group();
  const shaftGeo = geo(new THREE.CylinderGeometry(0.07, 0.07, 1, 10));
  const shaft = new THREE.Mesh(shaftGeo, emfArrowMat);
  const head = new THREE.Mesh(coneGeo, emfArrowMat);
  emfArrow.add(shaft, head);
  emfArrow.position.set(7.35, 0, 0.3);
  scene.add(emfArrow);

  // Current dots along the loop (clockwise: + plate → up → right → down → left).
  const path = [
    new THREE.Vector3(-6, 0.5, 0.3),
    new THREE.Vector3(-6, 3, 0.3),
    new THREE.Vector3(6, 3, 0.3),
    new THREE.Vector3(6, -3, 0.3),
    new THREE.Vector3(-6, -3, 0.3),
    new THREE.Vector3(-6, -0.5, 0.3),
  ];
  const cum: number[] = [0];
  for (let k = 1; k < path.length; k++)
    cum.push(
      (cum[k - 1] ?? 0) + (path[k] as THREE.Vector3).distanceTo(path[k - 1] as THREE.Vector3),
    );
  const total = cum[cum.length - 1] ?? 1;
  const dotGeo = geo(new THREE.SphereGeometry(0.12, 10, 8));
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, DOTS);
  scene.add(dots);

  // Labels.
  const labels: Array<{ node: HTMLElement; at: THREE.Vector3 }> = [];
  const label = (x: number, y: number, cls = ''): HTMLElement => {
    const node = document.createElement('div');
    node.className = `rl-label ${cls}`;
    overlay.append(node);
    labels.push({ node, at: new THREE.Vector3(x, y, 0) });
    return node;
  };
  const lGen = label(-6, -0.9, 'rl-label--emf');
  const lSwitch = label(-3, 3.9);
  const lRes = label(2, 3.9);
  const lCoil = label(6, -3.6);
  const lEmf = label(7.4, 3.5, 'rl-label--emf');
  const lB = label(4.1, 2.3, 'rl-label--b');
  lB.textContent = 'B';

  const setText = (node: HTMLElement, text: string): boolean => {
    if (node.textContent === text) return false;
    node.textContent = text;
    return true;
  };
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

  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  const scl = new THREE.Vector3(1, 1, 1);
  const pointAt = (d: number): THREE.Vector3 => {
    let k = 1;
    while (k < cum.length - 1 && (cum[k] ?? 0) < d) k++;
    const l0 = cum[k - 1] ?? 0;
    const seg = (cum[k] ?? 0) - l0 || 1;
    return v3.copy(path[k - 1] as THREE.Vector3).lerp(path[k] as THREE.Vector3, (d - l0) / seg);
  };

  const render = (s: RlSceneState): void => {
    const r = s.I0 > 0 ? Math.min(1, Math.abs(s.i) / s.I0) : 0;
    lever.rotation.z = s.closed ? 0 : 0.55;

    // Dots drift by q/(I₀τ): one "unit" per τ at steady state.
    const drift = s.I0 > 0 && s.tau > 0 ? (3 * s.q) / (s.I0 * s.tau) : 0;
    for (let j = 0; j < DOTS; j++) {
      const d = ((((j / DOTS) * total + drift) % total) + total) % total;
      m4.makeTranslation(pointAt(d));
      dots.setMatrixAt(j, m4);
    }
    dots.instanceMatrix.needsUpdate = true;
    dotMat.opacity = 0.2 + 0.8 * r;

    fieldLineMat.opacity = 0.08 + 0.92 * r;
    fieldArrowMat.opacity = r > 0.01 ? 0.3 + 0.7 * r : 0;
    arrowAt.forEach(([x, y, up], k) => {
      m4.compose(v3.set(x, y, 0.2), up ? q.identity() : down, scl.setScalar(0.4 + 0.8 * r));
      fieldArrows.setMatrixAt(k, m4);
    });
    fieldArrows.instanceMatrix.needsUpdate = true;

    // Self-induced emf: points up (against the downward current in the coil) while i grows.
    const e = s.E > 0 ? Math.min(1, Math.abs(s.emfSelf) / s.E) : 0;
    emfArrow.visible = e > 0.01;
    const len = 0.4 + 3.2 * e;
    shaft.scale.set(1, len, 1);
    head.position.y = len / 2 + 0.2;
    // emfSelf = −L di/dt < 0 while i grows: the induced emf opposes the
    // generator, i.e. it acts upwards in the coil (against the current).
    emfArrow.rotation.z = s.emfSelf <= 0 ? 0 : Math.PI;

    let changed = false;
    changed = setText(lGen, `Generatore E = ${formatIT(s.E, 1, 'V')}`) || changed;
    changed = setText(lSwitch, s.closed ? 'Interruttore chiuso' : 'Interruttore aperto') || changed;
    changed = setText(lRes, `R = ${formatIT(s.R, 1, 'Ω')}`) || changed;
    changed =
      setText(
        lCoil,
        `L = ${formatIT(s.L, s.L < 0.1 ? 4 : 2, 'H')} · i = ${formatIT(s.i, 3, 'A')}`,
      ) || changed;
    changed = setText(lEmf, `−L di/dt = ${formatIT(s.emfSelf, 2, 'V')}`) || changed;
    if (changed) placeLabels();
    renderer.render(scene, camera);
  };

  resize();

  return {
    canvas: renderer.domElement,
    render,
    setTheme(next) {
      const p = getPalette(next);
      wireMat.color.set(p.textMuted);
      neutralMat.color.set(p.neutral);
      emfMat.color.setHex(quantityColorHex('emf', next));
      emfArrowMat.color.setHex(quantityColorHex('emf', next));
      dotMat.color.setHex(quantityColorHex('i', next));
      fieldLineMat.color.setHex(quantityColorHex('b', next));
      fieldArrowMat.color.setHex(quantityColorHex('b', next));
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
      dots.dispose();
      fieldArrows.dispose();
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
