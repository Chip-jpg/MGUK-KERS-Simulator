/**
 * Crisp HTML labels projected from 3D anchors onto the scene overlay.
 *
 * - Position: the anchor (a live `Vector3` the sim may mutate) is projected every
 *   frame; only `transform`/`opacity` are written (no layout thrash: sizes are
 *   measured once per text change).
 * - Occlusion: every 4th frame a ray from the camera to the anchor is tested
 *   against `stage.occluders`; hidden anchors fade to 25 % opacity.
 * - Collisions: labels are placed by descending priority; a label overlapping an
 *   already placed one, or an obstacle, is nudged vertically (±1…4 label heights)
 *   and then sideways to the first free slot. When no slot is free the label is
 *   DROPPED for that frame (never stacked on another label): every label placed
 *   before it has a higher or equal priority, so the essential ones survive.
 * - Obstacles: the other boxes drawn over the canvas (legends, HUD, status
 *   badges: every visible non-label child of the overlay and of the scene box,
 *   except the canvas and elements marked `data-label-pass`) are measured every
 *   10th frame and on resize; labels never sit on them (QA-031, QA-039).
 * - Off-screen / behind-camera anchors are hidden.
 * - No per-frame allocations: items are kept sorted by priority when added
 *   (stable: equal priorities keep their insertion order), placed rectangles come
 *   from a pool, and styles are written only when they change.
 * - Fast path: with `{ occlude: false }` on the layer (or when no label asks for it,
 *   or there are no occluders) no ray is ever cast.
 */
import * as THREE from 'three';
import type { Quantity } from '../ui/colors';
import './labels.css';
import type { Stage } from './stage';

export interface LabelOptions {
  text: string;
  anchor: THREE.Vector3;
  /** Quantity colour accent (left bar + text colour). */
  quantity?: Quantity | 'accent' | 'neutral';
  /** Higher = placed first, never moved (default 0). */
  priority?: number;
  /** Screen offset [px] from the projected anchor (default [0, 0]). */
  offset?: [number, number];
  /** Occlusion test (default true). */
  occlude?: boolean;
  /** Visual size: 'md' (default) | 'sm' | 'lg'. */
  size?: 'sm' | 'md' | 'lg';
}

export interface Label {
  readonly element: HTMLElement;
  readonly anchor: THREE.Vector3;
  setText(text: string): void;
  setVisible(v: boolean): void;
  setOffset(x: number, y: number): void;
}

export interface LabelLayerOptions {
  /** Occlusion tests for this layer (default true); false = never cast a ray. */
  occlude?: boolean;
}

export interface LabelLayer {
  add(o: LabelOptions): Label;
  /** Number of labels and how many were nudged / dropped in the last frame (debug). */
  stats(): {
    labels: number;
    nudged: number;
    occluded: number;
    overlaps: number;
    dropped: number;
    obstacles: number;
  };
  dispose(): void;
}

