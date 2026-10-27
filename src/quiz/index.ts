/**
 * Interrogazione (quiz / oral-exam trainer), A9. Lazy-loaded by the shell on
 * `#/interrogazione` (src/core/extensions.ts): default export `{ mount }`.
 */
import type { QuizModule } from '../core/extensions';
import type { AppContext, Disposable } from '../core/types';
import { t } from '../core/i18n/it';
import { createButton, createSegmented, type ButtonHandle } from '../ui/controls';
import { createSlideChips } from '../ui/chips';
import { el, listen, uniqueId } from '../ui/dom';
import { renderTex } from '../ui/math';
import { BANK, materialize } from './bank';
import { checkNumeric } from './generators';
import { mulberry32, type Rng } from './prng';
import { setRich } from './richText';
import { boxCounts, emptyState, pickNext, recordAnswer } from './scheduler';
import { SECTIONS, sectionLabel } from './sections';
import {
  ALL_FILTERS,
  addToScore,
  emptyScore,
  filterBank,
  planSimulation,
  SIMULATION_SIZE,
  type Filters,
  type Score,
} from './session';
import { clearProgress, loadProgress, saveProgress } from './storage';
import type {
  Difficulty,
  MultipleChoiceQuestion,
  NumericInstance,
  OralQuestion,
  QuestionType,
  QuizQuestion,
} from './types';
import { TEXT } from './text';
import './quiz.css';

type Mode = 'allenamento' | 'simulazione';

function initialSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] ?? 1;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

