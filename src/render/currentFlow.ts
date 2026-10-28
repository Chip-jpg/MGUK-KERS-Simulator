/**
 * Current as instanced particles moving along a conductor.
 *
 * Particles are evenly spaced (constant density) along the conductor's centre
 * line; they move with velocity v = sign(i) · min(|i| · speedPerAmp, vMax) in
 * scene units per second — conventional current direction, still at i = 0.
 * The scale `speedPerAmp` is stated by the sim (e.g. in its model note):
 * it is a VISUAL scale, not the electron drift velocity (≈ mm/s in copper).
 */
import * as THREE from 'three';
import { quantityColorHex } from '../ui/colors';
import type { Stage } from './stage';
import { renderStats } from './stats';

export interface CurrentFlowOptions {
  /** Conductor centre line (≥ 2 points), in the flow direction for i > 0. */
  path: THREE.Vector3[];
  closed?: boolean;
  /** Particles at full density (scaled by the tier's particleDensity). Default 60. */
  count?: number;
  /** Particle radius (default 0.035). */
  radius?: number;
  /** Scene units per second per unit of "current" passed to setCurrent (default 1). */
  speedPerAmp?: number;
  /** Speed cap (default 3 scene units / s). */
  vMax?: number;
  /** Smooth the polyline with a Catmull-Rom curve (default true). */
  smooth?: boolean;
}

export interface CurrentFlow {
  readonly object: THREE.InstancedMesh;
  /** Current (any unit consistent with speedPerAmp; sign = direction along the path). */
  setCurrent(i: number): void;
  setPath(path: THREE.Vector3[], closed?: boolean): void;
  setVisible(v: boolean): void;
  /** Present velocity [scene units/s]. */
  readonly velocity: number;
  dispose(): void;
}

export function createCurrentFlow(stage: Stage, o: CurrentFlowOptions): CurrentFlow {
  const radius = o.radius ?? 0.035;
  const speedPerAmp = o.speedPerAmp ?? 1;
  const vMax = o.vMax ?? 3;
  const full = o.count ?? 60;
  const geo = new THREE.SphereGeometry(radius, 10, 8);
  renderStats.liveGeometries++;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x220000,
    emissive: quantityColorHex('i', stage.theme),
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });
  renderStats.liveMaterials++;
  const mesh = new THREE.InstancedMesh(geo, mat, full);
  mesh.name = 'current-flow';
  mesh.frustumCulled = false;
  stage.scene.add(mesh);

  let curve: THREE.Curve<THREE.Vector3> = new THREE.LineCurve3(
    new THREE.Vector3(),
    new THREE.Vector3(1, 0, 0),
  );
  let length = 1;
  let closed = !!o.closed;
  let phase = 0;
  let current = 0;
  let count = 0;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();

  const setPath = (path: THREE.Vector3[], isClosed = closed): void => {
    closed = isClosed;
    if (path.length < 2) return;
    if (o.smooth === false) {
      const cp = new THREE.CurvePath<THREE.Vector3>();
      const pts = closed ? [...path, path[0] as THREE.Vector3] : path;
      for (let k = 0; k < pts.length - 1; k++) cp.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
      curve = cp;
    } else {
      curve = new THREE.CatmullRomCurve3(path, closed, 'centripetal', 0.5);
    }
    length = Math.max(1e-6, curve.getLength());
    (curve as THREE.Curve<THREE.Vector3>).arcLengthDivisions = 400;
    curve.updateArcLengths();
  };
  setPath(o.path, closed);

  const applyCount = (): void => {
    count = Math.max(2, Math.round(full * stage.settings.particleDensity));
    mesh.count = Math.min(full, count);
  };
  applyCount();

  const place = (): void => {
    const n = mesh.count;
    for (let k = 0; k < n; k++) {
      let u = (k / n + phase / length) % 1;
      if (u < 0) u += 1;
      if (!closed && (u < 0.002 || u > 0.998)) {
        m.makeScale(0, 0, 0);
      } else {
        curve.getPointAt(u, p);
        m.makeTranslation(p.x, p.y, p.z);
      }
      mesh.setMatrixAt(k, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place();

  const offTier = stage.onTierChange(() => {
    applyCount();
    place();
  });
  const offTheme = stage.onThemeChange((t) => mat.emissive.setHex(quantityColorHex('i', t)));
  const velocity = (): number =>
    Math.sign(current) * Math.min(Math.abs(current) * speedPerAmp, vMax);
  const offUpdate = stage.addUpdatable({
    update(dt) {
      if (!mesh.visible) return;
      const v = velocity();
      if (v !== 0 && dt > 0) {
        phase = (phase + v * dt) % length;
        place();
      }
      mat.emissiveIntensity = 0.6 + 1.8 * Math.min(1, Math.abs(v) / vMax);
    },
  });

  return {
    object: mesh,
    setCurrent(i) {
      current = Number.isFinite(i) ? i : 0;
    },
    setPath(path, isClosed) {
      setPath(path, isClosed);
      place();
    },
    setVisible(v) {
      mesh.visible = v;
    },
    get velocity() {
      return velocity();
    },
    dispose() {
      offTier();
      offTheme();
      offUpdate();
      stage.scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
      renderStats.liveGeometries--;
      renderStats.liveMaterials--;
    },
  };
}
