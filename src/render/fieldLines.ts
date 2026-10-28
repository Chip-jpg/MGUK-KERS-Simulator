/**
 * Computed, animated magnetic field lines.
 *
 * `createFieldLines(stage)` takes a {@link TraceJob} (field model + seeds), traces
 * the lines with the RK4 tracer (`./trace`), and draws them as ONE draw call:
 * fat `LineSegments2` (alta / bilanciata) or 1-px GL lines (base).
 *
 * Animation: bright pulses travel along +B. Each vertex carries a "travel
 * coordinate" τ = ∫ ds · (B_ref / |B|); pulses advance uniformly in τ, so their
 * spatial speed is ∝ |B| locally (fast where lines crowd, slow where the field is
 * weak), times a global factor set by the sim (`setFlow(k)`, e.g. B / B_max).
 * Colour: the B-blue ramp, brighter where |B| is larger.
 *
 * If a synchronous trace takes longer than {@link WORKER_THRESHOLD_MS}, the
 * following traces run in a module Web Worker (results are versioned: stale
 * ones are dropped).
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { quantityColorHex } from '../ui/colors';
import type { Stage } from './stage';
import { renderStats } from './stats';
import { runTraceJob, type TraceJob, type TracedLine } from './trace';

export const WORKER_THRESHOLD_MS = 4;

export interface FieldLinesOptions {
  /** Pixel width of fat lines (default 2.4). */
  linewidth?: number;
  /** Pulse spacing in τ units (scene units at |B| = B_ref; default 1.1). */
  spacing?: number;
  /** τ units per second at flow factor 1 (default 0.9). */
  speed?: number;
  /** Base brightness between pulses (default 0.55) and pulse gain (default 1.8). */
  base?: number;
  gain?: number;
  opacity?: number;
}

export interface FieldLines {
  readonly object: THREE.Group;
  /** Trace (sync or in the worker) and show the lines. Resolves when visible. */
  setJob(job: TraceJob): Promise<void>;
  /** Global flow/brightness factor (e.g. B / B_max); 0 freezes the pulses. */
  setFlow(k: number): void;
  setVisible(v: boolean): void;
  /** Number of traced lines currently drawn. */
  readonly count: number;
  /** Duration of the last trace [ms] and where it ran. */
  readonly lastTrace: { ms: number; where: 'main' | 'worker' };
  readonly traced: readonly TracedLine[];
  dispose(): void;
}

/** Patch LineMaterial: replace hard dashes with soft travelling pulses. */
export function patchPulseShader(fs: string): string {
  return fs
    .replace(
      'uniform float linewidth;',
      'uniform float linewidth;\nuniform float uBase;\nuniform float uGain;',
    )
    .replace(
      /if \( mod\( vLineDistance \+ dashOffset, dashSize \+ gapSize \) > dashSize \) discard;[^\n]*/,
      `float kPhase = mod( vLineDistance + dashOffset, dashSize + gapSize ) / ( dashSize + gapSize );
				float kPulse = smoothstep( 0.05, 0.42, kPhase ) * ( 1.0 - smoothstep( 0.42, 0.5, kPhase ) );`,
    )
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n\t\t\tdiffuseColor.rgb *= ( uBase + uGain * kPulse );',
    );
}

const PLAIN_VS = /* glsl */ `
attribute float tau;
varying vec3 vColor;
varying float vTau;
void main() {
  vColor = color;
  vTau = tau;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const PLAIN_FS = /* glsl */ `
