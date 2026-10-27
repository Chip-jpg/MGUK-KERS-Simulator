import { PHYSICS_DT } from '../physics';
import type { Disposable } from './types';

/**
 * Render-loop helper implementing the §4.1 contract:
 *  - physics advances in fixed steps of dt = 1/240 s via an accumulator
 *    (deterministic, independent of the display refresh rate);
 *  - rendering happens at most `maxFps` (default 60) times per second;
 *  - the loop auto-pauses while `document.hidden` and resumes when visible
 *    (unless the user paused it);
 *  - `dispose()` cancels the RAF and removes every listener.
 *
 * Simulators should create exactly one loop per mount and dispose it in their
 * own `Disposable.dispose()`.
 */
export interface LoopCallbacks {
  /** Advance the simulation by exactly `dt` seconds (called 0..N times per frame). */
  step(dt: number): void;
  /**
   * Draw the current state. `alpha` ∈ [0,1) is the leftover accumulator
   * fraction, usable for interpolation between the last two physics states.
   */
  render(alpha: number): void;
}

/** Browser services the loop uses; injectable for tests. */
export interface LoopEnv {
  /** Milliseconds, monotonic. */
  now(): number;
  requestFrame(cb: (timeMs: number) => void): number;
  cancelFrame(id: number): void;
  isHidden(): boolean;
  /** Subscribe to visibility changes; returns an unsubscribe function. */
  onVisibilityChange(cb: () => void): () => void;
}

export interface LoopOptions {
  /** Physics step [s]. Default {@link PHYSICS_DT}. */
  dt?: number;
  /** Render cap [frames/s]. Default 60. */
  maxFps?: number;
  /** Max simulated time per frame [s], avoids the "spiral of death". Default 0.25. */
  maxFrameTime?: number;
  /** Start running immediately. Default true. */
  autoStart?: boolean;
  env?: LoopEnv;
}

export interface Loop extends Disposable {
  /** User pause (stays paused even when the tab becomes visible again). */
  pause(): void;
  /** Undo a user pause. */
  resume(): void;
  /** Advance exactly one physics step and render (useful while paused). */
  stepOnce(): void;
  isRunning(): boolean;
  isPaused(): boolean;
}

export function browserLoopEnv(): LoopEnv {
  return {
    now: () => performance.now(),
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    isHidden: () => document.hidden,
    onVisibilityChange(cb) {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
  };
}

/** Tolerance [ms] so a 60 Hz display is not throttled to 30 fps by timing jitter. */
const FRAME_TOLERANCE_MS = 1;

export function createLoop(callbacks: LoopCallbacks, options: LoopOptions = {}): Loop {
  const dt = options.dt ?? PHYSICS_DT;
  const minFrameMs = 1000 / (options.maxFps ?? 60);
  const maxFrameTime = options.maxFrameTime ?? 0.25;
  const env = options.env ?? browserLoopEnv();

  let rafId: number | null = null;
  let userPaused = options.autoStart === false;
  let disposed = false;
  let lastRenderMs = 0;
  let lastStepMs = 0;
  let accumulator = 0;

  const frame = (timeMs: number): void => {
    rafId = null;
    if (disposed) return;
    schedule();
    const sinceRender = timeMs - lastRenderMs;
    if (sinceRender + FRAME_TOLERANCE_MS < minFrameMs) return; // render cap
    // Keep the remainder so a 120/144 Hz display averages maxFps.
    lastRenderMs = sinceRender > minFrameMs * 2 ? timeMs : timeMs - (sinceRender % minFrameMs);
    // Physics consumes real elapsed time since the previous processed frame.
    const elapsed = timeMs - lastStepMs;
    lastStepMs = timeMs;
    accumulator += Math.min(Math.max(elapsed, 0) / 1000, maxFrameTime);
    while (accumulator >= dt) {
      callbacks.step(dt);
      accumulator -= dt;
    }
    callbacks.render(accumulator / dt);
  };

  function schedule(): void {
    if (rafId === null && !disposed) rafId = env.requestFrame(frame);
  }

  function start(): void {
    if (disposed || userPaused || env.isHidden() || rafId !== null) return;
    lastRenderMs = lastStepMs = env.now(); // no catch-up after a pause
    schedule();
  }

  function stop(): void {
    if (rafId !== null) env.cancelFrame(rafId);
    rafId = null;
  }

  const unsubscribe = env.onVisibilityChange(() => {
    if (env.isHidden()) stop();
    else start();
  });

  start();

  return {
    pause() {
      userPaused = true;
      stop();
    },
    resume() {
      userPaused = false;
      start();
    },
    stepOnce() {
      if (disposed) return;
      callbacks.step(dt);
      callbacks.render(0);
    },
    isRunning: () => rafId !== null,
    isPaused: () => userPaused,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      unsubscribe();
    },
  };
}
