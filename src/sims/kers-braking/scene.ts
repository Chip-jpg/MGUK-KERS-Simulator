/**
 * Three.js scene of the `kers-braking` simulator: an abstract single-seater
 * (boxes and wedges, no logos) braking on a track strip. The car stays at the
 * origin and the track markers scroll, so any braking distance fits the view.
 *
 * Visual encoding:
 * - disc brakes glow (dark red → orange → yellow) with the power they dissipate;
 * - the MGU-K and the MGU-K → battery link glow purple (energy colour) with the
 *   electrical power stored;
 * - the battery gauge above the car fills with the energy stored so far.
 */
import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { getPalette, quantityColorHex } from '../../ui';

export interface SceneFrame {
  /** Distance travelled since the start of the event [m] (scrolls the track). */
  x: number;
  /** MGU-K electrical power relative to its cap, 0 … 1. */
  kersLevel: number;
  /** Disc-brake power relative to the peak braking power, 0 … 1. */
  brakeLevel: number;
  /** Battery gauge fill, 0 … 1. */
  batteryFill: number;
}

export interface SceneInfo {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
}

export interface KersScene {
  readonly canvas: HTMLCanvasElement;
  update(f: SceneFrame): void;
  render(): void;
  setTheme(theme: Theme): void;
  info(): SceneInfo;
  dispose(): void;
}

const MARKER_SPACING = 6; // [m]
const MARKER_COUNT = 24;
const TRACK_LENGTH = MARKER_SPACING * MARKER_COUNT;
const HEAT_COLD = new THREE.Color(0x3a1a12);
const HEAT_MID = new THREE.Color(0xff4d12);
const HEAT_HOT = new THREE.Color(0xffd166);

/** Disc colour for a heat level 0 … 1 (dark red → orange → yellow). */
function heatColor(level: number, out: THREE.Color): THREE.Color {
  const h = Math.min(1, Math.max(0, level));
  return h < 0.5
    ? out.copy(HEAT_COLD).lerp(HEAT_MID, h * 2)
    : out.copy(HEAT_MID).lerp(HEAT_HOT, (h - 0.5) * 2);
}