export function mountQuiz(host: HTMLElement, _ctx: AppContext): Disposable {
  host.replaceChildren();
  const offs: Array<() => void> = [];
  const handles: Disposable[] = [];
  const rng: Rng = mulberry32(initialSeed());
  let progress = loadProgress();
  let mode: Mode = 'allenamento';
  let filters: Filters = { ...ALL_FILTERS };
  let score: Score = emptyScore();
  let current: QuizQuestion | undefined;
  let lastId: string | undefined;
  let answered = false;
  let simQueue: string[] = [];
  let simIndex = 0;
  let askedInMode = 0;
  // No focus moves during the first render: the shell focuses the h1 after navigation.
  let autoFocus = false;
  const focus = (e: HTMLElement | undefined): void => {
    if (autoFocus) e?.focus();
  };

  // --- header ---------------------------------------------------------------
  const h1 = el('h1', { class: 'page-title', text: t.quiz.title, attrs: { tabindex: -1 } });
  const header = el('header', { class: 'page-header' }, [
    h1,
    el('p', { class: 'lead', text: t.quiz.intro }),
    el('p', { class: 'quiz__note', text: TEXT.note }),
  ]);

  // --- controls -------------------------------------------------------------
  const modeSeg = createSegmented<Mode>({
    labelIT: TEXT.mode,
    options: [
      { value: 'allenamento', labelIT: TEXT.training },
      { value: 'simulazione', labelIT: TEXT.simulation },
    ],
    value: mode,
    onChange: (v) => {
      mode = v;
      startMode();
    },
  });
  handles.push(modeSeg);

  const sectionId = uniqueId('quiz-section');
  const sectionSelect = el('select', { class: 'quiz__select', attrs: { id: sectionId } }, [
    el('option', { text: TEXT.allSections, attrs: { value: 'tutte' } }),
    ...SECTIONS.map((s) => el('option', { text: s.labelIT, attrs: { value: s.id } })),
  ]);
  offs.push(
    listen(sectionSelect, 'change', () => {
      filters = { ...filters, section: sectionSelect.value };
      nextQuestion();
    }),
  );
  const diffSeg = createSegmented<'tutte' | '1' | '2' | '3'>({
    labelIT: TEXT.difficulty,
    options: [
      { value: 'tutte', labelIT: TEXT.all },
      { value: '1', labelIT: '1' },
      { value: '2', labelIT: '2' },
      { value: '3', labelIT: '3' },
    ],
    value: 'tutte',
    onChange: (v) => {
      filters = { ...filters, difficulty: v === 'tutte' ? 'tutte' : (Number(v) as Difficulty) };
      nextQuestion();
    },
  });
  const typeSeg = createSegmented<'tutti' | QuestionType>({
    labelIT: TEXT.type,
    options: [
      { value: 'tutti', labelIT: TEXT.allTypes },
      { value: 'scelta-multipla', labelIT: TEXT.types['scelta-multipla'] },
      { value: 'numerica', labelIT: TEXT.types.numerica },
      { value: 'a-voce', labelIT: TEXT.types['a-voce'] },
    ],
    value: 'tutti',
    onChange: (v) => {
      filters = { ...filters, type: v };
      nextQuestion();
    },
  });
  handles.push(diffSeg, typeSeg);
  const filtersBox = el('div', { class: 'quiz__filters' }, [
    el('div', { class: 'quiz__field' }, [
      el('label', { class: 'quiz__label', text: TEXT.section, attrs: { for: sectionId } }),
      sectionSelect,
    ]),
    diffSeg.element,
    typeSeg.element,
  ]);

  const status = el('p', { class: 'quiz__status', attrs: { role: 'status' } });
  const newSimBtn = createButton({ labelIT: TEXT.newSimulation, onClick: () => startMode() });
  const resetBtn = createButton({
    labelIT: TEXT.reset,
    variant: 'ghost',
    onClick: () => {
      clearProgress();
      progress = emptyState();
      score = emptyScore();
      renderScore();
      renderProgress();
      status.textContent = TEXT.resetDone;
    },
  });
  handles.push(newSimBtn, resetBtn);
  const progressLine = el('p', { class: 'quiz__progress muted' });
  const controls = el(
    'section',
    { class: 'panel quiz__controls', attrs: { 'aria-label': 'Impostazioni' } },
    [
      modeSeg.element,
      filtersBox,
      el('div', { class: 'quiz__buttons' }, [newSimBtn.element, resetBtn.element]),
      el('p', { class: 'quiz__progress-title', text: TEXT.progress }),
      progressLine,
      status,
    ],
  );

  // --- question card ---------------------------------------------------------
  const qTitleId = uniqueId('quiz-q');
  const qTitle = el('h2', { class: 'quiz__qtitle', attrs: { id: qTitleId, tabindex: -1 } });
  const qMeta = el('div', { class: 'quiz__meta' });
  const qPrompt = el('div', { class: 'quiz__prompt' });
  const qBody = el('div', { class: 'quiz__body' });
  const qFeedback = el('div', {
    class: 'quiz__feedback',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const qSolution = el('div', { class: 'quiz__solution' });
  const qActions = el('div', { class: 'quiz__actions' });
  const card = el(
    'section',
    { class: 'panel quiz__card', attrs: { 'aria-labelledby': qTitleId } },
    [qTitle, qMeta, qPrompt, qBody, qFeedback, qSolution, qActions],
  );

  // --- score -----------------------------------------------------------------
  const scoreBox = el('section', {
    class: 'panel quiz__score',
    attrs: { 'aria-labelledby': 'quiz-score-title' },
  });

  const layout = el('div', { class: 'quiz' }, [
    header,
    el('div', { class: 'quiz__grid' }, [
      card,
      el('div', { class: 'quiz__side' }, [controls, scoreBox]),
    ]),
  ]);
  host.append(layout);

  // Per-question disposables (buttons, listeners), cleared on every question.
  let qOffs: Array<() => void> = [];
  const clearQuestion = (): void => {
    for (const off of qOffs) off();
    qOffs = [];
    qBody.replaceChildren();
    qFeedback.replaceChildren();
    qFeedback.className = 'quiz__feedback';
    qSolution.replaceChildren();
    qActions.replaceChildren();
  };
  const button = (o: Parameters<typeof createButton>[0]): ButtonHandle => {
    const b = createButton(o);
    qOffs.push(() => b.dispose());
    return b;
  };

  function renderProgress(): void {
    const ids = BANK.map((q) => q.id);
    const c = boxCounts(ids, progress);
    const unseen = ids.filter((id) => !progress.items[id]).length;
    progressLine.textContent = TEXT.boxes(c[1], c[2], c[3], unseen);
  }

  function renderScore(): void {
    const rows = score.bySection;
    scoreBox.replaceChildren(
      el('h2', { class: 'panel-title', text: TEXT.scoreTitle, attrs: { id: 'quiz-score-title' } }),
      el('p', {
        class: 'quiz__score-line',
        text: score.total ? TEXT.scoreLine(score.correct, score.total) : TEXT.noAnswers,
      }),
      rows.length
        ? el('table', { class: 'quiz__table' }, [
            el('caption', { class: 'visually-hidden', text: 'Punteggio per sezione' }),
            el('thead', {}, [
              el('tr', {}, [
                el('th', { text: TEXT.colSection, attrs: { scope: 'col' } }),
                el('th', { text: TEXT.colCorrect, attrs: { scope: 'col' } }),
                el('th', { text: TEXT.colTotal, attrs: { scope: 'col' } }),
              ]),
            ]),
            el(
              'tbody',
              {},
              rows.map((r) =>
                el('tr', {}, [
                  el('th', { text: sectionLabel(r.section), attrs: { scope: 'row' } }),
                  el('td', { text: String(r.correct) }),
                  el('td', { text: String(r.total) }),
                ]),
              ),
            ),
          ])
        : '',
    );
  }

  function record(correct: boolean): void {
    if (!current || answered) return;
    answered = true;
    progress = recordAnswer(progress, current.id, correct);
    saveProgress(progress);
    score = addToScore(score, current.section, correct);
    renderScore();
    renderProgress();
  }

  function feedback(correct: boolean, extra?: string): void {
    qFeedback.className = `quiz__feedback ${correct ? 'is-correct' : 'is-wrong'}`;
    qFeedback.replaceChildren(
      el('strong', { text: correct ? `${t.quiz.correct}!` : `${t.quiz.wrong}.` }),
      extra ? ' ' : '',
      extra ? setRich(el('span'), extra) : '',
    );
  }

  function addNextButton(): void {
    const label =
      mode === 'simulazione' && simIndex >= simQueue.length - 1 ? 'Vedi il risultato' : t.quiz.next;
    const b = button({ labelIT: label, variant: 'primary', onClick: () => nextQuestion() });
    qActions.append(b.element);
    b.element.focus();
  }

  function renderMc(q: MultipleChoiceQuestion): void {
    const name = uniqueId('quiz-opt');
    const fs = el('fieldset', { class: 'quiz__options' }, [
      el('legend', { class: 'visually-hidden', text: TEXT.options }),
    ]);
    const inputs: HTMLInputElement[] = [];
    q.options.forEach((opt, i) => {
      const id = `${name}-${i}`;
      const input = el('input', { attrs: { type: 'radio', name, id, value: String(i) } });
      inputs.push(input);
      fs.append(
        el('div', { class: 'quiz__option' }, [
          input,
          setRich(el('label', { attrs: { for: id } }), opt),
        ]),
      );
    });
    qBody.append(fs);
    const check = button({
      labelIT: t.quiz.check,
      variant: 'primary',
      onClick: () => {
        const sel = inputs.find((x) => x.checked);
        if (!sel) {
          qFeedback.className = 'quiz__feedback';
          qFeedback.textContent = TEXT.chooseOption;
          return;
        }
        const ok = Number(sel.value) === q.answer;
        record(ok);
        for (const x of inputs) x.disabled = true;
        inputs[q.answer]?.parentElement?.classList.add('is-answer');
        if (!ok) sel.parentElement?.classList.add('is-chosen-wrong');
        feedback(ok, ok ? undefined : `${TEXT.correctAnswerIs} ${q.options[q.answer] ?? ''}`);
        qSolution.append(
          el('h3', { class: 'quiz__subtitle', text: TEXT.explanation }),
          setRich(el('p'), q.explanationIT),
        );
        check.element.remove();
        addNextButton();
      },
    });
    qActions.append(check.element);
    focus(inputs[0]);
  }

  function renderNumeric(q: NumericInstance): void {
    const id = uniqueId('quiz-num');
    const hintId = `${id}-hint`;
    const input = el('input', {
      class: 'quiz__input',
      attrs: {
        id,
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-describedby': hintId,
      },
    });
    qBody.append(
      el('div', { class: 'quiz__field' }, [
        el('label', {
          class: 'quiz__label',
          text: `${TEXT.yourAnswer} (${q.unit})`,
          attrs: { for: id },
        }),
        el('div', { class: 'quiz__inputrow' }, [
          input,
          el('span', { class: 'quiz__unit', text: q.unit, attrs: { 'aria-hidden': 'true' } }),
        ]),
        el('p', { class: 'quiz__hint muted', text: TEXT.numericHint, attrs: { id: hintId } }),
      ]),
    );
    const submit = (): void => {
      if (answered) return;
      const res = checkNumeric(q, input.value);
      if (res === null) {
        input.setAttribute('aria-invalid', 'true');
        qFeedback.className = 'quiz__feedback';
        qFeedback.textContent = TEXT.notNumber;
        return;
      }
      input.removeAttribute('aria-invalid');
      record(res);
      input.readOnly = true;
      feedback(
        res,
        `${TEXT.correctAnswerIs} ${q.answerText} ${q.unit} (tolleranza ${Math.round(q.tolerance * 100)} %).`,
      );
      const list = el('ol', { class: 'quiz__steps' });
      for (const s of q.steps) {
        const li = el('li');
        if (s.textIT) li.append(setRich(el('p'), s.textIT));
        if (s.tex) {
          const d = el('div', { class: 'math-display' });
          d.innerHTML = renderTex(s.tex, true).html;
          li.append(d);
        }
        list.append(li);
      }
      qSolution.append(el('h3', { class: 'quiz__subtitle', text: TEXT.solution }), list);
      check.element.remove();
      addNextButton();
    };
    qOffs.push(
      listen(input, 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }),
    );
    const check = button({ labelIT: t.quiz.check, variant: 'primary', onClick: submit });
    qActions.append(check.element);
    focus(input);
  }

  function renderOral(q: OralQuestion): void {
    const show = button({
      labelIT: t.quiz.showAnswer,
      variant: 'primary',
      onClick: () => {
        show.element.remove();
        qSolution.append(
          el('h3', { class: 'quiz__subtitle', text: TEXT.modelAnswer }),
          setRich(el('p'), q.answerIT),
        );
        if (q.keyPointsIT?.length) {
          qSolution.append(
            el('h3', { class: 'quiz__subtitle', text: TEXT.keyPoints }),
            el(
              'ul',
              {},
              q.keyPointsIT.map((k) => setRich(el('li'), k)),
            ),
          );
        }
        const group = el(
          'div',
          { class: 'quiz__selfassess', attrs: { role: 'group', 'aria-label': TEXT.selfAssess } },
          [el('p', { class: 'quiz__label', text: TEXT.selfAssess })],
        );
        const done = (ok: boolean): void => {
          record(ok);
          group.remove();
          feedback(
            ok,
            ok
              ? 'Bene: la domanda tornerà più avanti.'
              : 'La domanda tornerà presto per un ripasso.',
          );
          addNextButton();
        };
        const knew = button({ labelIT: TEXT.knew, variant: 'primary', onClick: () => done(true) });
        const didnt = button({ labelIT: TEXT.didntKnow, onClick: () => done(false) });
        group.append(knew.element, didnt.element);
        qActions.append(group);
        knew.element.focus();
      },
    });
    qActions.append(show.element);
    focus(show.element);
  }

  function renderQuestion(q: QuizQuestion, label: string): void {
    clearQuestion();
    current = q;
    lastId = q.id;
    answered = false;
    card.dataset['questionId'] = q.id;
    card.dataset['questionType'] = q.type;
    if (q.type === 'numerica') card.dataset['seed'] = String(q.seed);
    else delete card.dataset['seed'];
    qTitle.textContent = label;
    qMeta.replaceChildren(
      el('ul', { class: 'chips', attrs: { 'aria-label': 'Caratteristiche della domanda' } }, [
        el('li', { class: 'chip', text: sectionLabel(q.section) }),
        el('li', { class: 'chip', text: TEXT.difficultyLabel(q.difficulty) }),
        el('li', { class: 'chip', text: TEXT.types[q.type] }),
      ]),
      q.slideRefs.length ? createSlideChips(q.slideRefs) : '',
    );
    setRich(qPrompt, q.promptIT);
    if (q.type === 'scelta-multipla') renderMc(q);
    else if (q.type === 'numerica') renderNumeric(q);
    else renderOral(q);
  }

  function showEmpty(text: string): void {
    clearQuestion();
    current = undefined;
    qTitle.textContent = TEXT.question;
    qMeta.replaceChildren();
    qPrompt.replaceChildren(el('p', { class: 'empty-state', text }));
  }

  function showSimulationResult(): void {
    clearQuestion();
    current = undefined;
    qTitle.textContent = TEXT.simDone;
    qMeta.replaceChildren();
    qPrompt.replaceChildren(el('p', { text: TEXT.simResult(score.correct, score.total) }));
    const again = button({
      labelIT: TEXT.newSimulation,
      variant: 'primary',
      onClick: () => startMode(),
    });
    qActions.append(again.element);
    focus(qTitle);
  }

  function nextQuestion(): void {
    if (mode === 'simulazione') {
      if (current && answered) simIndex += 1;
      else if (current && !answered && askedInMode > 0) {
        /* filters do not apply in simulation; keep the current question */
        return;
      }
      if (simIndex >= simQueue.length) {
        showSimulationResult();
        return;
      }
      const id = simQueue[simIndex] as string;
      const q = materialize(id, Math.floor(rng() * 2 ** 32));
      askedInMode += 1;
      if (q) renderQuestion(q, `${TEXT.question} ${simIndex + 1} ${TEXT.of} ${simQueue.length}`);
      return;
    }
    const pool = filterBank(BANK, filters).map((q) => q.id);
    const id = pickNext(pool, progress, rng, lastId);
    if (!id) {
      showEmpty(TEXT.noQuestions);
      return;
    }
    const q = materialize(id, Math.floor(rng() * 2 ** 32));
    askedInMode += 1;
    if (q) renderQuestion(q, `${TEXT.question} ${askedInMode}`);
  }

  function startMode(): void {
    score = emptyScore();
    renderScore();
    current = undefined;
    answered = false;
    askedInMode = 0;
    status.textContent = '';
    filtersBox.hidden = mode !== 'allenamento';
    newSimBtn.element.hidden = mode !== 'simulazione';
    if (mode === 'simulazione') {
      simQueue = planSimulation(BANK, rng, SIMULATION_SIZE);
      simIndex = 0;
    }
    nextQuestion();
  }

  renderProgress();
  startMode();
  autoFocus = true;

  return {
    dispose() {
      clearQuestion();
      for (const off of offs) off();
      for (const h of handles) h.dispose();
      host.replaceChildren();
    },
  };
}

const quiz: QuizModule = { mount: mountQuiz };
export default quiz;
