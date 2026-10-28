import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from '../../content/quiz/quiz.json';
import {
  BANK,
  materialize,
  normalizePrompt,
  STATIC_QUESTIONS,
  validateBank,
} from '../../src/quiz/bank';
import { GENERATORS, instantiate } from '../../src/quiz/generators';
import { splitMath } from '../../src/quiz/richText';
import { SECTIONS } from '../../src/quiz/sections';
import { TEXT } from '../../src/quiz/text';
import { renderTex } from '../../src/ui/math';
import type { QuizQuestion } from '../../src/quiz/types';

const THEORY_DIR = join(__dirname, '../../content/theory');
const theoryIds = new Set(
  readdirSync(THEORY_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '')),
);

/** All user-visible strings of a question. */
function texts(q: QuizQuestion): string[] {
  switch (q.type) {
    case 'scelta-multipla':
      return [q.promptIT, q.explanationIT, ...q.options];
    case 'a-voce':
      return [q.promptIT, q.answerIT, ...(q.keyPointsIT ?? [])];
    case 'numerica':
      return [q.promptIT, ...q.steps.map((s) => s.textIT ?? '')];
  }
}

const allQuestions: QuizQuestion[] = [
  ...STATIC_QUESTIONS,
  ...GENERATORS.map((g) => instantiate(g, 12345)),
];

describe('content/quiz/quiz.json', () => {
  it('passes schema validation against the real theory sections', () => {
    expect(validateBank(raw, theoryIds)).toEqual([]);
    expect(STATIC_QUESTIONS.length).toBe((raw as { questions: unknown[] }).questions.length);
  });

  it('validator catches broken entries', () => {
    const bad = {
      version: 1,
      questions: [
        {
          id: 'x',
          type: 'scelta-multipla',
          section: '99-nope',
          difficulty: 4,
          promptIT: 'p',
          options: ['a', 'b', 'c'],
          answer: 3,
          explanationIT: 'e',
          slideRefs: [],
        },
        {
          id: 'y',
          type: 'numerica',
          section: '01-flusso-campo-magnetico',
          difficulty: 1,
          promptIT: 'p',
          slideRefs: [99],
        },
        {
          id: 'z',
          type: 'a-voce',
          section: '04-lenz',
          difficulty: 1,
          promptIT: 'p',
          slideRefs: [],
        },
      ],
    };
    const errors = validateBank(bad, theoryIds).join('\n');
    expect(errors).toMatch(/x: unknown section/);
    expect(errors).toMatch(/x: difficulty/);
    expect(errors).toMatch(/x: answer must be a valid option index/);
    expect(errors).toMatch(/y: slideRefs/);
    expect(errors).toMatch(/y: type must be/);
    expect(errors).toMatch(/z: missing answerIT/);
  });

  it('quiz section list matches the theory files exactly', () => {
    expect(new Set(SECTIONS.map((s) => s.id))).toEqual(theoryIds);
  });

  it('has at least 40 questions (static + one per generator) covering all 14 sections', () => {
    expect(BANK.length).toBeGreaterThanOrEqual(40);
    const covered = new Set(BANK.map((q) => q.section));
    for (const id of theoryIds) expect(covered.has(id), id).toBe(true);
    const types = new Set(BANK.map((q) => q.type));
    expect(types).toEqual(new Set(['scelta-multipla', 'numerica', 'a-voce']));
    for (const d of [1, 2, 3]) expect(BANK.some((q) => q.difficulty === d)).toBe(true);
  });

  it('has no duplicate ids and no duplicate (normalised) prompts', () => {
    const ids = BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prompts = allQuestions.map((q) => normalizePrompt(q.promptIT));
    const dupes = prompts.filter((p, i) => prompts.indexOf(p) !== i);
    expect(dupes).toEqual([]);
  });

  it('the correct answers are not always in the same position', () => {
    const answers = new Set(
      STATIC_QUESTIONS.flatMap((q) => (q.type === 'scelta-multipla' ? [q.answer] : [])),
    );
    expect(answers.size).toBeGreaterThan(2);
  });

  it('every inline formula renders with KaTeX', () => {
    for (const q of allQuestions)
      for (const txt of texts(q))
        for (const part of splitMath(txt))
          if (part.math)
            expect(renderTex(part.text).error, `${q.id}: ${part.text}`).toBeUndefined();
  });

  it('materialize() returns every bank entry', () => {
    for (const e of BANK) expect(materialize(e.id, 1)?.id).toBe(e.id);
    expect(materialize('non-esiste', 1)).toBeUndefined();
  });
});

