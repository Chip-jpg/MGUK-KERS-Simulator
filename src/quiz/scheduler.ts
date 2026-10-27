/**
 * Spaced-repetition-lite scheduler (Leitner boxes 1–3), pure and deterministic.
 *
 * - Every answer advances a global `turn` counter.
 * - Correct answer: box → min(3, box + 1), next due after INTERVALS[box] turns.
 * - Wrong answer: box → 1, due again after WRONG_DELAY turns, so it resurfaces
 *   within the next few questions.
 * - `pickNext` chooses, in this order: (1) a due item whose last answer was wrong
 *   ("lapse", most overdue first) — so wrong answers resurface within
 *   WRONG_DELAY + 1 questions; (2) an unseen item (random); (3) any other due
 *   item (lowest box, then most overdue); (4) the item due soonest.
 *   The question just asked is never repeated immediately (if there is another).
 */
import type { Rng } from './prng';

export type Box = 1 | 2 | 3;

export interface ItemState {
  box: Box;
  /** Turn at which the item becomes due again. */
  due: number;
  seen: number;
  correct: number;
  wrong: number;
  /** True when the last answer was wrong. */
  lapse: boolean;
}

export interface SchedulerState {
  turn: number;
  items: Record<string, ItemState>;
}

/** Turns before a correctly answered item comes back, per (new) box. */
export const INTERVALS: Record<Box, number> = { 1: 3, 2: 8, 3: 20 };
/** Turns before a wrong item comes back (it resurfaces within the next few questions). */
export const WRONG_DELAY = 2;

export function emptyState(): SchedulerState {
  return { turn: 0, items: {} };
}

/** Record an answer; returns a new state (input is not mutated). */
export function recordAnswer(state: SchedulerState, id: string, correct: boolean): SchedulerState {
  const turn = state.turn + 1;
  const prev = state.items[id];
  const box: Box = correct ? (Math.min(3, (prev?.box ?? 0) + 1) as Box) : 1;
  const item: ItemState = {
    box,
    due: turn + (correct ? INTERVALS[box] : WRONG_DELAY),
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
    lapse: !correct,
  };
  return { turn, items: { ...state.items, [id]: item } };
}

/**
 * Choose the next question id from `pool`.
 * @param lastId - id just asked (avoided if any alternative exists)
 * @returns `undefined` only for an empty pool
 */
export function pickNext(
  pool: readonly string[],
  state: SchedulerState,
  rng: Rng,
  lastId?: string,
): string | undefined {
  if (pool.length === 0) return undefined;
  const candidates = pool.length > 1 ? pool.filter((id) => id !== lastId) : [...pool];
  const seen = candidates.filter((id) => state.items[id]);
  const item = (id: string): ItemState => state.items[id] as ItemState;
  const due = seen.filter((id) => item(id).due <= state.turn);
  const lapses = due
    .filter((id) => item(id).lapse)
    .sort((a, b) => item(a).due - item(b).due || (a < b ? -1 : 1));
  if (lapses[0] !== undefined) return lapses[0];
  const unseen = candidates.filter((id) => !state.items[id]);
  if (unseen.length > 0) return unseen[Math.floor(rng() * unseen.length)];
  const dueSorted = [...due].sort(
    (a, b) => item(a).box - item(b).box || item(a).due - item(b).due || (a < b ? -1 : 1),
  );
  if (dueSorted[0] !== undefined) return dueSorted[0];
  const soonest = [...seen].sort((a, b) => {
    const A = state.items[a] as ItemState;
    const B = state.items[b] as ItemState;
    return A.due - B.due || A.box - B.box || (a < b ? -1 : 1);
  });
  return soonest[0];
}

/** Count of items per box among `pool` (unseen items are not counted). */
export function boxCounts(pool: readonly string[], state: SchedulerState): Record<Box, number> {
  const c: Record<Box, number> = { 1: 0, 2: 0, 3: 0 };
  for (const id of pool) {
    const it = state.items[id];
    if (it) c[it.box] += 1;
  }
  return c;
}

/** Validate a parsed value as a SchedulerState (for localStorage); invalid → empty. */
export function sanitizeState(raw: unknown): SchedulerState {
  if (!raw || typeof raw !== 'object') return emptyState();
  const r = raw as { turn?: unknown; items?: unknown };
  if (typeof r.turn !== 'number' || !Number.isFinite(r.turn) || r.turn < 0) return emptyState();
  if (!r.items || typeof r.items !== 'object') return emptyState();
  const items: Record<string, ItemState> = {};
  for (const [id, v] of Object.entries(r.items as Record<string, unknown>)) {
    const it = v as Partial<ItemState> | null;
    if (
      it &&
      (it.box === 1 || it.box === 2 || it.box === 3) &&
      [it.due, it.seen, it.correct, it.wrong].every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      )
    ) {
      items[id] = {
        box: it.box,
        due: it.due as number,
        seen: it.seen as number,
        correct: it.correct as number,
        wrong: it.wrong as number,
        lapse: it.lapse === true,
      };
    }
  }
  return { turn: Math.floor(r.turn), items };
}
