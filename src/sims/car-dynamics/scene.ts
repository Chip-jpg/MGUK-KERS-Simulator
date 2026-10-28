/**
 * Three.js scene of the `car-dynamics` simulator: an abstract single-seater (boxes and
 * wedges, no logos) in a braking zone. The car stays at the origin and the track
 * scrolls, so any braking distance fits the view.
 *
 * Visual encoding:
 * - green arrows (force colour): aerodynamic drag, downforce on each axle, braking
 *   force of the tyres on each axle — one common scale, so lengths are comparable;
 * - discs glow (dark red → orange → yellow) with the friction-brake power of their axle;
 * - the MGU-K and the MGU-K → battery link glow purple (energy colour) with the
 *   electrical power stored; the battery gauge fills with the energy stored so far;
 * - track: accent line = braking point, light line = end of the braking zone, boards
 *   every 25 m.
 */
import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { getPalette, quantityColorHex } from '../../ui';

export interface CarSceneFrame {
  /** Distance travelled since the braking point [m]. */
  x: number;
  /** Total braking distance [m] (position of the end line). */
  distance: number;
  /** Forces [N]. */
  drag: number;
  downforceFront: number;
  downforceRear: number;
  fxFront: number;
  fxRear: number;
  /** Friction-brake power relative to its peak, 0 … 1. */
  brakeFrontLevel: number;
  brakeRearLevel: number;
  /** MGU-K electrical power relative to P_max, 0 … 1. */
  kersLevel: number;
  /** Battery gauge fill, 0 … 1. */
  batteryFill: number;
}

export interface SceneInfo {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
}

export interface CarScene {
  readonly canvas: HTMLCanvasElement;
  update(f: CarSceneFrame): void;
  render(): void;
  setTheme(theme: Theme): void;
  info(): SceneInfo;
  dispose(): void;
}

/** Arrow length per newton [m/N]: 1 m every 8 kN. */
export const ARROW_SCALE = 1 / 8000;
/** Longest arrow drawn [m]. */
export const ARROW_MAX = 4.5;

/** Arrow length for a force [m] (0 for no force, capped at {@link ARROW_MAX}). */
export function arrowLength(force: number): number {
  if (!(force > 0)) return 0;
  return Math.min(ARROW_MAX, force * ARROW_SCALE);
}

const BOARD_SPACING = 25; // [m]
const TRACK_LENGTH = 200; // [m] visible strip around the car
const BOARD_COUNT = TRACK_LENGTH / BOARD_SPACING + 1;
const HEAT_COLD = new THREE.Color(0x3a1a12);
const HEAT_MID = new THREE.Color(0xff4d12);
const HEAT_HOT = new THREE.Color(0xffd166);
const FRONT_X = 1.9;
const REAR_X = -1.75;

function heatColor(level: number, out: THREE.Color): THREE.Color {
  const h = Math.min(1, Math.max(0, level));
  return h < 0.5
    ? out.copy(HEAT_COLD).lerp(HEAT_MID, h * 2)
    : out.copy(HEAT_MID).lerp(HEAT_HOT, (h - 0.5) * 2);
}