describe('Italian-only heuristic', () => {
  const ENGLISH =
    /\b(the|and|answer|of|is|are|with|which|what|correct|wrong|true|false|question|loop|current|field|energy|power|braking|show|next|score)\b/i;

  it('questions, options, explanations and solutions contain no common English words', () => {
    for (const q of allQuestions) {
      for (const txt of texts(q)) {
        // Ignore TeX (\text{…}, symbols) — only prose is checked.
        const prose = splitMath(txt)
          .filter((p) => !p.math)
          .map((p) => p.text)
          .join(' ');
        expect(ENGLISH.test(prose), `${q.id}: "${prose}"`).toBe(false);
      }
    }
  });

  it('UI strings are Italian', () => {
    const strings = Object.values(TEXT).flatMap((v) =>
      typeof v === 'string'
        ? [v]
        : typeof v === 'function'
          ? [(v as (...a: number[]) => string)(1, 2, 3, 4)]
          : Object.values(v as Record<string, string>),
    );
    for (const s of strings) expect(ENGLISH.test(s), s).toBe(false);
  });

  it('the raw JSON file is valid UTF-8 text with accented Italian characters', () => {
    const txt = readFileSync(join(__dirname, '../../content/quiz/quiz.json'), 'utf8');
    expect(txt).toMatch(/[àèéìòù]/);
  });
});

describe('no ASCII pseudo-notation outside KaTeX (QA-016)', () => {
  const PSEUDO = /[A-Za-zΦΔητω]_[A-Za-z0-9{(]|\^/;

  it('question prose uses KaTeX or Unicode for subscripts and powers', () => {
    for (const q of allQuestions) {
      for (const txt of texts(q)) {
        for (const part of splitMath(txt).filter((p) => !p.math)) {
          expect(PSEUDO.test(part.text), `${q.id}: "${part.text}"`).toBe(false);
        }
      }
    }
  });

  it('UI strings use Unicode notation', () => {
    const strings = Object.values(TEXT).flatMap((v) =>
      typeof v === 'string'
        ? [v]
        : typeof v === 'function'
          ? [(v as (...a: number[]) => string)(1, 2, 3, 4)]
          : Object.values(v as Record<string, string>),
    );
    for (const s of strings) expect(PSEUDO.test(s), s).toBe(false);
  });

  it('static question prose uses the typographic apostrophe ’ outside KaTeX', () => {
    for (const q of STATIC_QUESTIONS) {
      for (const txt of texts(q)) {
        for (const part of splitMath(txt).filter((p) => !p.math)) {
          expect(part.text.includes("'"), `${q.id}: "${part.text}"`).toBe(false);
        }
      }
    }
    expect(JSON.stringify(TEXT).includes("'")).toBe(false);
  });

  it('generated numeric prompts and solutions use the typographic apostrophe ’ (QA-016)', () => {
    for (const g of GENERATORS) {
      for (const seed of [1, 7, 42, 12345, 987654321]) {
        const q = instantiate(g, seed);
        for (const txt of texts(q)) {
          // No mis-encoded UTF-8 (e.g. "â\u0080\u0099" instead of "’").
          expect(/[\u0080-\u009f]/.test(txt), `${q.id}#${seed}: "${txt}"`).toBe(false);
          for (const part of splitMath(txt).filter((p) => !p.math)) {
            expect(part.text.includes("'"), `${q.id}#${seed}: "${part.text}"`).toBe(false);
          }
        }
      }
    }
  });
});

describe('KERS wording consistent with D8 and theory 10', () => {
  it('P_max is the electrical cap: never "absorbs at most P_max" (QA-011)', () => {
    const wrong = /assorb\w*\s+(?:meccanicamente\s+)?al massimo (?:P_max|\$P_\{\\max\}\$)/;
    for (const q of allQuestions) {
      for (const txt of texts(q)) expect(wrong.test(txt), `${q.id}: "${txt}"`).toBe(false);
    }
    const limite = STATIC_QUESTIONS.find((q) => q.id === 'sm-mguk-limite');
    expect(limite?.type === 'scelta-multipla' && limite.options[limite.answer]).toContain(
      'inviare alla batteria al massimo $P_{\\max}$',
    );
  });

  it('η·ΔE_k/P_max is "the time to absorb all ΔE_k at maximum power" (QA-012)', () => {
    const q = allQuestions.find((x) => x.id === 'gen-kers-tempo-recupero');
    expect(q?.promptIT).toContain('tempo per assorbire tutta $\\Delta E_k$ alla potenza massima');
    for (const x of allQuestions) {
      for (const txt of texts(x)) expect(txt, x.id).not.toMatch(/recuperare tutta/);
    }
  });

  it('the MGU-K machine type is hedged, never stated as fact (QA-007, OPEN_FACTS #8)', () => {
    const claim = /magneti permanenti|magneti sul rotore/;
    const hedge = /generalmente descritt/;
    for (const q of allQuestions) {
      for (const txt of texts(q)) {
        if (claim.test(txt) && /MGU-K|macchina reale/.test(txt)) {
          expect(hedge.test(txt), `${q.id}: "${txt}"`).toBe(true);
        }
      }
    }
  });
});
