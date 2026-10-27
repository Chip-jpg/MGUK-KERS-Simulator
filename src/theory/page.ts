import { t } from '../core/i18n/it';
import { formatRoute } from '../core/router';
import type { Disposable } from '../core/types';
import { createSlideChips } from '../ui/chips';
import { el, listen } from '../ui/dom';
import { neighbours, type TheoryDoc } from './content';
import { renderMarkdown } from './markdown';

/** Theory index: intro + ordered list of sections (or an "in preparazione" note). */
export function renderTheoryIndex(host: HTMLElement, docs: readonly TheoryDoc[]): Disposable {
  const list = el('ol', { class: 'card-list theory-index' });
  for (const d of docs) {
    list.append(
      el('li', { class: 'card' }, [
        el(
          'a',
          { class: 'card__link', attrs: { href: formatRoute({ kind: 'teoria', id: d.id }) } },
          [
            el('span', { class: 'card__eyebrow', text: `${t.theory.sectionOf} ${d.order}` }),
            el('span', { class: 'card__title', text: d.titleIT }),
          ],
        ),
        el('div', { class: 'card__meta' }, [
          d.level === 'approfondimento'
            ? el('span', { class: 'badge', text: t.theory.levelAdvanced })
            : null,
          d.slideRefs.length > 0 ? createSlideChips(d.slideRefs) : null,
        ]),
      ]),
    );
  }
  host.replaceChildren(
    el('header', { class: 'page-header' }, [
      el('h1', { class: 'page-title', text: t.theory.indexTitle, attrs: { tabindex: -1 } }),
      el('p', { class: 'lead', text: t.theory.indexIntro }),
    ]),
    docs.length > 0 ? list : el('p', { class: 'empty-state', text: t.theory.empty }),
  );
  return { dispose: () => host.replaceChildren() };
}

/** One theory section: header, TOC, Markdown body, previous/next. */
export function renderTheoryPage(
  host: HTMLElement,
  doc: TheoryDoc,
  docs: readonly TheoryDoc[],
): Disposable {
  const rendered = renderMarkdown(doc.body);
  const offs: Array<() => void> = [];

  const body = el('div', { class: 'prose' });
  body.innerHTML = rendered.html; // our own bundled Markdown; raw HTML is escaped by the renderer

  const header = el('header', { class: 'page-header' }, [
    el('p', { class: 'eyebrow', text: `${t.theory.sectionOf} ${doc.order}` }),
    el('h1', { class: 'page-title', text: doc.titleIT, attrs: { tabindex: -1 } }),
    el('div', { class: 'page-meta' }, [
      el('span', {
        class: `badge${doc.level === 'approfondimento' ? ' badge--accent' : ''}`,
        text: doc.level === 'approfondimento' ? t.theory.levelAdvanced : t.theory.levelBase,
      }),
      doc.goal ? el('span', { class: 'badge', text: `${t.theory.goal}: ${doc.goal}` }) : null,
      doc.slideRefs.length > 0 ? createSlideChips(doc.slideRefs) : null,
    ]),
  ]);

  // TOC: buttons + scrollIntoView (DECISIONS D5: no href="#anchor" with the hash router).
  let toc: HTMLElement | null = null;
  if (rendered.toc.length > 0) {
    const list = el('ol', { class: 'toc__list' });
    for (const entry of rendered.toc) {
      const button = el('button', {
        class: 'toc__link',
        attrs: { type: 'button', 'data-target': entry.id },
      });
      button.innerHTML = entry.html;
      offs.push(
        listen(button, 'click', () => {
          const target = body.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`);
          if (!target) return;
          const reduce = document.documentElement.dataset['reducedMotion'] === 'true';
          target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          target.focus({ preventScroll: true });
        }),
      );
      list.append(el('li', {}, [button]));
    }
    toc = el('nav', { class: 'toc', attrs: { 'aria-label': t.theory.toc } }, [
      el('h2', { class: 'toc__title', text: t.theory.toc }),
      list,
    ]);
  }

  const { prev, next } = neighbours(docs, doc);
  const pager = el('nav', { class: 'pager', attrs: { 'aria-label': t.theory.pager } }, [
    prev
      ? el(
          'a',
          {
            class: 'pager__link pager__link--prev',
            attrs: { href: formatRoute({ kind: 'teoria', id: prev.id }), rel: 'prev' },
          },
          [
            el('span', { class: 'pager__dir', text: `← ${t.theory.previous}` }),
            el('span', { class: 'pager__title', text: prev.titleIT }),
          ],
        )
      : el('span'),
    next
      ? el(
          'a',
          {
            class: 'pager__link pager__link--next',
            attrs: { href: formatRoute({ kind: 'teoria', id: next.id }), rel: 'next' },
          },
          [
            el('span', { class: 'pager__dir', text: `${t.theory.next} →` }),
            el('span', { class: 'pager__title', text: next.titleIT }),
          ],
        )
      : el('span'),
  ]);

  const warning =
    rendered.mathErrors.length > 0
      ? el('p', {
          class: 'callout callout--danger',
          attrs: { role: 'note' },
          text: t.theory.mathErrors,
        })
      : null;

  // DOM order header → TOC → body (reading order); CSS grid puts the TOC on the right.
  const article = el('article', { class: 'theory-article' }, [warning, body, pager]);
  host.replaceChildren(
    el('div', { class: `theory-page${toc ? ' theory-page--with-toc' : ''}` }, [
      header,
      toc,
      article,
    ]),
  );

  return {
    dispose() {
      offs.splice(0).forEach((off) => off());
      host.replaceChildren();
    },
  };
}