export function createKersScene(container: HTMLElement, initialTheme: Theme): KersScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 400);
  camera.position.set(-6.5, 4.2, 8.5);
  camera.lookAt(0.6, 0.6, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => (geometries.push(g), g);
  const mat = <M extends THREE.Material>(m: M): M => (materials.push(m), m);

  // Lights
  const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 10, 6);
  scene.add(ambient, sun);

  // Track strip + kerbs + scrolling markers
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

  const markerMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const markers = new THREE.InstancedMesh(
    geo(new THREE.BoxGeometry(2.2, 0.02, 0.18)),
    markerMat,
    MARKER_COUNT * 2,
  );
  scene.add(markers);
  const m4 = new THREE.Matrix4();
  const placeMarkers = (x: number): void => {
    const phase = ((x % MARKER_SPACING) + MARKER_SPACING) % MARKER_SPACING;
    let k = 0;
    for (let i = 0; i < MARKER_COUNT; i++) {
      const px = -TRACK_LENGTH / 2 + i * MARKER_SPACING - phase + MARKER_SPACING;
      for (const z of [-2.6, 2.6]) {
        m4.makeTranslation(px, 0.011, z);
        markers.setMatrixAt(k++, m4);
      }
    }
    markers.instanceMatrix.needsUpdate = true;
  };
  placeMarkers(0);

  // Car (abstract single-seater, facing +x)
  const car = new THREE.Group();
  scene.add(car);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }));
  const darkMat = mat(new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.8 }));
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo(g), m);
    mesh.position.set(x, y, z);
    car.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(3.2, 0.42, 0.9), bodyMat, -0.2, 0.42, 0); // monocoque
  const nose = add(new THREE.ConeGeometry(0.42, 1.9, 4), bodyMat, 2.3, 0.38, 0);
  nose.rotation.set(Math.PI / 4, 0, -Math.PI / 2);
  nose.scale.set(1, 1, 0.55);
  add(new THREE.BoxGeometry(1.7, 0.36, 0.5), bodyMat, -0.5, 0.36, 0.68); // sidepods
  add(new THREE.BoxGeometry(1.7, 0.36, 0.5), bodyMat, -0.5, 0.36, -0.68);
  add(new THREE.BoxGeometry(0.5, 0.06, 2.0), darkMat, 3.05, 0.14, 0); // front wing
  add(new THREE.BoxGeometry(0.45, 0.08, 1.5), darkMat, -2.15, 1.05, 0); // rear wing
  add(new THREE.BoxGeometry(0.5, 0.75, 0.05), darkMat, -2.15, 0.72, 0.75);
  add(new THREE.BoxGeometry(0.5, 0.75, 0.05), darkMat, -2.15, 0.72, -0.75);
  add(new THREE.BoxGeometry(0.7, 0.3, 0.55), darkMat, 0.35, 0.72, 0); // cockpit
  add(new THREE.BoxGeometry(0.8, 0.45, 0.45), bodyMat, -1.0, 0.8, 0); // engine cover

  const wheelGeo = geo(new THREE.CylinderGeometry(0.36, 0.36, 0.36, 28));
  const discGeo = geo(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28));
  const discMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, emissiveIntensity: 1 }),
  );
  for (const [x, z] of [
    [1.9, 0.95],
    [1.9, -0.95],
    [-1.75, 0.95],
    [-1.75, -0.95],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    car.add(wheel);
    // Disc on the outer face of the wheel, so it is visible from the camera side.
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, 0.36, z + Math.sign(z) * 0.2);
    car.add(disc);
  }

  // MGU-K (cylinder in the rear of the car) and link to the battery gauge
  const mgukMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 1 }));
  const mguk = add(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 24), mgukMat, -1.25, 1.12, 0);
  mguk.rotation.x = Math.PI / 2;

  const linkMat = mat(new THREE.MeshBasicMaterial({ transparent: true }));
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 10), linkMat, -1.25, 1.75, 0);

  // Battery gauge floating above the car: frame + fill
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

  const tmp = new THREE.Color();
  let energyHex = 0;
  let current: SceneFrame = { x: 0, kersLevel: 0, brakeLevel: 0, batteryFill: 0 };

  function applyFrame(f: SceneFrame): void {
    placeMarkers(f.x);
    const brake = Math.min(1, Math.max(0, f.brakeLevel));
    discMat.emissive.copy(heatColor(brake, tmp));
    discMat.emissiveIntensity = 0.15 + 1.6 * brake;
    const kers = Math.min(1, Math.max(0, f.kersLevel));
    mgukMat.emissive.setHex(energyHex);
    mgukMat.emissiveIntensity = 0.1 + 1.4 * kers;
    linkMat.opacity = 0.15 + 0.85 * kers;
    const b = Math.min(1, Math.max(0, f.batteryFill));
    const w = Math.max(0.001, (BAT_W - 0.06) * b);
    fill.scale.set(w, 1, 1);
    fill.position.x = -(BAT_W - 0.06) / 2 + w / 2;
    fill.visible = b > 0;
  }

  function setTheme(theme: Theme): void {
    const p = getPalette(theme);
    energyHex = quantityColorHex('energy', theme);
    renderer.setClearColor(new THREE.Color(p.surface), 1);
    groundMat.color.set(theme === 'dark' ? 0x2a2f36 : 0xc9cfd6);
    kerbMat.color.set(p.borderStrong);
    markerMat.color.set(p.text);
    bodyMat.color.set(p.accent);
    mgukMat.color.setHex(energyHex);
    linkMat.color.setHex(energyHex);
    fillMat.color.setHex(energyHex);
    fillMat.emissive.setHex(energyHex);
    frameMat.color.set(p.text);
    capMat.color.set(p.text);
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
    // Keep the whole car in view on narrow scenes.
    camera.fov = w / h < 1.3 ? 50 : 38;
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
      markers.dispose();
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
