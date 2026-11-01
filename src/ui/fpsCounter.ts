import { formatIT } from '../core/format';
import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import { el } from './dom';

/**
 * FPS counter (F7): average frames/s, average frame time and the "1 % low"
 * (average frames/s of the slowest 1 % of frames, at least one) over the last
 * {@link FPS_WINDOW_MS}. Fed with real rendered frames (`frame(nowMs)`, e.g. from
 * `onLoopFrame`); the text is rewritten at most {@link FPS_TEXT_HZ} times per second.
 */

export const FPS_WINDOW_MS = 2000;
export const FPS_TEXT_HZ = 4;
/** Without frames for this long the counter shows "in pausa". */
const IDLE_MS = 1000;

export interface FpsStats {
  /** Average frames per second. */
  fps: number;
  /** Average frame time [ms]. */
  frameMs: number;
  /** 1 % low [frames/s]: 1000 / mean of the slowest 1 % frame times (at least one frame). */
  low1: number;
}

/** Statistics of a list of frame intervals [ms] (null when empty). */
export function fpsStats(intervalsMs: readonly number[]): FpsStats | null {
  const xs = intervalsMs.filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length === 0) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  const frameMs = sum / xs.length;
  const sorted = [...xs].sort((a, b) => a - b);
  const n = Math.max(1, Math.ceil(0.01 * sorted.length));
  const worst = sorted.slice(sorted.length - n).reduce((a, b) => a + b, 0) / n;
  return { fps: 1000 / frameMs, frameMs, low1: 1000 / worst };
}

/**
 * Three short lines (the counter is a narrow 9ch box, D1): "144 fps", "6,9 ms",
 * "1% 120" (1 % low in fps).
 */
export function formatFpsStats(s: FpsStats | null): string[] {
  if (!s) return [`— ${t.fps.fpsUnit}`];
  return [
    formatIT(s.fps, 0, t.fps.fpsUnit),
    formatIT(s.frameMs, 1, 'ms'),
    `${t.fps.low1} ${formatIT(s.low1, 0)}`,
  ];
}

export interface FpsCounter extends Disposable {
  readonly element: HTMLElement;
  /** Record one rendered frame (rAF timestamp [ms]). */
  frame(nowMs: number): void;
  /** Current statistics (null before two frames). */
  stats(): FpsStats | null;
  /** Forget the history (e.g. when shown again). */
  reset(): void;
}

export function createFpsCounter(container: HTMLElement): FpsCounter {
  const element = el('div', {
    class: 'fps-counter',
    attrs: { 'aria-label': t.fps.counterLabel, role: 'note', title: t.fps.counterHint },
  });
  container.append(element);

  const times: number[] = [];
  let lastText = -Infinity;
  let idle: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const intervals = (): number[] => {
    const out: number[] = [];
    for (let k = 1; k < times.length; k++)
      out.push((times[k] as number) - (times[k - 1] as number));
    return out;
  };

  let shownKey = '';
  const write = (lines: readonly string[]): void => {
    const key = lines.join('\n');
    if (key === shownKey) return;
    shownKey = key;
    element.replaceChildren(
      ...lines.map((l) => el('div', { class: 'fps-counter__line', text: l })),
    );
  };
  write(formatFpsStats(null));

  return {
    element,
    frame(nowMs) {
      if (disposed || !Number.isFinite(nowMs)) return;
      const prev = times[times.length - 1];
      if (prev !== undefined && nowMs - prev > IDLE_MS) times.length = 0; // after a pause
      times.push(nowMs);
      while (times.length > 2 && nowMs - (times[0] as number) > FPS_WINDOW_MS) times.shift();
      if (nowMs - lastText >= 1000 / FPS_TEXT_HZ) {
        lastText = nowMs;
        write(formatFpsStats(fpsStats(intervals())));
      }
      if (idle !== null) clearTimeout(idle);
      idle = setTimeout(() => {
        idle = null;
        if (!disposed) write([t.fps.paused]);
      }, IDLE_MS);
    },
    stats: () => fpsStats(intervals()),
    reset() {
      times.length = 0;
      lastText = -Infinity;
      write(formatFpsStats(null));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (idle !== null) clearTimeout(idle);
      idle = null;
      element.remove();
    },
  };
}