interface Item {
  el: HTMLElement;
  anchor: THREE.Vector3;
  priority: number;
  offset: [number, number];
  occlude: boolean;
  visible: boolean;
  text: string;
  w: number;
  h: number;
  dirty: boolean;
  occluded: boolean;
  shownX: number;
  shownY: number;
  /** Last written `display` ('' or 'none') and opacity, to skip redundant style writes. */
  shownDisplay: string;
  shownOpacity: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Insert `it` into `items` (sorted by descending priority, stable for equal priorities). */
export function insertByPriority<T extends { priority: number }>(items: T[], it: T): void {
  let k = items.length;
  while (k > 0 && (items[k - 1] as T).priority < it.priority) k--;
  items.splice(k, 0, it);
}

export function createLabelLayer(
  stage: Stage,
  overlay: HTMLElement,
  layerOptions: LabelLayerOptions = {},
): LabelLayer {
  const items: Item[] = []; // sorted by descending priority (insertByPriority)
  const layerOcclude = layerOptions.occlude ?? true;
  let occluding = 0; // labels that ask for the occlusion test
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const hits: THREE.Intersection[] = [];
  let frame = 0;
  let lastNudged = 0;
  let lastOccluded = 0;
  let lastDropped = 0;
  const placed: Rect[] = []; // pool; the first `nPlaced` are valid this frame
  let nPlaced = 0;
  const obstacles: Rect[] = []; // pool; the first `nObstacles` are valid
  let nObstacles = 0;
  let obstaclesDirty = true;
  const rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  const hit = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
  const overlaps = (a: Rect): boolean => {
    for (let k = 0; k < nObstacles; k++) if (hit(a, obstacles[k] as Rect)) return true;
    for (let k = 0; k < nPlaced; k++) if (hit(a, placed[k] as Rect)) return true;
    return false;
  };
  const pushRect = (pool: Rect[], n: number, x: number, y: number, w: number, h: number): void => {
    let r = pool[n];
    if (!r) {
      r = { x: 0, y: 0, w: 0, h: 0 };
      pool.push(r);
    }
    r.x = x;
    r.y = y;
    r.w = w;
    r.h = h;
  };
  const place = (a: Rect): void => {
    pushRect(placed, nPlaced, a.x, a.y, a.w, a.h);
    nPlaced++;
  };
  /** Measure the boxes drawn over the canvas (legend, HUD, badges) as label obstacles. */
  const scanObstacles = (parent: Element | null, ox: number, oy: number): void => {
    if (!parent) return;
    for (let k = 0; k < parent.children.length; k++) {
      const c = parent.children[k] as HTMLElement;
      if (
        c === overlay ||
        c.tagName === 'CANVAS' ||
        c.classList.contains('r-label') ||
        c.classList.contains('sim-placeholder') ||
        c.hasAttribute('data-label-pass') ||
        c.hidden
      )
        continue;
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      pushRect(obstacles, nObstacles, r.left - ox, r.top - oy, r.width, r.height);
      nObstacles++;
    }
  };
  const refreshObstacles = (): void => {
    nObstacles = 0;
    const o = overlay.getBoundingClientRect();
    scanObstacles(overlay, o.left, o.top);
    scanObstacles(overlay.parentElement, o.left, o.top);
    obstaclesDirty = false;
  };
  /** Clamp `rect` at (x, y) inside the canvas; true when it is free. */
  const tryAt = (x: number, y: number, W: number, H: number): boolean => {
    rect.x = Math.min(Math.max(2, x), W - rect.w - 2);
    rect.y = Math.min(Math.max(2, y), H - rect.h - 2);
    return !overlaps(rect);
  };
  const setDisplay = (it: Item, d: string): void => {
    if (it.shownDisplay !== d) {
      it.el.style.display = d;
      it.shownDisplay = d;
    }
  };

  const update = (): void => {
    frame++;
    const W = stage.width;
    const H = stage.height;
    // measure pass (reads only)
    for (const it of items) {
      if (it.dirty && it.visible) {
        setDisplay(it, ''); // a hidden element measures 0 × 0
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
        it.dirty = false;
      }
    }
    const testOcclusion =
      layerOcclude && occluding > 0 && frame % 4 === 0 && stage.occluders.length > 0;
    if (obstaclesDirty || frame % 10 === 1) refreshObstacles();
    nPlaced = 0;
    let nudged = 0;
    let dropped = 0;
    let occludedN = 0;
    for (let n = 0; n < items.length; n++) {
      const it = items[n] as Item;
      if (!it.visible) {
        setDisplay(it, 'none');
        continue;
      }
      v.copy(it.anchor).project(stage.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) {
        setDisplay(it, 'none');
        continue;
      }
      const cx = ((v.x + 1) / 2) * W + it.offset[0];
      const cy = ((1 - v.y) / 2) * H + it.offset[1];
      rect.w = it.w;
      rect.h = it.h;
      const x0 = cx - it.w / 2;
      const y0 = cy - it.h / 2;
      let ok = tryAt(x0, y0, W, H);
      if (!ok) {
        nudged++;
        // vertical nudges first (±1…4 label heights), then sideways (± half / one width)
        for (let k = 1; k <= 4 && !ok; k++) {
          ok = tryAt(x0, y0 - k * (it.h + 4), W, H) || tryAt(x0, y0 + k * (it.h + 4), W, H);
        }
        for (let j = 1; j <= 2 && !ok; j++) {
          const dx = j * (it.w / 2 + 6);
          for (let k = 0; k <= 2 && !ok; k++) {
            const dy = k * (it.h + 4);
            ok =
              tryAt(x0 + dx, y0 - dy, W, H) ||
              tryAt(x0 - dx, y0 - dy, W, H) ||
              tryAt(x0 + dx, y0 + dy, W, H) ||
              tryAt(x0 - dx, y0 + dy, W, H);
          }
        }
      }
      if (!ok) {
        // no free slot: drop this (lower-priority) label instead of stacking it
        setDisplay(it, 'none');
        dropped++;
        continue;
      }
      setDisplay(it, '');
      place(rect);
      if (!layerOcclude || !it.occlude) it.occluded = false;
      else if (testOcclusion) {
        dir.copy(it.anchor).sub(stage.camera.position);
        const dist = dir.length();
        ray.set(stage.camera.position, dir.normalize());
        ray.far = dist - 0.08;
        hits.length = 0;
        it.occluded = ray.intersectObjects(stage.occluders, true, hits).length > 0;
      }
      if (it.occluded) occludedN++;
      const x = Math.round(rect.x * 2) / 2;
      const y = Math.round(rect.y * 2) / 2;
      if (x !== it.shownX || y !== it.shownY) {
        it.el.style.transform = `translate(${x}px, ${y}px)`;
        it.shownX = x;
        it.shownY = y;
      }
      const op = it.occluded ? '0.25' : '1';
      if (op !== it.shownOpacity) {
        it.el.style.opacity = op;
        it.shownOpacity = op;
      }
    }
    lastNudged = nudged;
    lastOccluded = occludedN;
    lastDropped = dropped;
  };

  const offUpdate = stage.addUpdatable({ update });
  const offResize = stage.onResize(() => {
    for (const it of items) it.dirty = true;
    obstaclesDirty = true;
  });

  return {
    add(o) {
      const el = document.createElement('span');
      el.className = `r-label r-label--${o.quantity ?? 'neutral'} r-label--${o.size ?? 'md'}`;
      el.textContent = o.text;
      overlay.append(el);
      const it: Item = {
        el,
        anchor: o.anchor,
        priority: o.priority ?? 0,
        offset: o.offset ?? [0, 0],
        occlude: o.occlude ?? true,
        visible: true,
        text: o.text,
        w: 0,
        h: 0,
        dirty: true,
        occluded: false,
        shownX: Number.NaN,
        shownY: Number.NaN,
        shownDisplay: '',
        shownOpacity: '',
      };
      insertByPriority(items, it);
      if (it.occlude) occluding++;
      return {
        element: el,
        anchor: o.anchor,
        setText(t) {
          if (t === it.text) return;
          it.text = t;
          el.textContent = t;
          it.dirty = true;
        },
        setVisible(b) {
          if (b && !it.visible) it.dirty = true;
          it.visible = b;
        },
        setOffset(x, y) {
          it.offset = [x, y];
        },
      };
    },
    stats: () => ({
      labels: items.length,
      nudged: lastNudged,
      occluded: lastOccluded,
      overlaps: 0, // a label is dropped rather than left overlapping
      dropped: lastDropped,
      obstacles: nObstacles,
    }),
    dispose() {
      offUpdate();
      offResize();
      for (const it of items) it.el.remove();
      items.length = 0;
      placed.length = 0;
      obstacles.length = 0;
      nObstacles = 0;
      occluding = 0;
    },
  };
}