export function createCarScene(container: HTMLElement, initialTheme: Theme): CarScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
  camera.position.set(-3, 4.2, 11.5);
  camera.lookAt(-1.8, 1.4, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => (geometries.push(g), g);
  const mat = <M extends THREE.Material>(m: M): M => (materials.push(m), m);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 10, 6);
  scene.add(ambient, sun);

  // Track strip, kerbs, distance boards, braking-point and end lines
  const groundMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(TRACK_LENGTH, 9)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const kerbMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  const kerbGeo = geo(new THREE.BoxGeometry(TRACK_LENGTH, 0.06, 0.3));
  for (const z of [-4.35, 4.35]) {
    const kerb = new THREE.Mesh(kerbGeo, kerbMat);
    kerb.position.set(0, 0.03, z);
    scene.add(kerb);
  }
  const boardMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const boards = new THREE.InstancedMesh(
    geo(new THREE.BoxGeometry(0.12, 1.1, 0.7)),
    boardMat,
    BOARD_COUNT,
  );
  scene.add(boards);
  const lineGeo = geo(new THREE.BoxGeometry(0.35, 0.02, 8.4));
  const startMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const endMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const startLine = new THREE.Mesh(lineGeo, startMat);
  const endLine = new THREE.Mesh(lineGeo, endMat);
  scene.add(startLine, endLine);

  const m4 = new THREE.Matrix4();
  /** Positions the track features for a car at distance `x` from the braking point. */
  const placeTrack = (x: number, distance: number): void => {
    const phase = ((x % BOARD_SPACING) + BOARD_SPACING) % BOARD_SPACING;
    for (let i = 0; i < BOARD_COUNT; i++) {
      const px = -TRACK_LENGTH / 2 + i * BOARD_SPACING - phase;
      m4.makeTranslation(px, 0.55, -4.0);
      boards.setMatrixAt(i, m4);
    }
    boards.instanceMatrix.needsUpdate = true;
    const half = TRACK_LENGTH / 2;
    // The car's front axle sits at FRONT_X: world distance d is at d − x + FRONT_X.
    const sx = -x + FRONT_X;
    const ex = distance - x + FRONT_X;
    startLine.position.set(sx, 0.011, 0);
    endLine.position.set(ex, 0.012, 0);
    startLine.visible = Math.abs(sx) < half;
    endLine.visible = Math.abs(ex) < half;
  };

  // Car (abstract single-seater, facing +x)
  const car = new THREE.Group();
  scene.add(car);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }));
  const darkMat = mat(new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.8 }));
  const add = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo(g), m);
    mesh.position.set(x, y, z);
    car.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(3.2, 0.42, 0.9), bodyMat, -0.2, 0.42, 0);
  const nose = add(new THREE.ConeGeometry(0.42, 1.9, 4), bodyMat, 2.3, 0.38, 0);
  nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
  nose.scale.set(1, 1, 0.55);
  add(new THREE.BoxGeometry(1.7, 0.36, 0.5), bodyMat, -0.5, 0.36, 0.68);
  add(new THREE.BoxGeometry(1.7, 0.36, 0.5), bodyMat, -0.5, 0.36, -0.68);
  add(new THREE.BoxGeometry(0.5, 0.06, 2.0), darkMat, 3.05, 0.14, 0);
  add(new THREE.BoxGeometry(0.45, 0.08, 1.5), darkMat, -2.15, 1.05, 0);
  add(new THREE.BoxGeometry(0.5, 0.75, 0.05), darkMat, -2.15, 0.72, 0.75);
  add(new THREE.BoxGeometry(0.5, 0.75, 0.05), darkMat, -2.15, 0.72, -0.75);
  add(new THREE.BoxGeometry(0.7, 0.3, 0.55), darkMat, 0.35, 0.72, 0);
  add(new THREE.BoxGeometry(0.8, 0.45, 0.45), bodyMat, -1.0, 0.8, 0);

  const wheelGeo = geo(new THREE.CylinderGeometry(0.36, 0.36, 0.36, 28));
  const discGeo = geo(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28));
  const discFrontMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, emissiveIntensity: 1 }),
  );
  const discRearMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, emissiveIntensity: 1 }),
  );
  for (const [x, z] of [
    [FRONT_X, 0.95],
    [FRONT_X, -0.95],
    [REAR_X, 0.95],
    [REAR_X, -0.95],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    car.add(wheel);
    const disc = new THREE.Mesh(discGeo, x > 0 ? discFrontMat : discRearMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, 0.36, z + Math.sign(z) * 0.2);
    car.add(disc);
  }

  // MGU-K (rear) and its link to the battery gauge
  const mgukMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 1 }));
  const mguk = add(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 24), mgukMat, -1.25, 1.12, 0);
  mguk.rotation.x = Math.PI / 2;
  const linkMat = mat(new THREE.MeshBasicMaterial({ transparent: true }));
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 10), linkMat, -1.25, 1.75, 0);

  const battery = new THREE.Group();
  battery.position.set(-1.25, 2.55, 0);
  car.add(battery);
  const BAT_W = 2.2;
  const frameMat = mat(new THREE.LineBasicMaterial());
  const frame = new THREE.LineSegments(
    geo(new THREE.EdgesGeometry(geo(new THREE.BoxGeometry(BAT_W, 0.5, 0.5)))),
    frameMat,
  );
  battery.add(frame);
  const fillMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.5, emissiveIntensity: 0.6 }));
  const fill = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 0.44, 0.44)), fillMat);
  battery.add(fill);
  const capMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  const cap = new THREE.Mesh(geo(new THREE.BoxGeometry(0.1, 0.22, 0.22)), capMat);
  cap.position.set(BAT_W / 2 + 0.06, 0, 0);
  battery.add(cap);

  // Force arrows (shared geometry, one green material)
  const forceMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.35 }));
  const shaftGeo = geo(new THREE.CylinderGeometry(0.055, 0.055, 1, 12));
  shaftGeo.translate(0, 0.5, 0); // base at the origin, along +y
  const headGeo = geo(new THREE.ConeGeometry(0.15, 0.32, 16));
  headGeo.translate(0, 0.16, 0);
  const HEAD = 0.32;
  interface Arrow {
    group: THREE.Group;
    shaft: THREE.Mesh;
    head: THREE.Mesh;
  }
  const up = new THREE.Vector3(0, 1, 0);
  const makeArrow = (origin: THREE.Vector3, dir: THREE.Vector3): Arrow => {
    const group = new THREE.Group();
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    const shaft = new THREE.Mesh(shaftGeo, forceMat);
    const head = new THREE.Mesh(headGeo, forceMat);
    group.add(shaft, head);
    car.add(group);
    return { group, shaft, head };
  };
  const setArrow = (a: Arrow, length: number): void => {
    a.group.visible = length > 0.02;
    const head = Math.min(HEAD, length * 0.5);
    a.shaft.scale.set(1, Math.max(1e-3, length - head), 1);
    a.head.scale.setScalar(Math.max(0.2, head / HEAD));
    a.head.position.y = length - head;
  };
  const back = new THREE.Vector3(-1, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const arrows = {
    drag: makeArrow(new THREE.Vector3(-2.45, 1.05, 0), back),
    tyreFront: makeArrow(new THREE.Vector3(FRONT_X, 0.08, 1.3), back),
    tyreRear: makeArrow(new THREE.Vector3(REAR_X, 0.08, 1.3), back),
    // Downforce arrows: the group is re-positioned so that the tip touches the car.
    downFront: makeArrow(new THREE.Vector3(2.6, 1.2, 0), down),
    downRear: makeArrow(new THREE.Vector3(-2.15, 2.1, 0), down),
  };
  const downTips = { downFront: 0.2, downRear: 1.1 };

  const tmp = new THREE.Color();
  let energyHex = 0;
  let current: CarSceneFrame = {
    x: 0,
    distance: 0,
    drag: 0,
    downforceFront: 0,
    downforceRear: 0,
    fxFront: 0,
    fxRear: 0,
    brakeFrontLevel: 0,
    brakeRearLevel: 0,
    kersLevel: 0,
    batteryFill: 0,
  };

  function applyFrame(f: CarSceneFrame): void {
    placeTrack(f.x, f.distance);
    for (const [m, level] of [
      [discFrontMat, f.brakeFrontLevel],
      [discRearMat, f.brakeRearLevel],
    ] as const) {
      const b = Math.min(1, Math.max(0, level));
      m.emissive.copy(heatColor(b, tmp));
      m.emissiveIntensity = 0.15 + 1.6 * b;
    }
    const kers = Math.min(1, Math.max(0, f.kersLevel));
    mgukMat.emissive.setHex(energyHex);
    mgukMat.emissiveIntensity = 0.1 + 1.4 * kers;
    linkMat.opacity = 0.15 + 0.85 * kers;
    const bf = Math.min(1, Math.max(0, f.batteryFill));
    const w = Math.max(0.001, (BAT_W - 0.06) * bf);
    fill.scale.set(w, 1, 1);
    fill.position.x = -(BAT_W - 0.06) / 2 + w / 2;
    fill.visible = bf > 0;

    setArrow(arrows.drag, arrowLength(f.drag));
    setArrow(arrows.tyreFront, arrowLength(f.fxFront));
    setArrow(arrows.tyreRear, arrowLength(f.fxRear));
    for (const key of ['downFront', 'downRear'] as const) {
      const len = arrowLength(key === 'downFront' ? f.downforceFront : f.downforceRear);
      setArrow(arrows[key], len);
      arrows[key].group.position.y = downTips[key] + len;
    }
  }

  function setTheme(theme: Theme): void {
    const p = getPalette(theme);
    energyHex = quantityColorHex('energy', theme);
    renderer.setClearColor(new THREE.Color(p.surface), 1);
    groundMat.color.set(theme === 'dark' ? 0x2a2f36 : 0xc9cfd6);
    kerbMat.color.set(p.borderStrong);
    boardMat.color.set(p.text);
    startMat.color.set(p.accent);
    endMat.color.set(p.text);
    bodyMat.color.set(p.neutral);
    mgukMat.color.setHex(energyHex);
    linkMat.color.setHex(energyHex);
    fillMat.color.setHex(energyHex);
    fillMat.emissive.setHex(energyHex);
    frameMat.color.set(p.text);
    capMat.color.set(p.text);
    const force = quantityColorHex('f', theme);
    forceMat.color.setHex(force);
    forceMat.emissive.setHex(force);
    ambient.intensity = theme === 'dark' ? 1.1 : 1.4;
    applyFrame(current);
  }
  setTheme(initialTheme);

  let width = 0;
  let height = 0;
  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.3 ? 54 : 40;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  ro?.observe(container);

  let disposed = false;
  return {
    canvas,
    update(f) {
      current = f;
      applyFrame(f);
    },
    render() {
      if (disposed) return;
      resize();
      renderer.render(scene, camera);
    },
    setTheme,
    info() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        calls: renderer.info.render.calls,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ro?.disconnect();
      boards.dispose();
      geometries.splice(0).forEach((g) => g.dispose());
      materials.splice(0).forEach((m) => m.dispose());
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
