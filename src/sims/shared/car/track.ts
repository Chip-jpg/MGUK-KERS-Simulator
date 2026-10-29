/**
 * Braking-zone track of the car scenes. The car stays at the origin (front axle at
 * x = CAR_DIMS.frontAxleX) and the track scrolls: a feature at track distance s
 * (from the braking point) is drawn at world X = s − x_car + frontAxleX.
 *
 * - asphalt strip (procedural tile, scrolled through the texture offset — no
 *   geometry change per frame), fading out in the scene fog;
 * - braking-point line (accent colour) and end-of-braking line (white/graphite
 *   chequer), with labels placed by the sim;
 * - original distance boards counting down to the end of the braking zone
 *   (150 / 100 / 50 m), shown only when they lie inside the zone;
 * - optional speed streaks (alta/bilanciata only): thin lines moving past at
 *   the car's speed, length = v · 25 ms (a motion-blur exposure), opacity ∝ (v/v_ref)².
 */
import * as THREE from 'three';
import type { Stage } from '../../../render';
import { studioBackgroundColor } from '../../../render';
import { carStats } from './stats';
import { CAR_DIMS } from './dims';
import { TRACK_TILE_M, TRACK_WIDTH_M, asphaltTile, boardFace } from './textures';

/** Visible length of the asphalt strip [m]. */
export const TRACK_LENGTH_M = 160;
/** Distances of the boards before the end of the zone [m]. */
export const BOARD_DISTANCES = [150, 100, 50] as const;

export interface Track {
  readonly group: THREE.Group;
  /** Own textures (pre-uploaded on mount for deterministic GPU counters). */
  readonly textures: readonly THREE.Texture[];
  /**
   * Place the track for a car whose front axle is at distance `x` from the braking
   * point; `distance` = length of the braking zone; `v` = speed (streaks).
   */
  update(x: number, distance: number, v: number, dt: number): void;
  /** World anchors of the braking-point and end lines (on the far kerb side). */
  readonly anchors: { start: THREE.Vector3; end: THREE.Vector3 };
  /** Visibility of each line (for its label). */
  readonly visible: { start: boolean; end: boolean };
  dispose(): void;
}

