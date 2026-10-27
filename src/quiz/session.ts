/**
 * Pure session helpers: filtering the bank, planning a "Simulazione
 * interrogazione" and the per-section score summary.
 */
import type { BankEntry } from './bank';
import { shuffle, type Rng } from './prng';
import type { Difficulty, QuestionType } from './types';

export interface Filters {
  section: string | 'tutte';
  difficulty: Difficulty | 'tutte';
  type: QuestionType | 'tutti';
}

export const ALL_FILTERS: Filters = { section: 'tutte', difficulty: 'tutte', type: 'tutti' };

export function filterBank(bank: readonly BankEntry[], f: Filters): BankEntry[] {
  return bank.filter(
    (q) =>
      (f.section === 'tutte' || q.section === f.section) &&
      (f.difficulty === 'tutte' || q.difficulty === f.difficulty) &&
      (f.type === 'tutti' || q.type === f.type),
  );
}

/** Number of questions in a simulated oral exam and how many are "a voce". */
export const SIMULATION_SIZE = 10;
export const SIMULATION_ORAL = 2;

/**
 * Plan a simulated exam: `oral` flashcards + (n − oral) multiple-choice/numeric
 * questions, spread over as many different sections as possible. Deterministic
 * for a given `rng`. Oral questions come last (as in a real interrogazione).
 */
export function planSimulation(
  bank: readonly BankEntry[],
  rng: Rng,
  n = SIMULATION_SIZE,
  oral = SIMULATION_ORAL,
): string[] {
  const spread = (items: BankEntry[], k: number): BankEntry[] => {
    const picked: BankEntry[] = [];
    const used = new Set<string>();
    for (const q of items) {
      if (picked.length >= k) break;
      if (!used.has(q.section)) {
        picked.push(q);
        used.add(q.section);
      }
    }
    for (const q of items) {
      if (picked.length >= k) break;
      if (!picked.includes(q)) picked.push(q);
    }
    return picked;
  };
  const orals = spread(
    shuffle(
      rng,
      bank.filter((q) => q.type === 'a-voce'),
    ),
    oral,
  );
  const others = spread(
    shuffle(
      rng,
      bank.filter((q) => q.type !== 'a-voce'),
    ),
    n - orals.length,
  );
  return [...others, ...orals].map((q) => q.id);
}

export interface ScoreRow {
  section: string;
  correct: number;
  total: number;
}

export interface Score {
  correct: number;
  total: number;
  bySection: ScoreRow[];
}

export function emptyScore(): Score {
  return { correct: 0, total: 0, bySection: [] };
}

/** Add one answer to the score (returns a new object). */
export function addToScore(s: Score, section: string, correct: boolean): Score {
  const rows = s.bySection.map((r) => ({ ...r }));
  let row = rows.find((r) => r.section === section);
  if (!row) {
    row = { section, correct: 0, total: 0 };
    rows.push(row);
  }
  row.total += 1;
  if (correct) row.correct += 1;
  rows.sort((a, b) => (a.section < b.section ? -1 : 1));
  return { correct: s.correct + (correct ? 1 : 0), total: s.total + 1, bySection: rows };
}
