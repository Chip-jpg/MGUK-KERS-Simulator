import { PHYSICS_DT } from '../physics';
import { fpsLimitToMaxFps, getFpsLimit, onFpsLimitChange } from './settings';
import type { Disposable } from './types';

/**
 * Render-loop helper implementing the §4.1 contract:
 *  - physics advances in fixed steps of dt = 1/240 s via an accumulator
 *    (deterministic, independent of the display refresh rate);
 *  - rendering follows the display refresh rate (uncapped, F7) unless a cap is set:
 *    `options.maxFps`, or else the user's FPS limit from `src/core/settings.ts`
 *    (`'auto'` | 60 | 30), followed live;
 *  - at most `maxFrameTime` of simulated time and `maxStepsPerFrame` steps per frame;
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
  /**
   * Fixed render cap [frames/s] (`Infinity` = uncapped). When omitted the loop follows
   * the user's FPS limit setting live (`getFpsLimit()`, default `'auto'` = uncapped).
   */
  maxFps?: number;
  /** Max simulated time per frame [s], avoids the "spiral of death". Default 0.25. */
  maxFrameTime?: number;
  /**
   * Max physics steps per frame (second spiral-of-death guard; leftover time is
   * dropped). Default `ceil(maxFrameTime / dt) + 1` (61), which never cuts real time.
   */
  maxStepsPerFrame?: number;
  /** Called after every rendered frame with the rAF timestamp [ms] (FPS counters). */
  onFrame?(nowMs: number): void;
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

const frameListeners = new Set<(nowMs: number) => void>();

/**
 * Subscribe to every frame rendered by any running loop (the layout's FPS counter
 * uses it, so every simulator gets it without wiring). Returns an unsubscribe function.
 */
export function onLoopFrame(cb: (nowMs: number) => void): () => void {
  frameListeners.add(cb);
  return () => frameListeners.delete(cb);
}

/** Minimum interval between renders [ms] for a cap in frames/s (0 = uncapped). */
export function minFrameInterval(maxFps: number): number {
  return Number.isFinite(maxFps) && maxFps > 0 ? 1000 / maxFps : 0;
}

export function createLoop(callbacks: LoopCallbacks, options: LoopOptions = {}): Loop {
  const dt = options.dt ?? PHYSICS_DT;
  let minFrameMs = minFrameInterval(options.maxFps ?? fpsLimitToMaxFps(getFpsLimit()));
  const maxFrameTime = options.maxFrameTime ?? 0.25;
  const maxSteps = Math.max(1, options.maxStepsPerFrame ?? Math.ceil(maxFrameTime / dt) + 1);
  const env = options.env ?? browserLoopEnv();
  const offFpsLimit =
    options.maxFps === undefined
      ? onFpsLimitChange((limit) => {
          minFrameMs = minFrameInterval(fpsLimitToMaxFps(limit));
          nextRenderMs = lastRenderMs + minFrameMs;
        })
      : () => {};

  let rafId: number | null = null;
  let userPaused = options.autoStart === false;
  let disposed = false;
  let lastRenderMs = 0;
  let nextRenderMs = 0;
  let lastStepMs = 0;
  let accumulator = 0;

  const frame = (timeMs: number): void => {
    rafId = null;
    if (disposed) return;
    schedule();
    if (minFrameMs > 0) {
      if (timeMs + FRAME_TOLERANCE_MS < nextRenderMs) return; // render cap
      // Deadline grid: a 120/144 Hz display averages maxFps; after a hitch, re-anchor.
      nextRenderMs += minFrameMs;
      if (nextRenderMs <= timeMs) nextRenderMs = timeMs + minFrameMs;
    }
    lastRenderMs = timeMs;
    // Physics consumes real elapsed time since the previous processed frame.
    const elapsed = timeMs - lastStepMs;
    lastStepMs = timeMs;
    accumulator += Math.min(Math.max(elapsed, 0) / 1000, maxFrameTime);
    let steps = 0;
    while (accumulator >= dt) {
      if (steps >= maxSteps) {
        accumulator %= dt; // drop the backlog instead of spiralling
        break;
      }
      callbacks.step(dt);
      accumulator -= dt;
      steps++;
    }
    callbacks.render(accumulator / dt);
    options.onFrame?.(timeMs);
    if (frameListeners.size > 0) for (const cb of frameListeners) cb(timeMs);
  };

  function schedule(): void {
    if (rafId === null && !disposed) rafId = env.requestFrame(frame);
  }

  function start(): void {
    if (disposed || userPaused || env.isHidden() || rafId !== null) return;
    lastRenderMs = lastStepMs = env.now(); // no catch-up after a pause
    nextRenderMs = lastRenderMs + minFrameMs;
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
      offFpsLimit();
    },
  };
}