const STREAK_VS = /* glsl */ `
attribute float aTail;
uniform float uOffset;
uniform float uLen;
uniform float uSpan;
varying float vA;
void main() {
  vec3 p = position;
  float x = mod(p.x - uOffset, uSpan) - uSpan * 0.5;
  x += aTail * uLen;
  vA = (1.0 - aTail) * (1.0 - smoothstep(uSpan * 0.32, uSpan * 0.5, abs(x)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, p.y, p.z, 1.0);
}`;
const STREAK_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vA);
  #include <colorspace_fragment>
}`;

export function createTrack(stage: Stage): Track {
  const group = new THREE.Group();
  group.name = 'track';
  stage.scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    carStats.liveGeometries++;
    return g;
  };
  const own = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    carStats.liveMaterials++;
    return m;
  };
  const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    carStats.liveTextures++;
    return t;
  };

  // --- asphalt -------------------------------------------------------------------------------
  const asphaltTex = { dark: tex(asphaltTile(true)), light: tex(asphaltTile(false)) };
  for (const t of [asphaltTex.dark, asphaltTex.light]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(TRACK_LENGTH_M / TRACK_TILE_M, 1);
    t.anisotropy = 8;
  }
  const makeAsphalt = (): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial => {
    const map = stage.theme === 'dark' ? asphaltTex.dark : asphaltTex.light;
    return stage.settings.pbr
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 })
      : new THREE.MeshLambertMaterial({ map, color: new THREE.Color(1.7, 1.7, 1.7) });
  };
  let asphaltMat = own(makeAsphalt());
  const asphalt = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(TRACK_LENGTH_M, TRACK_WIDTH_M).rotateX(-Math.PI / 2)),
    asphaltMat,
  );
  asphalt.receiveShadow = true;
  asphalt.renderOrder = -1;
  group.add(asphalt);

  // --- lines ---------------------------------------------------------------------------------------
  const lineGeo = geo(new THREE.PlaneGeometry(0.3, 10).rotateX(-Math.PI / 2));
  const startMat = own(new THREE.MeshBasicMaterial({ color: 0x1f8f86 }));
  const startLine = new THREE.Mesh(lineGeo, startMat);
  const chequer = document.createElement('canvas');
  chequer.width = 16;
  chequer.height = 160;
  const cg = chequer.getContext('2d');
  if (cg) {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 20; j++) {
        cg.fillStyle = (i + j) % 2 ? '#20262e' : '#848b93';
        cg.fillRect(i * 8, j * 8, 8, 8);
      }
  }
  const endTex = tex(chequer);
  endTex.magFilter = THREE.NearestFilter;
  const endMat = own(new THREE.MeshBasicMaterial({ map: endTex }));
  const endLine = new THREE.Mesh(lineGeo, endMat);
  startLine.position.y = endLine.position.y = 0.006;
  group.add(startLine, endLine);

  // --- distance boards (post + face) ------------------------------------------------------------
  const BOARD_Z = -6.3;
  const postGeo = geo(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8));
  const faceGeo = geo(new THREE.PlaneGeometry(0.8, 1.0));
  const postMat = stage.materials.get('darkSteel', 'board');
  const boards = BOARD_DISTANCES.map((d) => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, postMat);
    stage.materials.assign(post, 'darkSteel', 'board');
    post.position.y = 0.7;
    const back = new THREE.Mesh(faceGeo, postMat);
    stage.materials.assign(back, 'darkSteel', 'board');
    back.position.y = 1.65;
    const faceMat = own(new THREE.MeshBasicMaterial({ map: tex(boardFace(String(d))) }));
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.y = 1.65;
    // face the oncoming car (+x), turned slightly towards the track centre (+z)
    face.rotation.y = Math.PI / 2 - 0.35;
    back.rotation.y = face.rotation.y + Math.PI;
    back.position.x = -0.004;
    g.add(post, back, face);
    g.position.z = BOARD_Z;
    group.add(g);
    return { d, g };
  });
  stage.castShadows(group, true);
  asphalt.castShadow = false;
  startLine.castShadow = endLine.castShadow = false;

  // --- speed streaks (alta / bilanciata) ---------------------------------------------------------
  const SPAN = 70;
  let streaks: THREE.LineSegments | null = null;
  const streakMat = own(
    new THREE.ShaderMaterial({
      vertexShader: STREAK_VS,
      fragmentShader: STREAK_FS,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOffset: { value: 0 },
        uLen: { value: 0 },
        uSpan: { value: SPAN },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
      },
    }),
  );
  const buildStreaks = (): void => {
    if (streaks) {
      group.remove(streaks);
      streaks.geometry.dispose();
      carStats.liveGeometries--;
      streaks = null;
    }
    if (stage.tier === 'base') return;
    const n = Math.round(150 * stage.settings.particleDensity);
    const pos = new Float32Array(n * 6);
    const tail = new Float32Array(n * 2);
    let a = 12345;
    const r = (): number => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const z = side * (1.25 + 4.5 * r());
      const y = 0.08 + (r() < 0.7 ? 0.5 * r() : 1.8 * r());
      const x = r() * SPAN;
      pos.set([x, y, z, x, y, z], i * 6);
      tail[2 * i + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    carStats.liveGeometries++;
    streaks = new THREE.LineSegments(g, streakMat);
    streaks.frustumCulled = false;
    streaks.renderOrder = 4;
    group.add(streaks);
  };
  buildStreaks();

  // --- fog (fades the strip into the studio) ---------------------------------------------------
  const applyFog = (): void => {
    const dark = stage.theme === 'dark';
    const col = stage.settings.pbr ? (dark ? 0x10141a : 0xdfe4e9) : studioBackgroundColor(dark);
    stage.scene.fog = new THREE.Fog(col, 22, 62);
    (streakMat.uniforms['uColor'] as { value: THREE.Color }).value.setHex(
      dark ? 0xc9d6e6 : 0x4a5868,
    );
  };
  applyFog();
  const rebuildAsphalt = (): void => {
    const old = asphaltMat;
    asphaltMat = own(makeAsphalt());
    asphalt.material = asphaltMat;
    materials.splice(materials.indexOf(old), 1);
    old.dispose();
    carStats.liveMaterials--;
  };
  const offTheme = stage.onThemeChange(() => {
    applyFog();
    rebuildAsphalt();
  });
  const offTier = stage.onTierChange(() => {
    applyFog();
    rebuildAsphalt();
    buildStreaks();
  });

  const anchors = { start: new THREE.Vector3(), end: new THREE.Vector3() };
  const visible = { start: false, end: false };
  const half = TRACK_LENGTH_M / 2;
  let offset = 0;
  const F = CAR_DIMS.frontAxleX;

  return {
    group,
    textures,
    anchors,
    visible,
    update(x, distance, v, dt) {
      // texture scroll: one tile = TRACK_TILE_M; world moves by −x
      const u = (((x / TRACK_TILE_M) % 1) + 1) % 1;
      asphaltTex.dark.offset.x = u;
      asphaltTex.light.offset.x = u;
      const sx = -x + F;
      const ex = distance - x + F;
      startLine.position.x = sx;
      endLine.position.x = ex;
      visible.start = Math.abs(sx) < half - 2;
      visible.end = distance > 0 && Math.abs(ex) < half - 2;
      startLine.visible = visible.start;
      endLine.visible = visible.end;
      anchors.start.set(sx, 0.05, -4.2);
      anchors.end.set(ex, 0.05, -4.2);
      for (const b of boards) {
        const bx = distance - b.d - x + F;
        b.g.position.x = bx;
        b.g.visible = distance > b.d + 5 && Math.abs(bx) < half - 5;
      }
      if (streaks) {
        offset = (offset + v * dt) % 1e6;
        const su = streakMat.uniforms as Record<string, { value: number }>;
        (su['uOffset'] as { value: number }).value = offset;
        (su['uLen'] as { value: number }).value = v * 0.025;
        const k = Math.min(1, v / 90);
        (su['uOpacity'] as { value: number }).value = 0.32 * k * k;
      }
    },
    dispose() {
      offTheme();
      offTier();
      stage.scene.fog = null;
      stage.scene.remove(group);
      if (streaks) {
        streaks.geometry.dispose();
        carStats.liveGeometries--;
      }
      for (const g of geometries.splice(0)) {
        g.dispose();
        carStats.liveGeometries--;
      }
      for (const m of materials.splice(0)) {
        m.dispose();
        carStats.liveMaterials--;
      }
      for (const t of textures.splice(0)) {
        t.dispose();
        carStats.liveTextures--;
      }
    },
  };
}
