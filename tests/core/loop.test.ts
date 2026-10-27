import { describe, expect, it } from 'vitest';
import { createLoop, type LoopEnv } from '../../src/core/loop';
import { PHYSICS_DT } from '../../src/physics';

/** Deterministic fake browser: frames fire only when the test calls tick(). */
function fakeEnv() {
  let time = 0;
  let nextId = 1;
  let pending: { id: number; cb: (t: number) => void } | null = null;
  let hidden = false;
  const visHandlers = new Set<() => void>();
  const env: LoopEnv = {
    now: () => time,
    requestFrame(cb) {
      pending = { id: nextId++, cb };
      return pending.id;
    },
    cancelFrame(id) {
      if (pending?.id === id) pending = null;
    },
    isHidden: () => hidden,
    onVisibilityChange(cb) {
      visHandlers.add(cb);
      return () => visHandlers.delete(cb);
    },
  };
  return {
    env,
    /** Advance the clock by `ms` and fire the pending frame, if any. */
    tick(ms: number) {
      time += ms;
      const p = pending;
      pending = null;
      p?.cb(time);
    },
    setHidden(h: boolean) {
      hidden = h;
      visHandlers.forEach((cb) => cb());
    },
    get scheduled() {
      return pending !== null;
    },
    get visListeners() {
      return visHandlers.size;
    },
  };
}

function counters() {
  const c = { steps: 0, renders: 0, simTime: 0 };
  return {
    c,
    callbacks: {
      step(dt: number) {
        c.steps++;
        c.simTime += dt;
      },
      render() {
        c.renders++;
      },
    },
  };
}

describe('createLoop', () => {
  it('advances physics in fixed 1/240 s steps (4 per 60 Hz frame)', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    for (let i = 0; i < 60; i++) f.tick(1000 / 60);
    expect(c.renders).toBe(60);
    expect(c.steps).toBeGreaterThanOrEqual(239);
    expect(c.steps).toBeLessThanOrEqual(240);
    expect(c.simTime).toBeCloseTo(c.steps * PHYSICS_DT, 12);
    loop.dispose();
  });

  it('caps rendering at 60 fps on a 144 Hz display', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    for (let i = 0; i < 144; i++) f.tick(1000 / 144); // one second
    expect(c.renders).toBeGreaterThanOrEqual(46);
    expect(c.renders).toBeLessThanOrEqual(61); // ≈60, ±1 frame of timing tolerance
    // physics time still tracks wall time
    expect(c.steps).toBeGreaterThanOrEqual(230);
    expect(c.steps).toBeLessThanOrEqual(240);
    loop.dispose();
  });

  it('auto-pauses while the document is hidden and does not catch up afterwards', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    f.tick(1000 / 60);
    f.setHidden(true);
    expect(f.scheduled).toBe(false);
    expect(loop.isRunning()).toBe(false);
    f.tick(10_000);
    const stepsWhileHidden = c.steps;
    f.setHidden(false);
    expect(loop.isRunning()).toBe(true);
    f.tick(1000 / 60);
    expect(c.steps - stepsWhileHidden).toBeLessThanOrEqual(5);
    loop.dispose();
  });

  it('user pause survives visibility changes; stepOnce advances one step', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    loop.pause();
    f.setHidden(true);
    f.setHidden(false);
    expect(loop.isRunning()).toBe(false);
    loop.stepOnce();
    expect(c.steps).toBe(1);
    expect(c.renders).toBe(1);
    loop.resume();
    expect(loop.isRunning()).toBe(true);
    loop.dispose();
  });

  it('dispose stops the RAF and removes the visibility listener', () => {
    const f = fakeEnv();
    const { callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    expect(f.visListeners).toBe(1);
    loop.dispose();
    expect(f.scheduled).toBe(false);
    expect(f.visListeners).toBe(0);
    loop.resume();
    expect(f.scheduled).toBe(false);
  });
});