uniform float uOffset;
uniform float uPeriod;
uniform float uBase;
uniform float uGain;
uniform float uOpacity;
varying vec3 vColor;
varying float vTau;
void main() {
  float ph = mod( vTau + uOffset, uPeriod ) / uPeriod;
  float pulse = smoothstep( 0.05, 0.42, ph ) * ( 1.0 - smoothstep( 0.42, 0.5, ph ) );
  gl_FragColor = vec4( vColor * ( uBase + uGain * pulse ), uOpacity );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createFieldLines(stage: Stage, options: FieldLinesOptions = {}): FieldLines {
  const group = new THREE.Group();
  group.name = 'field-lines';
  stage.scene.add(group);
  const spacing = options.spacing ?? 1.1;
  const speed = options.speed ?? 0.9;
  const base = options.base ?? 0.55;
  const gain = options.gain ?? 1.8;
  const opacity = options.opacity ?? 0.95;
  let flow = 1;
  let offset = 0;
  let lines: TracedLine[] = [];
  let lastTrace: { ms: number; where: 'main' | 'worker' } = { ms: 0, where: 'main' };
  let version = 0;
  let worker: Worker | null = null;
  let disposed = false;
  const pending = new Map<number, (lines: TracedLine[]) => void>();

  let mesh: LineSegments2 | THREE.LineSegments | null = null;
  let fatMat: LineMaterial | null = null;
  let plainMat: THREE.ShaderMaterial | null = null;

  const disposeMesh = (): void => {
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
    renderStats.liveGeometries--;
    mesh = null;
  };
  const disposeMats = (): void => {
    if (fatMat) {
      fatMat.dispose();
      renderStats.liveMaterials--;
      fatMat = null;
    }
    if (plainMat) {
      plainMat.dispose();
      renderStats.liveMaterials--;
      plainMat = null;
    }
  };

  const ensureMaterial = (): void => {
    const fat = stage.settings.fatLines;
    if (fat && !fatMat) {
      disposeMats();
      fatMat = new LineMaterial({
        linewidth: options.linewidth ?? 2.4,
        vertexColors: true,
        dashed: true,
        dashSize: spacing * 0.5,
        gapSize: spacing * 0.5,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      fatMat.uniforms['uBase'] = { value: base };
      fatMat.uniforms['uGain'] = { value: gain };
      fatMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = patchPulseShader(shader.fragmentShader);
      };
      fatMat.customProgramCacheKey = () => 'kers-pulse-v1';
      fatMat.resolution.set(stage.width, stage.height);
      renderStats.liveMaterials++;
    } else if (!fat && !plainMat) {
      disposeMats();
      plainMat = new THREE.ShaderMaterial({
        vertexShader: PLAIN_VS,
        fragmentShader: PLAIN_FS,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uOffset: { value: 0 },
          uPeriod: { value: spacing },
          uBase: { value: base },
          uGain: { value: gain },
          uOpacity: { value: opacity },
        },
      });
      renderStats.liveMaterials++;
    }
  };

  const colourRamp = (
    rel: number,
    out: THREE.Color,
    bCol: THREE.Color,
    white: THREE.Color,
  ): void => {
    // rel = |B| / |B|_ref (≈ 1 in the uniform region); dim → full B blue → towards white.
    const r = Math.max(0, Math.min(1.6, rel));
    if (r <= 1) out.copy(bCol).multiplyScalar(0.3 + 0.7 * r);
    else out.copy(bCol).lerp(white, (r - 1) * 0.6);
  };

  const build = (): void => {
    disposeMesh();
    ensureMaterial();
    if (!lines.length) return;
    let segs = 0;
    for (const l of lines) segs += l.count - 1;
    const pos = new Float32Array(segs * 6);
    const col = new Float32Array(segs * 6);
    const tau = new Float32Array(segs * 2);
    const bCol = new THREE.Color(quantityColorHex('b', stage.theme));
    const white = new THREE.Color(0xffffff);
    const c = new THREE.Color();
    // reference |B|: median over all vertices (≈ the field in the region of interest)
    const all: number[] = [];
    for (const l of lines) for (let i = 0; i < l.count; i += 4) all.push(l.mags[i] as number);
    all.sort((a, b) => a - b);
    const ref = all[Math.floor(all.length / 2)] || 1;
    let s = 0;
    lines.forEach((l, li) => {
      let t = ((li * 0.618034) % 1) * spacing; // de-synchronise the pulses of different lines
      const tv = new Float32Array(l.count);
      tv[0] = t;
      for (let i = 1; i < l.count; i++) {
        const ds = (l.arc[i] as number) - (l.arc[i - 1] as number);
        const m = 0.5 * ((l.mags[i] as number) + (l.mags[i - 1] as number));
        t += ds * (ref / Math.max(m, ref * 0.05));
        tv[i] = t;
      }
      for (let i = 0; i < l.count - 1; i++, s++) {
        for (let e = 0; e < 2; e++) {
          const k = i + e;
          pos[6 * s + 3 * e] = l.points[3 * k] as number;
          pos[6 * s + 3 * e + 1] = l.points[3 * k + 1] as number;
          pos[6 * s + 3 * e + 2] = l.points[3 * k + 2] as number;
          colourRamp((l.mags[k] as number) / ref, c, bCol, white);
          col[6 * s + 3 * e] = c.r;
          col[6 * s + 3 * e + 1] = c.g;
          col[6 * s + 3 * e + 2] = c.b;
          tau[2 * s + e] = tv[k] as number;
        }
      }
    });
    if (fatMat) {
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      g.setColors(col);
      const ib = new THREE.InstancedInterleavedBuffer(tau, 2, 1);
      g.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(ib, 1, 0));
      g.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(ib, 1, 1));
      const m = new LineSegments2(g, fatMat);
      m.frustumCulled = false;
      mesh = m;
    } else if (plainMat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('tau', new THREE.BufferAttribute(tau, 1));
      mesh = new THREE.LineSegments(g, plainMat);
    }
    if (mesh) {
      mesh.renderOrder = 2;
      group.add(mesh);
      renderStats.liveGeometries++;
    }
  };

  const traceInWorker = (job: TraceJob, id: number): Promise<TracedLine[]> => {
    if (!worker) {
      worker = new Worker(new URL('./fieldTrace.worker.ts', import.meta.url), { type: 'module' });
      renderStats.liveWorkers++;
      worker.onmessage = (e: MessageEvent<{ id: number; lines: TracedLine[] }>) => {
        pending.get(e.data.id)?.(e.data.lines);
        pending.delete(e.data.id);
      };
    }
    return new Promise((resolve) => {
      pending.set(id, resolve);
      worker?.postMessage({ id, job });
    });
  };

  const offResize = stage.onResize((w, h) => fatMat?.resolution.set(w, h));
  const offTier = stage.onTierChange(() => build());
  const offTheme = stage.onThemeChange(() => build());
  const offUpdate = stage.addUpdatable({
    update(dt) {
      offset -= dt * speed * flow;
      if (offset < -1e4) offset = 0;
      if (fatMat) fatMat.dashOffset = offset;
      if (plainMat) (plainMat.uniforms['uOffset'] as { value: number }).value = offset;
      const k = Math.max(0, Math.min(1.2, flow));
      if (fatMat) fatMat.opacity = opacity * (0.55 + 0.45 * Math.min(1, k));
      if (plainMat)
        (plainMat.uniforms['uOpacity'] as { value: number }).value =
          opacity * (0.55 + 0.45 * Math.min(1, k));
    },
  });

  return {
    object: group,
    async setJob(job) {
      const id = ++version;
      const useWorker = lastTrace.ms > WORKER_THRESHOLD_MS && typeof Worker !== 'undefined';
      const t0 = performance.now();
      const result = useWorker ? await traceInWorker(job, id) : runTraceJob(job);
      if (disposed || id !== version) return;
      lastTrace = { ms: performance.now() - t0, where: useWorker ? 'worker' : 'main' };
      lines = result;
      build();
    },
    setFlow(k) {
      flow = Number.isFinite(k) ? k : 0;
    },
    setVisible(v) {
      group.visible = v;
    },
    get count() {
      return lines.length;
    },
    get lastTrace() {
      return lastTrace;
    },
    get traced() {
      return lines;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offResize();
      offTier();
      offTheme();
      offUpdate();
      disposeMesh();
      disposeMats();
      if (worker) {
        worker.terminate();
        worker = null;
        renderStats.liveWorkers--;
      }
      pending.clear();
      stage.scene.remove(group);
    },
  };
}
