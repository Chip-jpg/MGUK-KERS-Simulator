import { emptyState, sanitizeState, type SchedulerState } from './scheduler';

/** localStorage key of the quiz progress (Leitner boxes). */
export const STORAGE_KEY = 'kers-lab.quiz.v1';

/** Load progress; any error (private mode, corrupt JSON) → empty state. */
export function loadProgress(storage: Storage | undefined = safeStorage()): SchedulerState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveProgress(
  state: SchedulerState,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: progress stays in memory */
  }
}

export function clearProgress(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
