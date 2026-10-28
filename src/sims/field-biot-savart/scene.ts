import * as THREE from 'three';
import type { Theme } from '../../core/types';
import type { Vec3 } from '../../physics';
import { getPalette, quantityColorHex } from '../../ui';
import type { CoilSetup } from './model';

/**
 * Three.js scene of `field-biot-savart`.
 *
 * Physics coordinates (coil axis = z) are mapped to the view by a group rotated
 * by +90° about the vertical axis, so the coil axis runs left → right and the
 * meridian plane x = 0 (where the lines are traced) faces the camera.
 *
 * Field lines are `THREE.Line` strips sharing one `ShaderMaterial`: per vertex a
 * flow coordinate `aPhase` (∫ds/v, v ∝ |B|) and a normalised log-strength `aMag`.
 * The fragment shader draws dashes `fract(aPhase·k − t)`, so the dashes run along
 * B with local speed ∝ |B| — the animation is done entirely on the GPU (one
 * uniform per frame). Colour: B blue (§4.5), brighter where |B| is larger.
 */

/** Live resource counters across all mounts (debug / leak check). */
export const sceneCounters = { renderers: 0, geometries: 0, materials: 0 };

export interface BiotScene {
  readonly canvas: HTMLCanvasElement;
  /** Rebuild coil, axis and ideal-solenoid region for a new geometry. */
  setCoil(setup: CoilSetup, R: number, l: number, N: number): void;
  /** Remove every field line. */
  clearLines(): void;
  /** Add one traced line (physics coordinates [m]). */
  addLine(points: Float32Array, magnitude: Float32Array, phase: Float32Array, bRef: number): void;
  /** Arrow glyphs (7 floats each: x, y, z, ux, uy, uz, |B|). */
  setArrows(data: Float32Array, count: number, bRef: number): void;
  setShowArrows(show: boolean): void;
  setShowIdeal(show: boolean): void;
  /** Draw; `time` [s] drives the dash flow. */
  render(time: number): void;
  setTheme(theme: Theme): void;
  info(): { geometries: number; textures: number; programs: number; lines: number };
  dispose(): void;
}

