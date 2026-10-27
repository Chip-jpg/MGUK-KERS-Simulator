/**
 * Three.js scene of the `faraday` simulator: two permanent-magnet poles with the
 * uniform field drawn as instanced arrows, the rotating N-turn loop (or the bar
 * sliding on rails) and the "projected area" S·|cos α| seen by the field.
 *
 * Geometry is abstract and original (no external assets). Visual sizes are
 * proportional to the physical ones (loop side ∝ √S, bar length ∝ l) but the
 * scene is not to scale with the magnets.
 */
import * as THREE from 'three';
import type { Theme } from '../../core/types';
import { getPalette, quantityColorHex } from '../../ui';
import { params, X_MAX, X_MIN, type FaradayMode, type FaradayParams } from './model';

/** Live resource counters across all mounts (read by the e2e leak check). */
export const sceneStats = {
  liveScenes: 0,
  liveRenderers: 0,
  liveGeometries: 0,
  liveMaterials: 0,
  createdScenes: 0,
  frames: 0,
};

export interface SceneState {
  mode: FaradayMode;
  p: FaradayParams;
  /** Loop angle α between n̂ and B [rad]. */
  alpha: number;
  /** emf / peak (−1…1), drives the amber glow of the conductor. */
  emfRatio: number;
  /** Motional: bar position x [m] and velocity sign. */
  x: number;
  dir: number;
}

export interface FaradayScene {
  readonly canvas: HTMLCanvasElement;
  render(state: SceneState): void;
  setTheme(theme: Theme): void;
  /** `renderer.info.memory` of this scene. */
  memory(): { geometries: number; textures: number };
  dispose(): void;
}

/** Scene units: field region x ∈ [−2.2, 2.2] between the pole faces. */
const POLE_X = 3.3;
const POLE_HALF = 0.4;
const LOOP_SIDE_MAX = 2.2;
const RAIL_Z0 = -1.6;
const RAIL_LEN = 3.2;
const BAR_SCALE = 2.4; // scene units per metre of l
const WIRE = 0.05;
const MAX_VISUAL_TURNS = 6;

/** Visual side of the loop for an area S [m²] (∝ √S). */
export function loopSide(S: number): number {
  return Math.max(0.3, (LOOP_SIDE_MAX * Math.sqrt(S)) / Math.sqrt(params.S.max));
}

/** Turns drawn for N turns (a bundle, at most {@link MAX_VISUAL_TURNS}). */
export function visualTurns(N: number): number {
  return Math.min(MAX_VISUAL_TURNS, Math.max(1, Math.ceil(Math.log2(N + 1))));
}

