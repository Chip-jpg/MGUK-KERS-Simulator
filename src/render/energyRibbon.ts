/**
 * Energy-flow ribbon: a tube along a path whose RADIUS is ∝ the transferred
 * power (|P| · widthPerWatt, clamped) with purple chevrons flowing in the
 * direction of the energy flow (sign of P), speed ∝ |P| (capped).
 * The radius is changed in the vertex shader (no geometry rebuild per frame).
 *
 * Colour is theme-safe: it is a quantity colour of the §4.5 palette (default
 * `energy`) times a dim factor, re-applied on every theme change — sims never
 * touch the shader uniforms themselves (e.g. losses becoming heat: `dim: 0.42`).
 */
import * as THREE from 'three';
import type { Theme } from '../core/types';
import { quantityColorHex, type Quantity } from '../ui/colors';
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
  /** Palette quantity of the colour (default 'energy'). */
  quantity?: Quantity;
  /** Colour multiplier in [0, 1] (default 1; e.g. 0.42 for energy that became heat). */
  dim?: number;
  /** Opacity while power flows (default 0.9); at P = 0 the ribbon fades to 0.28 × this. */
  opacity?: number;
}

/** Idle opacity as a fraction of the flowing opacity (P = 0). */
export const RIBBON_IDLE_FRACTION = 0.28;

/** Linear colour of a ribbon for a theme: palette colour of `quantity` × `dim`. */
export function ribbonColor(
  theme: Theme,
  quantity: Quantity = 'energy',
  dim = 1,
  out: THREE.Color = new THREE.Color(),
): THREE.Color {
  const d = Number.isFinite(dim) ? Math.min(1, Math.max(0, dim)) : 1;
  return out.setHex(quantityColorHex(quantity, theme)).multiplyScalar(d);
}

export interface EnergyRibbon {
  readonly object: THREE.Mesh;
  setPower(P: number): void;
  setPath(path: THREE.Vector3[]): void;
  setVisible(v: boolean): void;
  /** Change the dim factor (theme-safe; kept across theme changes). */
  setDim(d: number): void;
  /** Change the flowing opacity. */
  setOpacity(o: number): void;
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
  // clamp: |dot| can exceed 1 by rounding, and pow(<0, x) is NaN (bloom turns one NaN pixel into a blot)
  float rim = pow( clamp( 1.0 - abs( dot( vN, vView ) ), 0.0, 1.0 ), 1.5 );
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
  const quantity = o.quantity ?? 'energy';
  let dim = o.dim ?? 1;
  let opacity = o.opacity ?? 0.9;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uRadius: { value: minR },
      uColor: { value: ribbonColor(stage.theme, quantity, dim) },
      uOffset: { value: 0 },
      uRepeat: { value: 6 },
      uOpacity: { value: opacity * RIBBON_IDLE_FRACTION },
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
  const uColor = mat.uniforms['uColor'] as { value: THREE.Color };
  const offTheme = stage.onThemeChange((t) => ribbonColor(t, quantity, dim, uColor.value));
  const offUpdate = stage.addUpdatable({
    update(dt) {
      const a = Math.abs(power);
      (mat.uniforms['uRadius'] as { value: number }).value = Math.min(
        maxR,
        Math.max(minR, a * o.widthPerWatt),
      );
      const u = mat.uniforms['uOffset'] as { value: number };
      u.value = (u.value + Math.sign(power) * Math.min(2, a / pRef) * speed * dt) % 1000;
      (mat.uniforms['uOpacity'] as { value: number }).value =
        a > 0 ? opacity : opacity * RIBBON_IDLE_FRACTION;
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
    setDim(d) {
      dim = d;
      ribbonColor(stage.theme, quantity, dim, uColor.value);
    },
    setOpacity(x) {
      opacity = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : opacity;
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
