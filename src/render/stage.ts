/**
 * `createStage` — the shared "technical museum" studio every 3D sim renders in:
 * WebGL renderer + scene + perspective camera + damped OrbitControls, procedural
 * image-based lighting (RoomEnvironment → PMREM), studio backdrop and floor,
 * key/rim/fill lights, shadows and a post-processing chain chosen by the quality
 * tier (D14), resize + theme handling and complete disposal.
 *
 * The tier can change live (`stage.setTier`, or the sidebar control through
 * `onQualityChange`): the composer, shadows, IBL and the material kit are rebuilt
 * without remounting the sim; sims rebuild their own tier-dependent objects in
 * `stage.onTierChange`.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  currentTheme,
  onThemeChange as onAppThemeChange,
  prefersReducedMotion,
} from '../core/theme';
import type { AppContext, Theme } from '../core/types';
import { createMaterialKit, type MaterialKit } from './materials';
import {
  getQuality,
  onQualityChange,
  tierSettings,
  type QualityTier,
  type TierSettings,
} from './quality';
import { installRenderDebugHook, renderStats } from './stats';
import {
  radialFade,
  studioBackdrop,
  studioBackgroundColor,
  studioFloor,
  studioFloorBaked,
} from './textures';

export type Vec3Like = readonly [number, number, number];

export interface StageOptions {
  /** Accessible description of the canvas (role="img"). */
  ariaLabel: string;
  camera: { position: Vec3Like; target: Vec3Like; fov?: number; near?: number; far?: number };
  controls?: {
    minDistance?: number;
    maxDistance?: number;
    /** Max polar angle [rad] (default ≈ 88°: never below the floor). */
    maxPolarAngle?: number;
    enablePan?: boolean;
  };
  /** Height of the studio floor (default −2). */
  floorY?: number;
  /** Half-size of the key light's shadow frustum [scene units] (default 6). */
  shadowRadius?: number;
  /** Force a tier for this stage instead of the global setting (tests). */
  tier?: QualityTier;
  /** Gentle intro camera move on mount (default true; off with reduced motion). */
  intro?: boolean;
}

export interface Updatable {
  /** Called before every frame; dt [s] is real time since the previous sim frame (0 while paused). */
  update(dt: number): void;
}

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly materials: MaterialKit;
  readonly keyLight: THREE.DirectionalLight;
  readonly tier: QualityTier;
  readonly settings: TierSettings;
  readonly theme: Theme;
  /** CSS pixel size of the canvas. */
  readonly width: number;
  readonly height: number;
  onResize(cb: (w: number, h: number) => void): () => void;
  onTierChange(cb: (s: TierSettings) => void): () => void;
  onThemeChange(cb: (t: Theme) => void): () => void;
  /** Register a per-frame updater (field-line flow, particles, labels…). */
  addUpdatable(u: Updatable): () => void;
  /** Meshes that may hide labels (occlusion test). */
  readonly occluders: THREE.Object3D[];
  /** Mark every mesh under `root` as shadow caster (and receiver). */
  castShadows(root: THREE.Object3D, receive?: boolean): void;
  /** Dispose `d` together with the stage. */
  track(d: { dispose(): void }): void;
  setTier(tier: QualityTier): void;
  setTheme(theme: Theme): void;
  /** Back to the home camera ("Ripristina vista"). */
  resetView(): void;
  /** Change the home camera (e.g. per experiment mode); eases there unless reduced motion. */
  setView(position: Vec3Like, target: Vec3Like, animate?: boolean): void;
  /** Advance foundation animations and draw one frame (call from the sim's render). */
  render(): void;
  /** Renderer/composer facts for debug hooks. */
  info(): StageInfo;
  dispose(): void;
}

export interface StageInfo {
  tier: QualityTier;
  post: boolean;
  passes: string[];
  shadows: boolean;
  ibl: boolean;
  pixelRatio: number;
  memory: { geometries: number; textures: number };
  render: { calls: number; triangles: number; lines: number; points: number };
  programs: number;
}

