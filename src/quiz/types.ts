/** Quiz data model (A9). All `…IT` strings are Italian and may contain `$…$` TeX. */

export type QuestionType = 'scelta-multipla' | 'numerica' | 'a-voce';
export type Difficulty = 1 | 2 | 3;

interface BaseQuestion {
  /** Stable id (scheduler key). */
  id: string;
  type: QuestionType;
  /** Theory section id, e.g. "03-faraday-neumann" (file stem in content/theory). */
  section: string;
  difficulty: Difficulty;
  promptIT: string;
  slideRefs: number[];
}

/** Static multiple-choice question from `content/quiz/quiz.json`. */
export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'scelta-multipla';
  options: string[];
  /** Index of the correct option in `options`. */
  answer: number;
  explanationIT: string;
}

/** Static "spiega a voce" flashcard from `content/quiz/quiz.json`. */
export interface OralQuestion extends BaseQuestion {
  type: 'a-voce';
  /** Model answer shown after "Mostra risposta" (2–5 lines). */
  answerIT: string;
  /** Optional key points to check while answering. */
  keyPointsIT?: string[];
}

export type StaticQuestion = MultipleChoiceQuestion | OralQuestion;

/** One step of a worked solution: Italian text and/or a display TeX formula. */
export interface SolutionStep {
  textIT?: string;
  tex?: string;
}

/** A concrete numeric question produced by a generator for one seed. */
export interface NumericInstance extends BaseQuestion {
  type: 'numerica';
  generatorId: string;
  seed: number;
  /** Expected answer in the display unit (`unit`). */
  expected: number;
  unit: string;
  /** Relative tolerance, e.g. 0.02 = 2 %. */
  tolerance: number;
  /** Canonical formatted answer ("62,5"), accepted by the checker. */
  answerText: string;
  steps: SolutionStep[];
}

export type QuizQuestion = StaticQuestion | NumericInstance;

/**
 * Numeric question generator. `solve` must call `src/physics` functions only
 * (no re-implemented formulas) and returns the answer in SI units; `scale`
 * converts it to the display unit (e.g. 1000 for A → mA).
 */
export interface NumericGenerator<P = Record<string, number>> {
  id: string;
  section: string;
  difficulty: Difficulty;
  slideRefs: number[];
  /** Display unit of the answer. */
  unit: string;
  /** SI → display unit factor. */
  scale: number;
  /** Relative tolerance. */
  tolerance: number;
  /** Deterministic parameter sampler. */
  sample(rng: () => number): P;
  promptIT(p: P): string;
  /** Answer in SI units, computed with `src/physics`. */
  solve(p: P): number;
  /** Worked solution (Italian text + TeX steps); `answer` is in the display unit. */
  solution(p: P, answer: number): SolutionStep[];
}
