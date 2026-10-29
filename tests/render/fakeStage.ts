/**
 * Minimal stand-in for a render-foundation `Stage` (no WebGL): enough for the
 * helpers that only add objects to the scene and subscribe to stage events.
 * `fire.theme / tier / frame` drive the subscriptions from a test.
 */
import * as THREE from 'three';
import type { Theme } from '../../src/core/types';
import { tierSettings, type QualityTier } from '../../src/render/quality';
import type { Stage, Updatable } from '../../src/render/stage';

export interface FakeStage {
  stage: Stage;
  fire: {
    theme(t: Theme): void;
    tier(t: QualityTier): void;
    frame(dt: number): void;
  };
}

export function fakeStage(theme: Theme = 'dark', tier: QualityTier = 'base'): FakeStage {
  const themeCbs = new Set<(t: Theme) => void>();
  const tierCbs = new Set<(s: ReturnType<typeof tierSettings>) => void>();
  const resizeCbs = new Set<(w: number, h: number) => void>();
  const ups = new Set<Updatable>();
  const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const st = {
    scene: new THREE.Scene(),
    camera,
    theme,
    tier,
    settings: tierSettings(tier),
    width: 800,
    height: 600,
    occluders: [] as THREE.Object3D[],
    onThemeChange(cb: (t: Theme) => void) {
      themeCbs.add(cb);
      return () => themeCbs.delete(cb);
    },
    onTierChange(cb: (s: ReturnType<typeof tierSettings>) => void) {
      tierCbs.add(cb);
      return () => tierCbs.delete(cb);
    },
    onResize(cb: (w: number, h: number) => void) {
      resizeCbs.add(cb);
      return () => resizeCbs.delete(cb);
    },
    addUpdatable(u: Updatable) {
      ups.add(u);
      return () => ups.delete(u);
    },
  };
  return {
    stage: st as unknown as Stage,
    fire: {
      theme(t) {
        st.theme = t;
        for (const cb of themeCbs) cb(t);
      },
      tier(t) {
        st.tier = t;
        st.settings = tierSettings(t);
        for (const cb of tierCbs) cb(st.settings);
      },
      frame(dt) {
        for (const u of ups) u.update(dt);
      },
    },
  };
}
