/**
 * Crisp HTML labels projected from 3D anchors onto the scene overlay.
 *
 * - Position: the anchor (a live `Vector3` the sim may mutate) is projected every
 *   frame; only `transform`/`opacity` are written (no layout thrash: sizes are
 *   measured once per text change).
 * - Occlusion: every 4th frame a ray from the camera to the anchor is tested
 *   against `stage.occluders`; hidden anchors fade to 25 % opacity.
 * - Collisions: labels are placed by descending priority; a label overlapping an
 *   already placed one is nudged vertically (±1…4 label heights) to the first
 *   free slot, so labels never sit on top of each other.
 * - Off-screen / behind-camera anchors are hidden.
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

export interface LabelLayer {
  add(o: LabelOptions): Label;
  /** Number of labels and how many were nudged in the last frame (debug). */
  stats(): { labels: number; nudged: number; occluded: number; overlaps: number };
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
}

export function createLabelLayer(stage: Stage, overlay: HTMLElement): LabelLayer {
  const items: Item[] = [];
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let frame = 0;
  let lastNudged = 0;
  let lastOccluded = 0;
  let lastOverlaps = 0;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  const overlaps = (a: { x: number; y: number; w: number; h: number }): boolean => {
    for (const b of placed) {
      if (a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y)
        return true;
    }
    return false;
  };

  const update = (): void => {
    frame++;
    const W = stage.width;
    const H = stage.height;
    // measure pass (reads only)
    for (const it of items) {
      if (it.dirty && it.visible) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
        it.dirty = false;
      }
    }
    const testOcclusion = frame % 4 === 0 && stage.occluders.length > 0;
    placed.length = 0;
    let nudged = 0;
    let occludedN = 0;
    let overlapsLeft = 0;
    const order = [...items].sort((a, b) => b.priority - a.priority);
    for (const it of order) {
      if (!it.visible) {
        it.el.style.display = 'none';
        continue;
      }
      v.copy(it.anchor).project(stage.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = '';
      const cx = ((v.x + 1) / 2) * W + it.offset[0];
      const cy = ((1 - v.y) / 2) * H + it.offset[1];
      const rect = { x: cx - it.w / 2, y: cy - it.h / 2, w: it.w, h: it.h };
      rect.x = Math.min(Math.max(2, rect.x), W - it.w - 2);
      rect.y = Math.min(Math.max(2, rect.y), H - it.h - 2);
      if (overlaps(rect)) {
        const y0 = rect.y;
        let ok = false;
        for (let k = 1; k <= 4 && !ok; k++) {
          for (const s of [-1, 1]) {
            rect.y = Math.min(Math.max(2, y0 + s * k * (it.h + 4)), H - it.h - 2);
            if (!overlaps(rect)) {
              ok = true;
              break;
            }
          }
        }
        if (!ok) {
          rect.y = y0;
          overlapsLeft++;
        }
        nudged++;
      }
      placed.push({ ...rect });
      if (testOcclusion && it.occlude) {
        dir.copy(it.anchor).sub(stage.camera.position);
        const dist = dir.length();
        ray.set(stage.camera.position, dir.normalize());
        ray.far = dist - 0.08;
        it.occluded = ray.intersectObjects(stage.occluders, true).length > 0;
      }
      if (it.occluded) occludedN++;
      const x = Math.round(rect.x * 2) / 2;
      const y = Math.round(rect.y * 2) / 2;
      if (x !== it.shownX || y !== it.shownY) {
        it.el.style.transform = `translate(${x}px, ${y}px)`;
        it.shownX = x;
        it.shownY = y;
      }
      it.el.style.opacity = it.occluded ? '0.25' : '1';
    }
    lastNudged = nudged;
    lastOccluded = occludedN;
    lastOverlaps = overlapsLeft;
  };

  const offUpdate = stage.addUpdatable({ update });
  const offResize = stage.onResize(() => {
    for (const it of items) it.dirty = true;
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
      };
      items.push(it);
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
      overlaps: lastOverlaps,
    }),
    dispose() {
      offUpdate();
      offResize();
      for (const it of items) it.el.remove();
      items.length = 0;
    },
  };
}
