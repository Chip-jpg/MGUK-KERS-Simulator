import { afterEach, describe, expect, it } from 'vitest';
import { createLoop, minFrameInterval, onLoopFrame, type LoopEnv } from '../../src/core/loop';
import { resetSettingsForTests, setFpsLimit } from '../../src/core/settings';
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

afterEach(() => resetSettingsForTests());

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

  it('caps rendering at 60 fps on a 144 Hz display when maxFps = 60', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env, maxFps: 60 });
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

  it('is uncapped by default: renders on every animation frame (144 Hz → 144 fps)', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    for (let i = 0; i < 144; i++) f.tick(1000 / 144);
    expect(c.renders).toBe(144);
    expect(c.steps).toBeGreaterThanOrEqual(239);
    expect(c.steps).toBeLessThanOrEqual(240);
    loop.dispose();
  });

  it('caps at 30 fps with maxFps = 30 on a 60 Hz display', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env, maxFps: 30 });
    for (let i = 0; i < 60; i++) f.tick(1000 / 60);
    expect(c.renders).toBeGreaterThanOrEqual(29);
    expect(c.renders).toBeLessThanOrEqual(31);
    loop.dispose();
  });

  it('follows the FPS-limit setting live (auto → 30 → 60 → auto)', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    const second = (): number => {
      const before = c.renders;
      for (let i = 0; i < 120; i++) f.tick(1000 / 120);
      return c.renders - before;
    };
    expect(second()).toBe(120);
    setFpsLimit(30);
    expect(second()).toBeGreaterThanOrEqual(29);
    expect(c.renders).toBeGreaterThan(0);
    setFpsLimit(60);
    const r60 = second();
    expect(r60).toBeGreaterThanOrEqual(59);
    expect(r60).toBeLessThanOrEqual(61);
    setFpsLimit('auto');
    expect(second()).toBe(120);
    loop.dispose();
  });

  it('an explicit maxFps ignores the setting', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    setFpsLimit(30);
    const loop = createLoop(callbacks, { env: f.env, maxFps: Number.POSITIVE_INFINITY });
    for (let i = 0; i < 60; i++) f.tick(1000 / 60);
    expect(c.renders).toBe(60);
    loop.dispose();
  });

  it('is deterministic: same simulated steps and states whatever the frame rate', () => {
    const run = (hz: number, maxFps?: number): number[] => {
      const f = fakeEnv();
      let x = 1;
      const xs: number[] = [];
      const loop = createLoop(
        {
          step(dt) {
            x += -0.7 * x * dt; // deterministic integrator
            xs.push(x);
          },
          render() {},
        },
        { env: f.env, ...(maxFps ? { maxFps } : {}) },
      );
      for (let i = 0; i < 2 * hz; i++) f.tick(1000 / hz); // 2 s of wall time
      f.tick(1); // 1 ms tail so float noise cannot lose a step
      loop.dispose();
      return xs;
    };
    const ref = run(240);
    expect(ref.length).toBe(480);
    for (const [hz, cap] of [[30], [60], [144], [165], [60, 30], [144, 60]] as const) {
      const xs = run(hz, cap);
      const label = `${hz} Hz cap ${cap ?? '—'}`;
      if (!cap) expect(xs.length, label).toBe(ref.length);
      // with a cap the last skipped frame's time is consumed by the next rendered frame
      const slack = cap ? Math.ceil(240 / cap) : 0;
      expect(Math.abs(xs.length - ref.length), label).toBeLessThanOrEqual(slack);
      const n = Math.min(xs.length, ref.length);
      expect(xs.slice(0, n), label).toEqual(ref.slice(0, n)); // identical states step by step
    }
  });

  it('guards against the spiral of death: maxFrameTime and maxStepsPerFrame', () => {
    const f = fakeEnv();
    const { c, callbacks } = counters();
    const loop = createLoop(callbacks, { env: f.env });
    f.tick(16);
    const before = c.steps;
    f.tick(5000); // a 5 s hitch simulates at most 0.25 s (60 steps)
    expect(c.steps - before).toBeLessThanOrEqual(61);
    expect(c.steps - before).toBeGreaterThanOrEqual(59);
    loop.dispose();

    const g = fakeEnv();
    const k = counters();
    const capped = createLoop(k.callbacks, { env: g.env, maxStepsPerFrame: 8 });
    g.tick(100); // 24 steps due, 8 allowed, backlog dropped
    expect(k.c.steps).toBe(8);
    g.tick(1000 / 240 + 0.01);
    expect(k.c.steps).toBe(9);
    capped.dispose();
  });

  it('reports every rendered frame to onFrame and onLoopFrame listeners', () => {
    const f = fakeEnv();
    const { callbacks } = counters();
    const own: number[] = [];
    const global: number[] = [];
    const off = onLoopFrame((t) => global.push(t));
    const loop = createLoop(callbacks, { env: f.env, maxFps: 30, onFrame: (t) => own.push(t) });
    for (let i = 0; i < 60; i++) f.tick(1000 / 60);
    expect(own.length).toBeGreaterThanOrEqual(29);
    expect(own.length).toBeLessThanOrEqual(31);
    expect(global).toEqual(own);
    off();
    loop.dispose();
  });

  it('minFrameInterval maps caps to intervals (Infinity/0 → uncapped)', () => {
    expect(minFrameInterval(60)).toBeCloseTo(16.667, 2);
    expect(minFrameInterval(Number.POSITIVE_INFINITY)).toBe(0);
    expect(minFrameInterval(0)).toBe(0);
  });
});
