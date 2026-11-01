import { t } from '../core/i18n/it';
import { onLoopFrame } from '../core/loop';
import { formatRoute } from '../core/router';
import { getShowFps, onShowFpsChange, setShowFps } from '../core/settings';
import type { Disposable, SimModule } from '../core/types';
import { createButton } from './controls';
import { el, uniqueId } from './dom';
import { createFpsCounter } from './fpsCounter';
import {
  createFullscreenButton,
  createFullscreenController,
  type FullscreenController,
} from './fullscreen';

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
 *
 * Every layout also provides, with no sim wiring:
 * - F5: a "Schermo intero (F)" toolbar button and the `F` key (fullscreen of `root`;
 *   the scene canvas and plots follow through their ResizeObservers);
 * - F7: the FPS counter over the scene (sidebar switch or the `` ` `` key), fed by
 *   every running `createLoop`.
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
  /**
   * Register a scene legend / HUD box. It is shown over the scene (in `sceneOverlay`) while
   * the scene is large; when the scene is compact (height < {@link COMPACT_SCENE_HEIGHT} px or
   * width < {@link COMPACT_SCENE_WIDTH} px, e.g. 1280×720) it moves OUT of the canvas into
   * the collapsible "Legenda" block just below the scene, so it never covers the 3D view.
   * In-canvas boxes are obstacles for the label layer (labels never sit on them).
   */
  addSceneLegend(element: HTMLElement): void;
  /** True while legends are docked below the scene (compact scene). */
  readonly compact: boolean;
  /** Fullscreen controller of `root` (button + `F` key are already wired). */
  readonly fullscreen: FullscreenController;
}

/** Inputs where typing must not trigger the layout shortcuts (F, `). */
const TYPING_INPUT_TYPES = new Set([
  'text',
  'number',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

/** True when a key event comes from a place where the user is typing text. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TYPING_INPUT_TYPES.has(target.type || 'text');
  return target instanceof HTMLElement && target.isContentEditable;
}

/** `F` / `f` without Ctrl/Alt/Meta (fullscreen shortcut). */
export function isFullscreenKey(e: KeyboardEvent): boolean {
  return (e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.altKey && !e.metaKey;
}

/** Backtick (FPS counter shortcut); on keyboards without it, the key in its position. */
export function isFpsKey(e: KeyboardEvent): boolean {
  if (e.key === '`') return !e.metaKey;
  return e.code === 'Backquote' && !e.ctrlKey && !e.altKey && !e.metaKey;
}

/** Below this scene height [px] legends/HUD leave the canvas (QA-031). */
export const COMPACT_SCENE_HEIGHT = 420;
/** Below this scene width [px] legends/HUD leave the canvas. */
export const COMPACT_SCENE_WIDTH = 640;

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

  // Legend dock: collapsible block under the scene, used while the scene is compact.
  const legendBody = el('div', { class: 'sim-legend-dock__body' });
  const legendDock = el(
    'details',
    { class: 'sim-legend-dock', attrs: { open: true, hidden: true, 'data-testid': 'legend-dock' } },
    [el('summary', { class: 'sim-legend-dock__summary', text: t.sim.legend }), legendBody],
  );
  const legends: HTMLElement[] = [];
  let compact = false;
  const placeLegends = (): void => {
    for (const lg of legends) {
      const parent = compact ? legendBody : sceneOverlay;
      if (lg.parentElement !== parent) parent.append(lg);
    }
    legendDock.hidden = !compact || legends.length === 0;
    scene.classList.toggle('sim-scene--compact', compact);
  };
  const evaluateCompact = (): void => {
    const h = scene.clientHeight;
    const w = scene.clientWidth;
    if (h === 0 && w === 0) return; // detached / not laid out
    const next = h < COMPACT_SCENE_HEIGHT || w < COMPACT_SCENE_WIDTH;
    if (next !== compact) {
      compact = next;
      placeLegends();
    }
  };
  const ro =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => evaluateCompact());
  ro?.observe(scene);

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
    el('div', { class: 'sim-layout__main' }, [toolbar, stage, legendDock]),
    side,
    plotsSection,
    note,
  ]);
  host.append(root);

  // F5 — fullscreen of the whole layout (state kept: nothing is re-mounted).
  const fullscreen = createFullscreenController(root);
  const fsButton = createFullscreenButton(fullscreen);
  toolbar.append(fsButton.element);

  // F7 — FPS counter over the scene, fed by every running loop while shown.
  // Top-right corner of the overlay is reserved for it (D1: HUD grids use tl, bl, br).
  const fps = createFpsCounter(sceneOverlay);
  let offFrames: (() => void) | null = null;
  const showFps = (show: boolean): void => {
    fps.element.hidden = !show;
    if (show && !offFrames) {
      fps.reset();
      offFrames = onLoopFrame((now) => fps.frame(now));
    } else if (!show && offFrames) {
      offFrames();
      offFrames = null;
    }
  };
  showFps(getShowFps());
  const offShowFps = onShowFpsChange(showFps);

  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.repeat || isTypingTarget(e.target)) return;
    if (!root.isConnected) return;
    if (isFullscreenKey(e)) {
      e.preventDefault();
      void fullscreen.toggle();
    } else if (isFpsKey(e)) {
      e.preventDefault();
      setShowFps(!getShowFps());
    }
  };
  const doc = root.ownerDocument;
  doc.addEventListener('keydown', onKey);

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
    addSceneLegend(element) {
      element.dataset['sceneLegend'] = '';
      element.classList.add('sim-scene-legend');
      if (!legends.includes(element)) legends.push(element);
      evaluateCompact();
      placeLegends();
    },
    get compact() {
      return compact;
    },
    fullscreen,
    dispose() {
      doc.removeEventListener('keydown', onKey);
      offShowFps();
      offFrames?.();
      offFrames = null;
      fps.dispose();
      fsButton.dispose();
      fullscreen.dispose();
      ro?.disconnect();
      legends.length = 0;
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
