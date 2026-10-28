/**
 * Energy-flow ribbon: a tube along a path whose RADIUS is ∝ the transferred
 * power (|P| · widthPerWatt, clamped) with purple chevrons flowing in the
 * direction of the energy flow (sign of P), speed ∝ |P| (capped).
 * The radius is changed in the vertex shader (no geometry rebuild per frame).
 */
import * as THREE from 'three';
import { quantityColorHex } from '../ui/colors';
import type { Stage } from './stage';
import { renderStats } from './stats';

export interface EnergyRibbonOptions {
  path: THREE.Vector3[];
  /** Radius per watt [scene units / W] (state it in the sim's legend). */
  widthPerWatt: number;
  /** Radius clamp (default 0.01 … 0.4). */
  minRadius?: number;
  maxRadius?: number;
  /** Chevron speed at |P| = pRef [τ / s] and the reference power. */
  speed?: number;
  pRef?: number;
}

export interface EnergyRibbon {
  readonly object: THREE.Mesh;
  setPower(P: number): void;
  setPath(path: THREE.Vector3[]): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const VS = /* glsl */ `
uniform float uRadius;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  // TubeGeometry is built with radius 1: centre = position − normal.
  vec3 p = position + normal * ( uRadius - 1.0 );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  vN = normalize( normalMatrix * normal );
  vView = normalize( -mv.xyz );
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOffset;
uniform float uRepeat;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  float t = fract( vUv.x * uRepeat - uOffset );
  float chevron = smoothstep( 0.0, 0.5, t ) * ( 1.0 - smoothstep( 0.5, 0.62, t ) );
  float rim = pow( 1.0 - abs( dot( vN, vView ) ), 1.5 );
  vec3 c = uColor * ( 0.35 + 1.6 * chevron + 0.6 * rim );
  gl_FragColor = vec4( c, uOpacity * ( 0.35 + 0.65 * max( chevron, rim ) ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createEnergyRibbon(stage: Stage, o: EnergyRibbonOptions): EnergyRibbon {
  const minR = o.minRadius ?? 0.01;
  const maxR = o.maxRadius ?? 0.4;
  const pRef = o.pRef ?? 1;
  const speed = o.speed ?? 1.2;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uRadius: { value: minR },
      uColor: { value: new THREE.Color(quantityColorHex('energy', stage.theme)) },
      uOffset: { value: 0 },
      uRepeat: { value: 6 },
      uOpacity: { value: 0.9 },
    },
  });
  renderStats.liveMaterials++;
  let geo: THREE.TubeGeometry | null = null;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  renderStats.liveGeometries++;
  mesh.name = 'energy-ribbon';
  mesh.renderOrder = 3;
  stage.scene.add(mesh);

  const setPath = (path: THREE.Vector3[]): void => {
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    const segs = Math.max(16, Math.round(120 * stage.settings.tessellation));
    const g = new THREE.TubeGeometry(
      curve,
      segs,
      1,
      stage.settings.tier === 'base' ? 6 : 12,
      false,
    );
    mesh.geometry.dispose();
    geo = g;
    mesh.geometry = g;
    (mat.uniforms['uRepeat'] as { value: number }).value = Math.max(2, curve.getLength() * 2.2);
  };
  setPath(o.path);
  let lastPath = o.path;
  let power = 0;

  const offTier = stage.onTierChange(() => setPath(lastPath));
  const offTheme = stage.onThemeChange((t) =>
    (mat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(quantityColorHex('energy', t)),
  );
  const offUpdate = stage.addUpdatable({
    update(dt) {
      const a = Math.abs(power);
      (mat.uniforms['uRadius'] as { value: number }).value = Math.min(
        maxR,
        Math.max(minR, a * o.widthPerWatt),
      );
      const u = mat.uniforms['uOffset'] as { value: number };
      u.value = (u.value + Math.sign(power) * Math.min(2, a / pRef) * speed * dt) % 1000;
      (mat.uniforms['uOpacity'] as { value: number }).value = a > 0 ? 0.9 : 0.25;
    },
  });

  return {
    object: mesh,
    setPower(P) {
      power = Number.isFinite(P) ? P : 0;
    },
    setPath(path) {
      lastPath = path;
      setPath(path);
    },
    setVisible(v) {
      mesh.visible = v;
    },
    dispose() {
      offTier();
      offTheme();
      offUpdate();
      stage.scene.remove(mesh);
      (geo ?? mesh.geometry).dispose();
      mat.dispose();
      renderStats.liveGeometries--;
      renderStats.liveMaterials--;
    },
  };
}
