// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLabelLayer, insertByPriority } from '../../src/render/labels';
import { fakeStage } from './fakeStage';

// jsdom has no layout: give every label a fixed size.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 60 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });

afterEach(() => vi.restoreAllMocks());

const y = (el: HTMLElement): number =>
  Number(/translate\([-\d.]+px, ([-\d.]+)px\)/.exec(el.style.transform)?.[1]);

describe('insertByPriority', () => {
  it('keeps descending priority, stable for equal priorities', () => {
    const items: Array<{ priority: number; id: string }> = [];
    for (const [p, id] of [
      [1, 'a'],
      [5, 'b'],
      [1, 'c'],
      [9, 'd'],
      [5, 'e'],
    ] as const)
      insertByPriority(items, { priority: p, id });
    expect(items.map((i) => i.id).join('')).toBe('dbeac');
  });
});

describe('createLabelLayer', () => {
  it('places by priority (high stays put, low is nudged) and hides off-screen anchors', () => {
    const { stage, fire } = fakeStage();
    const overlay = document.createElement('div');
    const layer = createLabelLayer(stage, overlay);
    const low = layer.add({ text: 'low', anchor: new THREE.Vector3(0, 0, 0), priority: 1 });
    const high = layer.add({ text: 'high', anchor: new THREE.Vector3(0, 0, 0), priority: 9 });
    const off = layer.add({ text: 'off', anchor: new THREE.Vector3(0, 0, 50) }); // behind camera
    fire.frame(0.016);
    expect(y(high.element)).toBe(300 - 10);
    expect(Math.abs(y(low.element) - y(high.element))).toBeGreaterThanOrEqual(20);
    expect(off.element.style.display).toBe('none');
    expect(layer.stats()).toMatchObject({ labels: 3, nudged: 1, overlaps: 0 });
    // hidden label → display none; shown again → measured and placed
    high.setVisible(false);
    fire.frame(0.016);
    expect(high.element.style.display).toBe('none');
    high.setVisible(true);
    fire.frame(0.016);
    expect(high.element.style.display).toBe('');
    layer.dispose();
    expect(overlay.childElementCount).toBe(0);
  });

  it('occlusion: tested every 4th frame; occlude:false label and layer never cast rays', () => {
    const { stage, fire } = fakeStage();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    wall.position.z = 2;
    wall.updateMatrixWorld();
    stage.occluders.push(wall);
    const spy = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects');

    const overlay = document.createElement('div');
    const fast = createLabelLayer(stage, overlay, { occlude: false });
    const a = fast.add({ text: 'a', anchor: new THREE.Vector3(0, 0, 0) });
    for (let k = 0; k < 8; k++) fire.frame(0.016);
    expect(spy).not.toHaveBeenCalled();
    expect(a.element.style.opacity).toBe('1');
    fast.dispose();

    const layer = createLabelLayer(stage, overlay);
    const noOcc = layer.add({ text: 'n', anchor: new THREE.Vector3(1, 0, 0), occlude: false });
    for (let k = 0; k < 8; k++) fire.frame(0.016);
    expect(spy).not.toHaveBeenCalled(); // no label asks for occlusion
    const hid = layer.add({ text: 'h', anchor: new THREE.Vector3(-1, 0, 0) });
    for (let k = 0; k < 4; k++) fire.frame(0.016);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(hid.element.style.opacity).toBe('0.25');
    expect(noOcc.element.style.opacity).toBe('1');
    expect(layer.stats().occluded).toBe(1);
    layer.dispose();
  });

  it('treats legend / HUD boxes as obstacles and drops low-priority labels with no free slot', () => {
    const { stage, fire } = fakeStage();
    const scene = document.createElement('div');
    const overlay = document.createElement('div');
    scene.append(overlay);
    const rect = (x: number, y: number, w: number, h: number): DOMRect =>
      ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;
    overlay.getBoundingClientRect = () => rect(0, 0, 800, 600);
    // a legend in the overlay covering the centre band, and a badge in the scene box
    const legend = document.createElement('div');
    legend.getBoundingClientRect = () => rect(300, 260, 200, 80);
    overlay.append(legend);
    const badge = document.createElement('div');
    badge.getBoundingClientRect = () => rect(0, 0, 800, 40);
    scene.append(badge);
    const passed = document.createElement('div');
    passed.dataset['labelPass'] = '';
    passed.getBoundingClientRect = () => rect(0, 0, 800, 600);
    overlay.append(passed);

    const layer = createLabelLayer(stage, overlay, { occlude: false });
    const a = layer.add({ text: 'a', anchor: new THREE.Vector3(0, 0, 0), priority: 5 });
    fire.frame(0.016);
    expect(layer.stats().obstacles).toBe(2); // legend + badge, not the marked element
    const ya = y(a.element);
    // moved off the legend (260…340), label is 20 px tall
    expect(ya + 20 <= 260 - 3 || ya >= 340 + 3).toBe(true);
    expect(ya).toBeGreaterThanOrEqual(40); // and not under the badge

    // Fill the canvas with high-priority labels: a low-priority one must be dropped, never stacked.
    const many = [];
    for (let k = 0; k < 200; k++)
      many.push(layer.add({ text: `x${k}`, anchor: new THREE.Vector3(0, 0, 0), priority: 3 }));
    const low = layer.add({ text: 'low', anchor: new THREE.Vector3(0, 0, 0), priority: 0 });
    fire.frame(0.016);
    expect(low.element.style.display).toBe('none');
    expect(layer.stats().dropped).toBeGreaterThan(0);
    expect(a.element.style.display).toBe(''); // the highest priority survives
    layer.dispose();
  });

  it('writes styles only when they change (no per-frame churn)', () => {
    const { stage, fire } = fakeStage();
    const overlay = document.createElement('div');
    const layer = createLabelLayer(stage, overlay, { occlude: false });
    const l = layer.add({ text: 't', anchor: new THREE.Vector3(0.5, 0.5, 0) });
    fire.frame(0.016);
    const writes: string[] = [];
    const style = l.element.style;
    const proxyTarget = Object.getPrototypeOf(style) as object;
    const desc = Object.getOwnPropertyDescriptor(proxyTarget, 'transform');
    if (desc?.set) {
      vi.spyOn(style, 'transform', 'set').mockImplementation((v: string) => writes.push(v));
    }
    for (let k = 0; k < 5; k++) fire.frame(0.016);
    expect(writes).toEqual([]);
    l.setText('changed');
    expect(l.element.textContent).toBe('changed');
    layer.dispose();
  });
});
