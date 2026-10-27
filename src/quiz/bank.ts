/**
 * Question bank: static questions from `content/quiz/quiz.json` (validated) plus
 * one entry per numeric generator.
 */
import rawBank from '../../content/quiz/quiz.json';
import { GENERATORS, instantiate } from './generators';
import { SECTIONS } from './sections';
import type { Difficulty, QuestionType, QuizQuestion, StaticQuestion } from './types';

export interface BankEntry {
  id: string;
  type: QuestionType;
  section: string;
  difficulty: Difficulty;
}

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate the raw JSON bank. Returns the list of problems (empty = valid).
 * Static questions are "scelta-multipla" or "a-voce": numeric questions come
 * from generators so that every numeric answer is computed by `src/physics`.
 */
export function validateBank(
  raw: unknown,
  sectionIds: ReadonlySet<string> = SECTION_IDS,
): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['bank: not an object'];
  const r = raw as { version?: unknown; questions?: unknown };
  if (r.version !== 1) errors.push('bank: version must be 1');
  if (!Array.isArray(r.questions)) return [...errors, 'bank: questions must be an array'];
  r.questions.forEach((q: unknown, i: number) => {
    const where = `questions[${i}]`;
    if (!q || typeof q !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    const o = q as Record<string, unknown>;
    const id = isStr(o['id']) ? o['id'] : where;
    if (!isStr(o['id']) || !/^[a-z0-9][a-z0-9-]*$/.test(o['id'])) errors.push(`${id}: invalid id`);
    if (!isStr(o['section']) || !sectionIds.has(o['section']))
      errors.push(`${id}: unknown section ${String(o['section'])}`);
    if (o['difficulty'] !== 1 && o['difficulty'] !== 2 && o['difficulty'] !== 3)
      errors.push(`${id}: difficulty must be 1, 2 or 3`);
    if (!isStr(o['promptIT'])) errors.push(`${id}: missing promptIT`);
    const refs = o['slideRefs'];
    if (
      !Array.isArray(refs) ||
      !refs.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 23)
    )
      errors.push(`${id}: slideRefs must be integers 1–23`);
    if (o['type'] === 'scelta-multipla') {
      const opts = o['options'];
      if (!Array.isArray(opts) || opts.length < 3 || !opts.every(isStr))
        errors.push(`${id}: options must be ≥ 3 non-empty strings`);
      else if (new Set(opts.map((s) => (s as string).trim().toLowerCase())).size !== opts.length)
        errors.push(`${id}: duplicate options`);
      const a = o['answer'];
      if (
        !Number.isInteger(a) ||
        !Array.isArray(opts) ||
        (a as number) < 0 ||
        (a as number) >= opts.length
      )
        errors.push(`${id}: answer must be a valid option index`);
      if (!isStr(o['explanationIT'])) errors.push(`${id}: missing explanationIT`);
    } else if (o['type'] === 'a-voce') {
      if (!isStr(o['answerIT'])) errors.push(`${id}: missing answerIT`);
      const kp = o['keyPointsIT'];
      if (kp !== undefined && (!Array.isArray(kp) || !kp.every(isStr)))
        errors.push(`${id}: keyPointsIT must be strings`);
    } else {
      errors.push(
        `${id}: type must be "scelta-multipla" or "a-voce" (numeric questions are generators)`,
      );
    }
  });
  return errors;
}

/** Normalised prompt text for duplicate detection. */
export function normalizePrompt(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const bankErrors = validateBank(rawBank);
if (bankErrors.length > 0) {
  console.warn(`[quiz] content/quiz/quiz.json: ${bankErrors.join('; ')}`);
}

/** Static questions (only the valid file is used; tests guarantee validity). */
export const STATIC_QUESTIONS: readonly StaticQuestion[] =
  bankErrors.length === 0 ? ((rawBank as { questions: StaticQuestion[] }).questions ?? []) : [];

/** Every question of the bank (static + one per generator). */
export const BANK: readonly BankEntry[] = [
  ...STATIC_QUESTIONS.map((q) => ({
    id: q.id,
    type: q.type,
    section: q.section,
    difficulty: q.difficulty,
  })),
  ...GENERATORS.map((g) => ({
    id: g.id,
    type: 'numerica' as const,
    section: g.section,
    difficulty: g.difficulty,
  })),
];

/** Materialise a bank entry; numeric questions get a fresh instance for `seed`. */
export function materialize(id: string, seed: number): QuizQuestion | undefined {
  const s = STATIC_QUESTIONS.find((q) => q.id === id);
  if (s) return s;
  const g = GENERATORS.find((x) => x.id === id);
  return g ? instantiate(g, seed) : undefined;
}
