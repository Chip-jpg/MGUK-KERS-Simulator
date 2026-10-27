import type { AppContext, Disposable } from './types';

/**
 * Extension point for the Interrogazione area (owned by A9, `src/quiz/**`).
 *
 * If `src/quiz/index.ts` exists, its default export must be a {@link QuizModule}.
 * The shell lazy-loads it (own chunk) when the user opens `#/interrogazione` and
 * calls `mount(host, ctx)`; `dispose()` is called on navigation away. Without the
 * file the shell shows an "In arrivo" placeholder. No shared file has to be edited.
 */
export interface QuizModule {
  mount(host: HTMLElement, ctx: AppContext): Disposable;
}

export type QuizLoader = () => Promise<{ default: QuizModule }>;

const found = import.meta.glob<{ default: QuizModule }>('../quiz/index.ts');

/** Lazy loader of `src/quiz/index.ts`, or `undefined` when the quiz is not there yet. */
export const quizLoader: QuizLoader | undefined = Object.values(found)[0];

/** Load the quiz module; resolves to `undefined` when it does not exist. */
export async function loadQuiz(
  loader: QuizLoader | undefined = quizLoader,
): Promise<QuizModule | undefined> {
  if (!loader) return undefined;
  const mod = (await loader()).default;
  if (!mod || typeof mod.mount !== 'function') {
    throw new Error('src/quiz/index.ts must default-export { mount(host, ctx): Disposable }');
  }
  return mod;
}