export function createFaradayScene(
  container: HTMLElement,
  overlay: HTMLElement,
  theme: Theme,
): FaradayScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  sceneStats.liveRenderers++;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Scena 3D: due poli magnetici con il campo B uniforme, la spira che ruota (o la sbarretta sui binari) e l’area proiettata attraversata dal flusso.',
  );
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(-5.0, 5.2, 8.8);
  camera.lookAt(0.6, -0.5, 0);

  // --- resource tracking -------------------------------------------------------
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    sceneStats.liveGeometries++;
    return g;
  };
  const mat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    sceneStats.liveMaterials++;
    return m;
  };

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 5);
  scene.add(sun);

  // --- magnets ------------------------------------------------------------------
  const poleGeo = geo(new THREE.BoxGeometry(POLE_HALF * 2, 2.8, 3.8));
  const northMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }));
  const southMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }));
  const north = new THREE.Mesh(poleGeo, northMat);
  north.position.x = -POLE_X;
  const south = new THREE.Mesh(poleGeo, southMat);
  south.position.x = POLE_X;
  scene.add(north, south);

  // --- field arrows (InstancedMesh) ---------------------------------------------
  const ARROW_X = [-2.2, 1.9];
  const ARROW_Y = [-1.0, -0.5, 0, 0.5, 1.0];
  const ARROW_Z = [-1.5, -0.75, 0, 0.75, 1.5];
  const arrowCount = ARROW_X.length * ARROW_Y.length * ARROW_Z.length;
  const shaftGeo = geo(new THREE.CylinderGeometry(0.018, 0.018, 1, 6).rotateZ(-Math.PI / 2));
  const headGeo = geo(new THREE.ConeGeometry(0.06, 0.16, 10).rotateZ(-Math.PI / 2));
  const fieldMat = mat(new THREE.MeshBasicMaterial({ transparent: true }));
  const shafts = new THREE.InstancedMesh(shaftGeo, fieldMat, arrowCount);
  const heads = new THREE.InstancedMesh(headGeo, fieldMat, arrowCount);
  scene.add(shafts, heads);
  const tmp = new THREE.Object3D();
  let lastFieldB = Number.NaN;
  const updateField = (B: number): void => {
    if (B === lastFieldB) return;
    lastFieldB = B;
    const len = 0.25 + (0.45 * B) / params.B.max;
    let k = 0;
    for (const x of ARROW_X)
      for (const y of ARROW_Y)
        for (const z of ARROW_Z) {
          tmp.position.set(x, y, z);
          tmp.scale.set(len, 1, 1);
          tmp.updateMatrix();
          shafts.setMatrixAt(k, tmp.matrix);
          tmp.position.set(x + len / 2 + 0.06, y, z);
          tmp.scale.set(1, 1, 1);
          tmp.updateMatrix();
          heads.setMatrixAt(k, tmp.matrix);
          k++;
        }
    shafts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    fieldMat.opacity = 0.45 + (0.55 * B) / params.B.max;
  };

  // --- rotating loop --------------------------------------------------------------
  const loopGroup = new THREE.Group();
  scene.add(loopGroup);
  const barGeo = geo(new THREE.BoxGeometry(1, 1, 1));
  const wireMat = mat(
    new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, emissiveIntensity: 1 }),
  );
  const turns: THREE.Group[] = [];
  for (let k = 0; k < MAX_VISUAL_TURNS; k++) {
    const g = new THREE.Group();
    for (let s = 0; s < 4; s++) g.add(new THREE.Mesh(barGeo, wireMat));
    turns.push(g);
    loopGroup.add(g);
  }
  const fillGeo = geo(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2)); // normal along +x
  const loopFillMat = mat(
    new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  const loopFill = new THREE.Mesh(fillGeo, loopFillMat);
  loopGroup.add(loopFill);
  // normal n̂ (accent colour)
  const normalMat = mat(new THREE.MeshBasicMaterial());
  const nShaftGeo = geo(new THREE.CylinderGeometry(0.025, 0.025, 1, 8).rotateZ(-Math.PI / 2));
  const nHeadGeo = geo(new THREE.ConeGeometry(0.08, 0.22, 12).rotateZ(-Math.PI / 2));
  const nShaft = new THREE.Mesh(nShaftGeo, normalMat);
  const nHead = new THREE.Mesh(nHeadGeo, normalMat);
  loopGroup.add(nShaft, nHead);
  // rotation axis
  const axisMat = mat(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }));
  const axis = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.012, 0.012, 3.2, 6)), axisMat);
  scene.add(axis);

  // projected area on a screen in front of the S pole (plane ⟂ B)
  const SCREEN_X = POLE_X - POLE_HALF - 0.04;
  const projMat = mat(
    new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  const proj = new THREE.Mesh(fillGeo, projMat);
  proj.position.x = SCREEN_X;
  const outlineGeo = geo(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.5, -0.5),
      new THREE.Vector3(0, 0.5, -0.5),
      new THREE.Vector3(0, 0.5, 0.5),
      new THREE.Vector3(0, -0.5, 0.5),
    ]),
  );
  const outlineMat = mat(new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.06 }));
  const outline = new THREE.LineLoop(outlineGeo, outlineMat);
  outline.computeLineDistances();
  outline.position.x = SCREEN_X - 0.01;
  scene.add(proj, outline);

  // --- motional: rails + bar ------------------------------------------------------
  const railGroup = new THREE.Group();
  scene.add(railGroup);
  const railMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }));
  const railTop = new THREE.Mesh(barGeo, railMat);
  const railBottom = new THREE.Mesh(barGeo, railMat);
  const connector = new THREE.Mesh(barGeo, railMat);
  const bar = new THREE.Mesh(barGeo, wireMat);
  const areaFill = new THREE.Mesh(fillGeo, projMat);
  const vShaft = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.025, 0.025, 1, 8).rotateX(Math.PI / 2)),
    normalMat,
  );
  const vHead = new THREE.Mesh(
    geo(new THREE.ConeGeometry(0.08, 0.22, 12).rotateX(Math.PI / 2)),
    normalMat,
  );
  railGroup.add(railTop, railBottom, connector, bar, areaFill, vShaft, vHead);

  // --- HTML labels -------------------------------------------------------------
  const mkLabel = (text: string, cls: string): HTMLElement => {
    const span = document.createElement('span');
    span.className = `faraday-label ${cls}`;
    span.textContent = text;
    span.style.cssText =
      'position:absolute;left:0;top:0;font:600 0.85rem/1 system-ui,sans-serif;padding:2px 5px;border-radius:4px;white-space:nowrap;will-change:transform;';
    overlay.append(span);
    return span;
  };
  const labels = {
    n: mkLabel('N', 'faraday-label--pole'),
    s: mkLabel('S', 'faraday-label--pole'),
    b: mkLabel('B', 'faraday-label--b'),
    normal: mkLabel('n̂', 'faraday-label--n'),
    proj: mkLabel('S·|cos α|', 'faraday-label--b'),
    v: mkLabel('v', 'faraday-label--n'),
  };
  const v3 = new THREE.Vector3();
  let width = 1;
  let height = 1;
  const place = (label: HTMLElement, p: THREE.Vector3, visible = true): void => {
    label.style.display = visible ? '' : 'none';
    if (!visible) return;
    v3.copy(p).project(camera);
    const x = ((v3.x + 1) / 2) * width;
    const y = ((1 - v3.y) / 2) * height;
    label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  };

  // --- theme ---------------------------------------------------------------------
  const setTheme = (t: Theme): void => {
    const pal = getPalette(t);
    const b = quantityColorHex('b', t);
    const accent = Number.parseInt(pal.accent.slice(1), 16);
    scene.background = new THREE.Color(pal.surface);
    northMat.color.set(t === 'dark' ? 0x56637a : 0x8b96a3);
    southMat.color.set(t === 'dark' ? 0x7a879b : 0xb8c1cc);
    fieldMat.color.setHex(b);
    loopFillMat.color.setHex(b);
    projMat.color.setHex(b);
    outlineMat.color.set(pal.textMuted);
    wireMat.color.set(t === 'dark' ? 0xb7bfc9 : 0x5d6875);
    wireMat.emissive.setHex(quantityColorHex('emf', t));
    railMat.color.set(t === 'dark' ? 0x8a94a1 : 0x6b7684);
    normalMat.color.setHex(accent);
    axisMat.color.set(pal.textMuted);
    for (const l of Object.values(labels)) {
      l.style.background = pal.surface2;
      l.style.color = pal.text;
    }
    labels.b.style.color = pal.quantity.b;
    labels.proj.style.color = pal.quantity.b;
    labels.normal.style.color = pal.accent;
    labels.v.style.color = pal.accent;
  };
  setTheme(theme);

  // --- sizing ----------------------------------------------------------------------
  const resize = (): void => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  ro?.observe(container);

  // --- per-frame update ----------------------------------------------------------
  const pos = new THREE.Vector3();
  const render = (s: SceneState): void => {
    const { p } = s;
    updateField(p.B);
    const rotating = s.mode === 'rotating';
    loopGroup.visible = rotating;
    axis.visible = rotating;
    proj.visible = rotating;
    outline.visible = rotating;
    railGroup.visible = !rotating;
    wireMat.emissiveIntensity = 0.05 + 0.95 * Math.min(1, Math.abs(s.emfRatio));

    if (rotating) {
      const side = loopSide(p.S);
      const nTurns = visualTurns(p.N);
      turns.forEach((g, k) => {
        g.visible = k < nTurns;
        const off = (k - (nTurns - 1) / 2) * (WIRE * 1.4);
        const [top, bottom, left, right] = g.children as THREE.Mesh[];
        top?.position.set(off, side / 2, 0);
        top?.scale.set(WIRE, WIRE, side + WIRE);
        bottom?.position.set(off, -side / 2, 0);
        bottom?.scale.set(WIRE, WIRE, side + WIRE);
        left?.position.set(off, 0, -side / 2);
        left?.scale.set(WIRE, side, WIRE);
        right?.position.set(off, 0, side / 2);
        right?.scale.set(WIRE, side, WIRE);
      });
      loopFill.scale.set(1, side, side);
      // Rotation about y: n̂ = (cos α, 0, −sin α); α = 0 ⇒ n̂ ∥ B (max flux).
      loopGroup.rotation.y = s.alpha;
      const c = Math.cos(s.alpha);
      loopFillMat.opacity = 0.06 + 0.3 * Math.abs(c);
      const nLen = 0.5 + side * 0.35;
      nShaft.scale.set(nLen, 1, 1);
      nShaft.position.set(nLen / 2, 0, 0);
      nHead.position.set(nLen + 0.1, 0, 0);
      proj.scale.set(1, side, Math.max(1e-3, side * Math.abs(c)));
      projMat.opacity = 0.2 + 0.5 * Math.abs(c);
      outline.scale.set(1, side, side);
      axis.scale.set(1, (side + 1) / 3.2, 1);
      pos.set(nLen + 0.35, 0, 0);
      loopGroup.localToWorld(pos);
      place(labels.normal, pos);
      place(labels.proj, pos.set(SCREEN_X, side / 2 + 0.3, 0));
      place(labels.v, pos, false);
    } else {
      const lVis = p.l * BAR_SCALE;
      const zBar = RAIL_Z0 + ((s.x - X_MIN) / (X_MAX - X_MIN)) * RAIL_LEN;
      const zEnd = RAIL_Z0 - 0.2;
      railTop.position.set(0, lVis / 2, RAIL_Z0 + RAIL_LEN / 2 - 0.1);
      railTop.scale.set(WIRE, WIRE, RAIL_LEN + 0.4);
      railBottom.position.set(0, -lVis / 2, RAIL_Z0 + RAIL_LEN / 2 - 0.1);
      railBottom.scale.set(WIRE, WIRE, RAIL_LEN + 0.4);
      connector.position.set(0, 0, zEnd);
      connector.scale.set(WIRE, lVis + WIRE, WIRE);
      bar.position.set(0, 0, zBar);
      bar.scale.set(WIRE * 1.6, lVis + 0.25, WIRE * 1.6);
      const w = Math.max(1e-3, zBar - zEnd);
      areaFill.position.set(0, 0, zEnd + w / 2);
      areaFill.scale.set(1, lVis, w);
      projMat.opacity = 0.35;
      const vLen = 0.25 + 0.5 * (p.v / params.v.max);
      vShaft.scale.set(1, 1, vLen);
      vShaft.position.set(0, lVis / 2 + 0.35, zBar + (s.dir * vLen) / 2);
      vHead.rotation.y = s.dir > 0 ? 0 : Math.PI;
      vHead.position.set(0, lVis / 2 + 0.35, zBar + s.dir * (vLen + 0.1));
      place(labels.v, pos.set(0, lVis / 2 + 0.65, zBar + s.dir * (vLen / 2)));
      place(labels.normal, pos, false);
      place(labels.proj, pos, false);
    }
    place(labels.n, pos.set(-POLE_X, 1.75, 0));
    place(labels.s, pos.set(POLE_X, 1.75, 0));
    place(labels.b, pos.set(ARROW_X[0] ?? 0, -1.3, 1.6));
    renderer.render(scene, camera);
    sceneStats.frames++;
  };

  sceneStats.liveScenes++;
  sceneStats.createdScenes++;
  let disposed = false;

  return {
    canvas,
    render,
    setTheme,
    memory: () => ({ ...renderer.info.memory }),
    dispose() {
      if (disposed) return;
      disposed = true;
      ro?.disconnect();
      shafts.dispose();
      heads.dispose();
      for (const g of geometries.splice(0)) {
        g.dispose();
        sceneStats.liveGeometries--;
      }
      for (const m of materials.splice(0)) {
        m.dispose();
        sceneStats.liveMaterials--;
      }
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      sceneStats.liveRenderers--;
      sceneStats.liveScenes--;
      canvas.remove();
      for (const l of Object.values(labels)) l.remove();
    },
  };
}
