import { describe, expect, it } from 'vitest';
import { BANK } from '../../src/quiz/bank';
import { mulberry32 } from '../../src/quiz/prng';
import {
  boxCounts,
  emptyState,
  INTERVALS,
  pickNext,
  recordAnswer,
  sanitizeState,
  WRONG_DELAY,
} from '../../src/quiz/scheduler';
import { addToScore, emptyScore, filterBank, planSimulation } from '../../src/quiz/session';
import { clearProgress, loadProgress, saveProgress, STORAGE_KEY } from '../../src/quiz/storage';

const POOL = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('Leitner scheduler', () => {
  it('moves correct answers up one box (max 3) and wrong answers back to box 1', () => {
    let s = emptyState();
    s = recordAnswer(s, 'a', true);
    expect(s.items['a']).toMatchObject({ box: 1, due: 1 + INTERVALS[1], seen: 1, correct: 1 });
    s = recordAnswer(s, 'a', true);
    expect(s.items['a']!.box).toBe(2);
    s = recordAnswer(s, 'a', true);
    s = recordAnswer(s, 'a', true);
    expect(s.items['a']!.box).toBe(3);
    s = recordAnswer(s, 'a', false);
    expect(s.items['a']).toMatchObject({ box: 1, due: s.turn + WRONG_DELAY, wrong: 1, seen: 5 });
  });

  it('does not mutate the input state', () => {
    const s0 = emptyState();
    const s1 = recordAnswer(s0, 'a', false);
    expect(s0).toEqual({ turn: 0, items: {} });
    expect(s1.turn).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const run = (seed: number): string[] => {
      const rng = mulberry32(seed);
      let s = emptyState();
      let last: string | undefined;
      const seq: string[] = [];
      for (let k = 0; k < 30; k++) {
        const id: string = pickNext(POOL, s, rng, last)!;
        seq.push(id);
        s = recordAnswer(s, id, (k * 7) % 3 !== 0);
        last = id;
      }
      return seq;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('a wrong answer resurfaces within the next few questions', () => {
    const rng = mulberry32(1);
    let s = emptyState();
    let last: string | undefined;
    // Answer everything right once, then get "c" wrong.
    for (const id of POOL) s = recordAnswer(s, id, true);
    s = recordAnswer(s, 'c', false);
    last = 'c';
    const next: string[] = [];
    for (let k = 0; k < WRONG_DELAY + 2; k++) {
      const id: string = pickNext(POOL, s, rng, last)!;
      next.push(id);
      s = recordAnswer(s, id, true);
      last = id;
    }
    expect(next).toContain('c');
    expect(next.indexOf('c')).toBeLessThanOrEqual(WRONG_DELAY + 1);
  });

  it('never repeats the question just asked when there is an alternative', () => {
    const rng = mulberry32(3);
    let s = emptyState();
    let last: string | undefined;
    for (let k = 0; k < 100; k++) {
      const id: string = pickNext(['x', 'y'], s, rng, last)!;
      expect(id).not.toBe(last);
      s = recordAnswer(s, id, false);
      last = id;
    }
    expect(pickNext(['x'], s, rng, 'x')).toBe('x');
    expect(pickNext([], s, rng)).toBeUndefined();
  });

  it('asks unseen questions before re-asking ones that are not due', () => {
    const rng = mulberry32(9);
    let s = emptyState();
    let last: string | undefined;
    const seen = new Set<string>();
    for (let k = 0; k < POOL.length; k++) {
      const id: string = pickNext(POOL, s, rng, last)!;
      seen.add(id);
      s = recordAnswer(s, id, true);
      last = id;
    }
    expect(seen.size).toBe(POOL.length);
  });

  it('counts boxes', () => {
    let s = emptyState();
    s = recordAnswer(s, 'a', true);
    s = recordAnswer(s, 'b', true);
    s = recordAnswer(s, 'b', true);
    expect(boxCounts(POOL, s)).toEqual({ 1: 1, 2: 1, 3: 0 });
  });

  it('sanitizes stored data', () => {
    expect(sanitizeState(null)).toEqual(emptyState());
    expect(sanitizeState({ turn: -1, items: {} })).toEqual(emptyState());
    expect(
      sanitizeState({
        turn: 4,
        items: { a: { box: 2, due: 9, seen: 2, correct: 2, wrong: 0 }, b: { box: 7 } },
      }),
    ).toEqual({
      turn: 4,
      items: { a: { box: 2, due: 9, seen: 2, correct: 2, wrong: 0, lapse: false } },
    });
  });
});

describe('storage', () => {
  it('round-trips through a Storage under kers-lab.quiz.v1 and survives bad data', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage;
    const s = recordAnswer(emptyState(), 'a', false);
    saveProgress(s, storage);
    expect(STORAGE_KEY).toBe('kers-lab.quiz.v1');
    expect(loadProgress(storage)).toEqual(s);
    map.set(STORAGE_KEY, '{oops');
    expect(loadProgress(storage)).toEqual(emptyState());
    clearProgress(storage);
    expect(map.has(STORAGE_KEY)).toBe(false);
    expect(loadProgress(undefined)).toEqual(emptyState());
  });
});

describe('session', () => {
  it('plans a 10-question simulation with 2 oral flashcards at the end, deterministic', () => {
    const plan = planSimulation(BANK, mulberry32(7));
    expect(plan).toHaveLength(10);
    expect(new Set(plan).size).toBe(10);
    const types = plan.map((id) => BANK.find((q) => q.id === id)!.type);
    expect(types.filter((t) => t === 'a-voce')).toHaveLength(2);
    expect(types.slice(8)).toEqual(['a-voce', 'a-voce']);
    expect(new Set(plan.slice(0, 8).map((id) => BANK.find((q) => q.id === id)!.section)).size).toBe(
      8,
    );
    expect(planSimulation(BANK, mulberry32(7))).toEqual(plan);
  });

  it('filters by section, difficulty and type', () => {
    const f = filterBank(BANK, {
      section: '03-faraday-neumann',
      difficulty: 'tutte',
      type: 'tutti',
    });
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((q) => q.section === '03-faraday-neumann')).toBe(true);
    const n = filterBank(BANK, { section: 'tutte', difficulty: 2, type: 'numerica' });
    expect(n.every((q) => q.difficulty === 2 && q.type === 'numerica')).toBe(true);
  });

  it('keeps a per-section score', () => {
    let s = emptyScore();
    s = addToScore(s, '04-lenz', true);
    s = addToScore(s, '01-flusso-campo-magnetico', false);
    s = addToScore(s, '04-lenz', false);
    expect(s).toEqual({
      correct: 1,
      total: 3,
      bySection: [
        { section: '01-flusso-campo-magnetico', correct: 0, total: 1 },
        { section: '04-lenz', correct: 1, total: 2 },
      ],
    });
  });
});
