import { t } from '../core/i18n/it';
import { formatRoute } from '../core/router';
import type { Disposable, SimModule } from '../core/types';
import { createButton } from './controls';
import { el, uniqueId } from './dom';

/**
 * Standard simulator page body. A `SimModule.mount(host, ctx)` calls
 * `createSimLayout(host)` and fills the returned regions:
 *
 * ```
 * ┌ toolbar (Reset · Pausa · Passo · Mostra formule) ┐ ┌ controls (Parametri) ┐
 * │ scene  (Three.js canvas; `overlay` for labels)   │ │ formulas (Formule)   │
 * └──────────────────────────────────────────────────┘ └──────────────────────┘
 * ┌ plots (Grafici, auto-hidden while empty) ──────────────────────────────────┐
 * └ note: "Modello semplificato: …" ───────────────────────────────────────────┘
 * ```
 *
 * The page header (title, summary, theory link) is rendered by the
 * shell from the SimModule metadata, outside `host`.
 */
export interface SimLayoutOptions {
  /** Text after "Modello semplificato:" (§9: every simulator states its assumptions). */
  modelNoteIT?: string;
}

export interface SimLayout extends Disposable {
  readonly root: HTMLElement;
  /** Put buttons here; `createSimToolbar(layout.toolbar, …)` prepends Reset/Pausa/Passo. */
  readonly toolbar: HTMLElement;
  /** Scene container (position: relative). Append the renderer canvas here. */
  readonly scene: HTMLElement;
  /** Absolutely positioned layer over the scene for HTML labels (pointer-events: none). */
  readonly sceneOverlay: HTMLElement;
  /** Sliders / toggles go here (inside the "Parametri" section). */
  readonly controls: HTMLElement;
  /** `createFormulaPanel(layout.formulas, …)` goes here. */
  readonly formulas: HTMLElement;
  /** `createPlot(layout.plots, …)` goes here (grid, one or two columns). */
  readonly plots: HTMLElement;
  /** "Modello semplificato: …" note. */
  readonly note: HTMLElement;
  setModelNote(textIT: string): void;
  /** Show the formulas enlarged over the scene ("Mostra formule"). */
  setFormulasOverlay(show: boolean): void;
}

export function createSimLayout(host: HTMLElement, options: SimLayoutOptions = {}): SimLayout {
  host.replaceChildren();
  const controlsTitleId = uniqueId('sim-controls-title');
  const plotsTitleId = uniqueId('sim-plots-title');

  const toolbar = el('div', {
    class: 'sim-toolbar',
    attrs: { role: 'group', 'aria-label': t.controls.toolbar },
  });
  const scene = el('div', {
    class: 'sim-scene',
    attrs: { role: 'region', 'aria-label': t.sim.sceneLabel },
  });
  const sceneOverlay = el('div', { class: 'sim-scene__overlay', attrs: { 'aria-hidden': 'true' } });
  const formulaOverlay = el('div', {
    class: 'sim-formula-overlay',
    attrs: { role: 'region', 'aria-label': t.sim.formulasOverlay, hidden: true },
  });
  scene.append(sceneOverlay);
  const stage = el('div', { class: 'sim-stage' }, [scene, formulaOverlay]);

  const controls = el('div', { class: 'sim-controls__body' });
  const formulas = el('div', { class: 'sim-formulas' });
  const formulasSlot = el('div', { class: 'sim-formulas-slot' }, [formulas]);
  const side = el('div', { class: 'sim-layout__side' }, [
    el('section', { class: 'sim-controls panel', attrs: { 'aria-labelledby': controlsTitleId } }, [
      el('h2', { class: 'panel-title', text: t.sim.parameters, attrs: { id: controlsTitleId } }),
      controls,
    ]),
    formulasSlot,
  ]);

  const plots = el('div', { class: 'sim-plots__body' });
  const plotsSection = el(
    'section',
    { class: 'sim-plots', attrs: { 'aria-labelledby': plotsTitleId } },
    [el('h2', { class: 'panel-title', text: t.sim.plots, attrs: { id: plotsTitleId } }), plots],
  );

  const note = el('p', { class: 'sim-note', attrs: { role: 'note' } });
  const setModelNote = (text: string): void => {
    note.replaceChildren(el('strong', { text: `${t.sim.simplifiedModel}:` }), ` ${text}`);
    note.hidden = text.trim() === '';
  };
  setModelNote(options.modelNoteIT ?? '');

  let overlayShown = false;
  const formulasButton = createButton({
    labelIT: t.controls.showFormulas,
    icon: 'ƒ',
    variant: 'ghost',
    onClick: () => setFormulasOverlay(!overlayShown),
  });
  formulasButton.element.classList.add('sim-toolbar__formulas');
  formulasButton.element.setAttribute('aria-pressed', 'false');
  toolbar.append(formulasButton.element);

  function setFormulasOverlay(show: boolean): void {
    overlayShown = show;
    if (show) formulaOverlay.append(formulas);
    else formulasSlot.append(formulas);
    formulaOverlay.hidden = !show;
    formulasButton.element.setAttribute('aria-pressed', String(show));
  }

  const root = el('div', { class: 'sim-layout' }, [
    el('div', { class: 'sim-layout__main' }, [toolbar, stage]),
    side,
    plotsSection,
    note,
  ]);
  host.append(root);

  return {
    root,
    toolbar,
    scene,
    sceneOverlay,
    controls,
    formulas,
    plots,
    note,
    setModelNote,
    setFormulasOverlay,
    dispose() {
      formulasButton.dispose();
      root.remove();
    },
  };
}

/** Metadata the header needs (a SimModule satisfies it). */
export type SimHeaderMeta = Pick<SimModule, 'titleIT' | 'summaryIT' | 'theoryId'>;

/** Page header used by the shell: h1, summary, "Vai alla teoria" link. */
export function createSimHeader(meta: SimHeaderMeta, badgeIT?: string): HTMLElement {
  const title = el('h1', { class: 'page-title', text: meta.titleIT, attrs: { tabindex: -1 } });
  if (badgeIT) title.append(' ', el('span', { class: 'badge', text: badgeIT }));
  const links = el('div', { class: 'sim-header__links' });
  if (meta.theoryId) {
    links.append(
      el('a', {
        class: 'link-button',
        text: `${t.sim.theoryLink} →`,
        attrs: { href: formatRoute({ kind: 'teoria', id: meta.theoryId }) },
      }),
    );
  }
  return el('header', { class: 'sim-header' }, [
    title,
    meta.summaryIT ? el('p', { class: 'lead', text: meta.summaryIT }) : null,
    links.childElementCount > 0 ? links : null,
  ]);
}