/** Render targets inside a post chain (for the leak counters). */
function countTargets(passes: Array<{ name: string; rt: number }>): number {
  return passes.reduce((s, p) => s + p.rt, 0);
}

export function createStage(host: HTMLElement, ctx: AppContext, opts: StageOptions): Stage {
  installRenderDebugHook();
  let settings = tierSettings(opts.tier ?? getQuality());
  let theme: Theme = ctx.theme ?? currentTheme();
  const floorY = opts.floorY ?? -2;
  const shadowRadius = opts.shadowRadius ?? 6;

  // Context AA only when the stage starts without post-processing (base);
  // with a composer, AA comes from MSAA targets / SMAA.
  const renderer = new THREE.WebGLRenderer({
    antialias: !settings.post,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderStats.liveRenderers++;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // one frame = scene + all post passes
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opts.ariaLabel);
  canvas.classList.add('r-stage__canvas');
  host.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    opts.camera.fov ?? 38,
    1,
    opts.camera.near ?? 0.1,
    opts.camera.far ?? 120,
  );
  const home = {
    position: new THREE.Vector3(...opts.camera.position),
    target: new THREE.Vector3(...opts.camera.target),
  };
  camera.position.copy(home.position);
  camera.lookAt(home.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.copy(home.target);
  controls.minDistance = opts.controls?.minDistance ?? 3;
  controls.maxDistance = opts.controls?.maxDistance ?? 30;
  controls.maxPolarAngle = opts.controls?.maxPolarAngle ?? THREE.MathUtils.degToRad(88);
  controls.enablePan = opts.controls?.enablePan ?? true;
  controls.zoomSpeed = 0.6;
  controls.rotateSpeed = 0.6;
  controls.update();

  const disposables: Array<{ dispose(): void }> = [];
  const owned = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  // --- lights ---------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x20242b, 0.6);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.position.set(-5, 9, 6);
  key.target.position.set(0, floorY + 1, 0);
  key.shadow.camera.left = -shadowRadius;
  key.shadow.camera.right = shadowRadius;
  key.shadow.camera.top = shadowRadius;
  key.shadow.camera.bottom = -shadowRadius;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
  rim.position.set(6, 4, -7);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(4, 2, 8);
  scene.add(hemi, key, key.target, rim, fill);

  // --- studio: backdrop + floor ---------------------------------------------------
  let backdropTex: THREE.CanvasTexture | null = null;
  let floorTex: THREE.CanvasTexture | null = null;
  const fadeTex = new THREE.CanvasTexture(radialFade());
  renderStats.liveTextures++;
  const floorGeo = new THREE.CircleGeometry(16, 96).rotateX(-Math.PI / 2);
  renderStats.liveGeometries++;
  const floorMat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    alphaMap: fadeTex,
    depthWrite: false,
  });
  // base tier: unlit floor (a lit, alpha-blended full-screen floor is the most
  // expensive draw on software GL).
  // base tier: unlit, OPAQUE floor with the fade baked in (a lit, alpha-blended
  // full-screen floor is the most expensive draw on software GL).
  const floorBasic = new THREE.MeshBasicMaterial();
  let floorBakedTex: THREE.CanvasTexture | null = null;
  renderStats.liveMaterials += 2;
  const floor = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(floorGeo, floorMat);
  floor.position.y = floorY;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  scene.add(floor);

  // --- material kit -----------------------------------------------------------------
  const materials = createMaterialKit(settings, theme);

  // --- IBL (lazy: only built for tiers that use it) --------------------------------
  let envRT: THREE.WebGLRenderTarget | null = null;
  const ensureEnv = (): void => {
    if (envRT) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    renderStats.livePmrem++;
    const room = new RoomEnvironment();
    envRT = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    renderStats.livePmrem--;
    renderStats.liveRenderTargets++;
  };
  const dropEnv = (): void => {
    if (!envRT) return;
    envRT.dispose();
    envRT = null;
    renderStats.liveRenderTargets--;
  };

  // --- post-processing ---------------------------------------------------------------
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  /**
   * Light studio: the backdrop itself is near white, so only HDR emissives
   * (intensity > 1: glows, pulses, filament) may bloom — raise the threshold.
   */
  const tuneBloom = (): void => {
    const b = settings.bloom;
    if (!bloomPass || !b) return;
    const dark = theme === 'dark';
    bloomPass.threshold = dark ? b.threshold : 1.05;
    bloomPass.strength = dark ? b.strength : b.strength * 0.6;
  };
  let postPasses: Array<{ name: string; rt: number; pass: { dispose?: () => void } }> = [];
  let width = 1;
  let height = 1;

  const disposePost = (): void => {
    if (!composer) return;
    for (const p of postPasses) p.pass.dispose?.();
    renderStats.liveRenderTargets -= countTargets(postPasses) + 2;
    composer.dispose();
    composer = null;
    bloomPass = null;
    postPasses = [];
    renderStats.liveComposers--;
  };

  const buildPost = (): void => {
    disposePost();
    if (!settings.post) return;
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(1, width * pr), Math.max(1, height * pr), {
      type: THREE.HalfFloatType,
      samples: settings.msaaSamples,
    });
    composer = new EffectComposer(renderer, rt);
    renderStats.liveComposers++;
    renderStats.liveRenderTargets += 2;
    composer.setSize(width, height);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    postPasses.push({ name: 'render', rt: 0, pass: renderPass });
    if (settings.bloom) {
      const b = settings.bloom;
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        b.strength,
        b.radius,
        b.threshold,
      );
      bloomPass = bloom;
      tuneBloom();
      composer.addPass(bloom);
      postPasses.push({
        name: 'bloom',
        rt: bloom.renderTargetsHorizontal.length + bloom.renderTargetsVertical.length + 1,
        pass: bloom,
      });
    }
    if (settings.antialias === 'smaa') {
      const smaa = new SMAAPass(width * pr, height * pr);
      composer.addPass(smaa);
      postPasses.push({ name: 'smaa', rt: 2, pass: smaa });
    }
    const out = new OutputPass();
    composer.addPass(out);
    postPasses.push({ name: 'output', rt: 0, pass: out });
    renderStats.liveRenderTargets += countTargets(postPasses);
  };

  // --- theme ---------------------------------------------------------------------------
  const bgColor = new THREE.Color();
  /** Gradient backdrop texture, or a flat colour in base (one full-screen pass less). */
  function applyBackground(): void {
    scene.background = settings.pbr
      ? backdropTex
      : bgColor.setHex(studioBackgroundColor(theme === 'dark'));
  }
  const themeCbs = new Set<(t: Theme) => void>();
  const applyStudioTheme = (): void => {
    const dark = theme === 'dark';
    backdropTex?.dispose();
    floorTex?.dispose();
    if (backdropTex) renderStats.liveTextures--;
    if (floorTex) renderStats.liveTextures--;
    backdropTex = new THREE.CanvasTexture(studioBackdrop(dark));
    backdropTex.colorSpace = THREE.SRGBColorSpace;
    floorTex = new THREE.CanvasTexture(studioFloor(dark));
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.anisotropy = 4;
    renderStats.liveTextures += 2;
    floorMat.map = floorTex;
    floorMat.color.set(0xffffff);
    floorMat.needsUpdate = true;
    if (floorBakedTex) renderStats.liveTextures--;
    floorBakedTex?.dispose();
    floorBakedTex = new THREE.CanvasTexture(studioFloorBaked(dark));
    floorBakedTex.colorSpace = THREE.SRGBColorSpace;
    renderStats.liveTextures++;
    floorBasic.map = floorBakedTex;
    floorBasic.needsUpdate = true;
    applyBackground();
    hemi.color.set(dark ? 0xc9d6ff : 0xffffff);
    hemi.groundColor.set(dark ? 0x1a1d22 : 0x9aa3ad);
    key.intensity = dark ? 1.7 : 1.6;
    rim.intensity = dark ? 1.0 : 0.7;
    renderer.toneMappingExposure = dark ? 1.0 : 0.95;
    tuneBloom();
  };

  // --- tier ------------------------------------------------------------------------------
  const tierCbs = new Set<(s: TierSettings) => void>();
  const applyTier = (): void => {
    floor.material = settings.pbr ? floorMat : floorBasic;
    applyBackground();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatioCap));
    renderer.setSize(width, height, false);
    const shadows = settings.shadowMapSize > 0;
    if (renderer.shadowMap.enabled !== shadows || key.shadow.mapSize.x !== settings.shadowMapSize) {
      key.shadow.map?.dispose();
      key.shadow.map = null;
      if (shadows) key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
      renderer.shadowMap.enabled = shadows;
      key.castShadow = shadows;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    if (settings.ibl) {
      ensureEnv();
      scene.environment = envRT?.texture ?? null;
      scene.environmentIntensity = 0.55;
      hemi.intensity = 0.35;
    } else {
      scene.environment = null;
      dropEnv();
      hemi.intensity = 1.25;
    }
    materials.setTier(settings);
    buildPost();
  };

  // --- size --------------------------------------------------------------------------------
  const resizeCbs = new Set<(w: number, h: number) => void>();
  const resize = (): void => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
    for (const cb of [...resizeCbs]) cb(w, h);
    invalidate();
  };
  width = Math.max(1, host.clientWidth);
  height = Math.max(1, host.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  applyStudioTheme();
  applyTier();
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  ro?.observe(host);

  // --- camera flights (intro on mount, setView) -----------------------------------------
  const reduced = ctx.reducedMotion || prefersReducedMotion();
  interface Flight {
    t: number;
    dur: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
  }
  let flight: Flight | null = null;
  if (opts.intro !== false && !reduced) {
    const from = home.position.clone().sub(home.target).multiplyScalar(1.3);
    from.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.35).add(home.target);
    from.y += 1.2;
    flight = { t: 0, dur: 1.6, fromPos: from, fromTarget: home.target.clone() };
    camera.position.copy(from);
    camera.lookAt(home.target);
  }
  controls.addEventListener('start', () => (flight = null));
  const flyStep = (dt: number): void => {
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(flight.fromPos, home.position, e);
    controls.target.lerpVectors(flight.fromTarget, home.target, e);
    camera.lookAt(controls.target);
    if (k >= 1) {
      flight = null;
      controls.update();
    }
  };

  // --- frame ------------------------------------------------------------------------------------
  const updatables = new Set<Updatable>();
  let lastFrameMs = 0;
  let lastRenderMs = 0;
  let selfRaf: number | null = null;
  let lastSelfMs = 0;
  let disposed = false;

  const draw = (dt: number, camDt = dt): void => {
    if (flight) flyStep(camDt);
    else controls.update();
    for (const u of updatables) u.update(dt);
    renderer.info.reset();
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    lastRenderMs = performance.now();
    renderStats.frames++;
  };

  /** Self-rendering while the sim loop is paused (orbit damping, resize, theme). */
  function invalidate(): void {
    if (selfRaf !== null || disposed) return;
    selfRaf = requestAnimationFrame(() => {
      selfRaf = null;
      if (disposed) return;
      const now = performance.now();
      if (now - lastRenderMs < 40) return; // the sim loop is running
      const camDt = Math.min(0.05, (now - lastSelfMs) / 1000);
      lastSelfMs = now;
      const moving = flight !== null || controls.update();
      draw(0, camDt);
      if (moving) invalidate();
    });
  }
  controls.addEventListener('change', invalidate);

  const offQuality = opts.tier ? () => {} : onQualityChange((t) => stage.setTier(t));
  const offTheme = onAppThemeChange((t) => stage.setTheme(t));

  const occluders: THREE.Object3D[] = [];

  const stage: Stage = {
    renderer,
    scene,
    camera,
    controls,
    canvas,
    host,
    materials,
    keyLight: key,
    occluders,
    get tier() {
      return settings.tier;
    },
    get settings() {
      return settings;
    },
    get theme() {
      return theme;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    onResize(cb) {
      resizeCbs.add(cb);
      return () => resizeCbs.delete(cb);
    },
    onTierChange(cb) {
      tierCbs.add(cb);
      return () => tierCbs.delete(cb);
    },
    onThemeChange(cb) {
      themeCbs.add(cb);
      return () => themeCbs.delete(cb);
    },
    addUpdatable(u) {
      updatables.add(u);
      return () => updatables.delete(u);
    },
    castShadows(root, receive = true) {
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = receive;
        }
      });
    },
    track(d) {
      owned(d);
    },
    setTier(t) {
      if (disposed || t === settings.tier) return;
      settings = tierSettings(t);
      applyTier();
      for (const cb of [...tierCbs]) cb(settings);
      invalidate();
    },
    setTheme(t) {
      if (disposed || t === theme) return;
      theme = t;
      applyStudioTheme();
      materials.setTheme(t);
      for (const cb of [...themeCbs]) cb(t);
      invalidate();
    },
    setView(position, target, animate = true) {
      if (disposed) return;
      const fromPos = camera.position.clone();
      const fromTarget = controls.target.clone();
      home.position.set(...position);
      home.target.set(...target);
      if (animate && !reduced) {
        flight = { t: 0, dur: 1.1, fromPos, fromTarget };
        lastSelfMs = performance.now();
      } else {
        flight = null;
        camera.position.copy(home.position);
        controls.target.copy(home.target);
        camera.lookAt(home.target);
        controls.update();
      }
      invalidate();
    },
    resetView() {
      flight = null;
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      camera.lookAt(home.target);
      controls.update();
      invalidate();
    },
    render() {
      if (disposed) return;
      const now = performance.now();
      const dt = lastFrameMs === 0 ? 0 : Math.min(0.1, (now - lastFrameMs) / 1000);
      lastFrameMs = now;
      draw(dt);
    },
    info() {
      const i = renderer.info;
      return {
        tier: settings.tier,
        post: composer !== null,
        passes: postPasses.map((p) => p.name),
        shadows: renderer.shadowMap.enabled,
        ibl: scene.environment !== null,
        pixelRatio: renderer.getPixelRatio(),
        memory: { ...i.memory },
        render: {
          calls: i.render.calls,
          triangles: i.render.triangles,
          lines: i.render.lines,
          points: i.render.points,
        },
        programs: i.programs?.length ?? 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (selfRaf !== null) cancelAnimationFrame(selfRaf);
      offQuality();
      offTheme();
      ro?.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      for (const d of disposables.splice(0).reverse()) d.dispose();
      updatables.clear();
      resizeCbs.clear();
      tierCbs.clear();
      themeCbs.clear();
      disposePost();
      dropEnv();
      scene.environment = null;
      scene.background = null;
      key.shadow.map?.dispose();
      key.shadow.map = null;
      materials.dispose();
      floorGeo.dispose();
      renderStats.liveGeometries--;
      floorMat.dispose();
      floorBasic.dispose();
      renderStats.liveMaterials -= 2;
      fadeTex.dispose();
      backdropTex?.dispose();
      floorTex?.dispose();
      floorBakedTex?.dispose();
      renderStats.liveTextures -= 4;
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderStats.liveRenderers--;
      renderStats.liveStages--;
      canvas.remove();
    },
  };
  renderStats.liveStages++;
  renderStats.createdStages++;
  return stage;
}