const VIEW_HALF = 4; // world units for the half length of the tracing box
const MAX_ARROWS = 17 * 9;

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aMag;
varying float vPhase;
varying float vMag;
void main() {
  vPhase = aPhase;
  vMag = aMag;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uAnimate;
uniform vec3 uColor;
uniform vec3 uGlow;
varying float vPhase;
varying float vMag;
void main() {
  float f = fract(vPhase * uScale - uTime);
  float dash = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.3, 0.45, f));
  float pulse = mix(0.85, 0.6 + 0.4 * dash, uAnimate);
  vec3 col = mix(uColor, uGlow, dash * uAnimate * 0.85);
  gl_FragColor = vec4(col, (0.5 + 0.5 * vMag) * pulse);
}`;

/** See rl-energy: MSAA only on hardware GL (SwiftShader is ~3× slower with it). */
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

class PolylineCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly pts: readonly Vec3[],
    private readonly s: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const n = this.pts.length - 1;
    const x = Math.min(n, Math.max(0, t * n));
    const i = Math.min(n - 1, Math.floor(x));
    const a = this.pts[i] as Vec3;
    const b = this.pts[i + 1] as Vec3;
    const u = x - i;
    return target.set(
      (a[0] + (b[0] - a[0]) * u) * this.s,
      (a[1] + (b[1] - a[1]) * u) * this.s,
      (a[2] + (b[2] - a[2]) * u) * this.s,
    );
  }
}

const glowOf = (theme: Theme): THREE.Color => {
  const base = new THREE.Color(quantityColorHex('b', theme));
  return theme === 'dark'
    ? base.lerp(new THREE.Color(0xffffff), 0.7)
    : base.lerp(new THREE.Color(0x000000), 0.45);
};

/** Normalised log strength in [0, 1]: 0,5 at |B| = B_ref, ±1 decade ↔ ±0,35. */
export function magLevel(B: number, bRef: number): number {
  if (!(B > 0) || !(bRef > 0)) return 0;
  return Math.min(1, Math.max(0, 0.5 + 0.35 * Math.log10(B / bRef)));
}

export function createBiotScene(
  container: HTMLElement,
  theme: Theme,
  reducedMotion: boolean,
): BiotScene {
  const renderer = new THREE.WebGLRenderer({ antialias: hardwareAntialias(), alpha: true });
  sceneCounters.renderers++;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const light = new THREE.DirectionalLight(0xffffff, 1.6);
  light.position.set(-3, 6, 8);
  scene.add(light);

  const world = new THREE.Group();
  // physics z → view x (left → right); physics y → view y; physics x → towards the viewer
  world.rotation.set(0, Math.PI / 2, 0);
  const tilt = new THREE.Group();
  tilt.rotation.set(0.32, -0.42, 0);
  tilt.add(world);
  scene.add(tilt);

  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if (x instanceof THREE.Material) sceneCounters.materials++;
    else sceneCounters.geometries++;
    return x;
  };
  const release = (x: THREE.BufferGeometry | THREE.Material): void => {
    x.dispose();
    if (x instanceof THREE.Material) sceneCounters.materials--;
    else sceneCounters.geometries--;
  };

  const pal0 = getPalette(theme);
  const copperMat = track(new THREE.MeshLambertMaterial({ color: 0xc8793a }));
  const currentMat = track(new THREE.MeshBasicMaterial({ color: quantityColorHex('i', theme) }));
  const axisMat = track(
    new THREE.LineDashedMaterial({ color: pal0.textMuted, dashSize: 0.15, gapSize: 0.12 }),
  );
  const idealMat = track(
    new THREE.MeshBasicMaterial({
      color: quantityColorHex('b', theme),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const arrowMat = track(
    new THREE.MeshBasicMaterial({
      color: quantityColorHex('b', theme),
      transparent: true,
      opacity: 0.75,
    }),
  );
  const lineMat = track(
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uAnimate: { value: reducedMotion ? 0 : 1 },
        uColor: { value: new THREE.Color(quantityColorHex('b', theme)) },
        uGlow: { value: glowOf(theme) },
      },
    }),
  );

  // Per-geometry objects (rebuilt by setCoil).
  const coilGroup = new THREE.Group();
  world.add(coilGroup);
  let coilGeos: THREE.BufferGeometry[] = [];
  const linesGroup = new THREE.Group();
  world.add(linesGroup);
  const lineGeos: THREE.BufferGeometry[] = [];

  const coneGeo = track(new THREE.ConeGeometry(0.05, 0.16, 10));
  coneGeo.translate(0, 0.02, 0);
  const coneGeoCurrent = track(new THREE.ConeGeometry(0.07, 0.22, 12));
  const arrows = new THREE.InstancedMesh(coneGeo, arrowMat, MAX_ARROWS);
  arrows.count = 0;
  arrows.visible = false;
  world.add(arrows);

  let scale = 1; // world units per metre
  let idealMesh: THREE.Mesh | null = null;
  let showIdeal = false;
  let fit = { halfW: VIEW_HALF, halfH: VIEW_HALF / 2 };

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(fit.halfW / (tanHalf * camera.aspect), fit.halfH / tanHalf) * 1.08;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  ro?.observe(container);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const dirV = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  function setCoil(setup: CoilSetup, R: number, l: number, N: number): void {
    coilGroup.clear();
    coilGeos.forEach(release);
    coilGeos = [];
    idealMesh = null;
    scale = VIEW_HALF / setup.zHalf;
    lineMat.uniforms['uScale']!.value = 1 / (0.55 / scale);
    fit = { halfW: VIEW_HALF + 0.3, halfH: setup.rhoHalf * scale + 0.3 };

    const sol = setup.geometry === 'solenoid';
    // Dense windings would hide the lines inside: draw the solenoid semi-transparent.
    copperMat.transparent = sol;
    copperMat.opacity = sol ? 0.45 : 1;
    copperMat.depthWrite = !sol;
    copperMat.needsUpdate = true;
    const pitch = sol ? (l / N) * scale : Infinity;
    const tubeR = sol
      ? Math.min(0.045, 0.3 * pitch)
      : Math.min(0.09, 0.04 * (1 + 0.25 * Math.log2(Math.max(1, N))));
    for (const path of setup.displayPaths) {
      const segs = Math.min(4000, (path.length - 1) * 2);
      const g = track(new THREE.TubeGeometry(new PolylineCurve(path, scale), segs, tubeR, 6, !sol));
      coilGeos.push(g);
      coilGroup.add(new THREE.Mesh(g, copperMat));
      // current direction: red cone on the top of the coil (physics +y), nearest to the
      // mid-plane z = 0, along the wire
      const n = path.length - 1;
      let k = 0;
      path.forEach((c, i) => {
        if (c[1] - Math.abs(c[2]) > (path[k] as Vec3)[1] - Math.abs((path[k] as Vec3)[2])) k = i;
      });
      const a = path[Math.max(0, k - 1)] as Vec3;
      const b = path[Math.min(n, k + 1)] as Vec3;
      const c = path[k] as Vec3;
      const cone = new THREE.Mesh(coneGeoCurrent, currentMat);
      cone.position.set(c[0] * scale, c[1] * scale + tubeR, c[2] * scale);
      cone.quaternion.setFromUnitVectors(
        up,
        dirV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(),
      );
      coilGroup.add(cone);
    }
    // axis
    const axisGeo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -VIEW_HALF),
        new THREE.Vector3(0, 0, VIEW_HALF),
      ]),
    );
    coilGeos.push(axisGeo);
    const axis = new THREE.Line(axisGeo, axisMat);
    axis.computeLineDistances();
    coilGroup.add(axis);
    // ideal solenoid region (uniform B inside, zero outside)
    if (sol) {
      const cyl = track(new THREE.CylinderGeometry(R * scale, R * scale, l * scale, 48, 1, true));
      cyl.rotateX(Math.PI / 2); // cylinder axis → physics z
      coilGeos.push(cyl);
      idealMesh = new THREE.Mesh(cyl, idealMat);
      idealMesh.visible = showIdeal;
      coilGroup.add(idealMesh);
    }
    resize();
  }

  function clearLines(): void {
    linesGroup.clear();
    lineGeos.splice(0).forEach(release);
  }

  function addLine(
    points: Float32Array,
    magnitude: Float32Array,
    phase: Float32Array,
    bRef: number,
  ): void {
    const n = magnitude.length;
    if (n < 2) return;
    const position = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      position[3 * i] = (points[3 * i] as number) * scale;
      position[3 * i + 1] = (points[3 * i + 1] as number) * scale;
      position[3 * i + 2] = (points[3 * i + 2] as number) * scale;
      mag[i] = magLevel(magnitude[i] as number, bRef);
      ph[i] = phase[i] as number;
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    lineGeos.push(g);
    linesGroup.add(new THREE.Line(g, lineMat));
  }

  function setArrows(data: Float32Array, count: number, bRef: number): void {
    const n = Math.min(count, MAX_ARROWS);
    for (let k = 0; k < n; k++) {
      const o = 7 * k;
      pos.set(
        (data[o] as number) * scale,
        (data[o + 1] as number) * scale,
        (data[o + 2] as number) * scale,
      );
      q.setFromUnitVectors(
        up,
        dirV.set(data[o + 3] as number, data[o + 4] as number, data[o + 5] as number),
      );
      const s = 0.45 + 1.1 * magLevel(data[o + 6] as number, bRef);
      m4.compose(pos, q, scl.set(s, s, s));
      arrows.setMatrixAt(k, m4);
    }
    arrows.count = n;
    arrows.instanceMatrix.needsUpdate = true;
  }

  resize();

  return {
    canvas: renderer.domElement,
    setCoil,
    clearLines,
    addLine,
    setArrows,
    setShowArrows(show) {
      arrows.visible = show;
    },
    setShowIdeal(show) {
      showIdeal = show;
      if (idealMesh) idealMesh.visible = show;
    },
    render(time) {
      lineMat.uniforms['uTime']!.value = time;
      renderer.render(scene, camera);
    },
    setTheme(next) {
      const p = getPalette(next);
      axisMat.color.set(p.textMuted);
      currentMat.color.setHex(quantityColorHex('i', next));
      idealMat.color.setHex(quantityColorHex('b', next));
      arrowMat.color.setHex(quantityColorHex('b', next));
      (lineMat.uniforms['uColor']!.value as THREE.Color).setHex(quantityColorHex('b', next));
      (lineMat.uniforms['uGlow']!.value as THREE.Color).copy(glowOf(next));
    },
    info() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        lines: linesGroup.children.length,
      };
    },
    dispose() {
      ro?.disconnect();
      clearLines();
      coilGroup.clear();
      coilGeos.splice(0).forEach(release);
      arrows.dispose();
      [coneGeo, coneGeoCurrent].forEach(release);
      [copperMat, currentMat, axisMat, idealMat, arrowMat, lineMat].forEach(release);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      sceneCounters.renderers--;
    },
  };
}
