import { t } from '../core/i18n/it';
import type { Disposable } from '../core/types';
import { createButton } from './controls';
import { el } from './dom';

/**
 * Fullscreen (F5) for a simulator: the whole layout root (scene + controls + readouts
 * + plots) goes fullscreen, so nothing is re-mounted and the simulation state is kept.
 * The Three.js stage and the plots follow the new size through their ResizeObservers.
 * Uses the standard Fullscreen API with the WebKit-prefixed fallback (Safari). Without
 * the API (or when the request is refused) it falls back to a *pseudo* fullscreen: the
 * `.sim-layout--fullscreen` class alone makes the layout fill the window (D1 CSS), Esc
 * leaves it.
 */

export interface FullscreenControllerOptions {
  /** Called on every enter / exit (also when the user presses Esc). */
  onChange?(on: boolean): void;
}

export interface FullscreenController extends Disposable {
  toggle(): Promise<void>;
  enter(): Promise<void>;
  exit(): Promise<void>;
  isActive(): boolean;
  /** True while in the pseudo fullscreen fallback (class only, no Fullscreen API). */
  isPseudo(): boolean;
  /** False when the browser (or an iframe policy) does not allow the Fullscreen API. */
  readonly supported: boolean;
}

interface PrefixedDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}

interface PrefixedElement {
  requestFullscreen?: (o?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

function fsElement(doc: PrefixedDocument): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** True when `target` can be put in fullscreen in this document. */
export function fullscreenSupported(target: HTMLElement): boolean {
  const doc = target.ownerDocument as unknown as PrefixedDocument;
  const el = target as unknown as PrefixedElement;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
  return (
    enabled === true &&
    (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function')
  );
}

/**
 * Dispatched on the document after every enter / exit (real or pseudo fullscreen), once
 * the `.sim-layout--fullscreen` class is in place: `detail = { target, on }`. Plots use
 * it to re-read `--plot-axis-font-size`.
 */
export const FULLSCREEN_EVENT = 'kers:fullscreen';

export interface FullscreenEventDetail {
  target: HTMLElement;
  on: boolean;
}

export function createFullscreenController(
  target: HTMLElement,
  o: FullscreenControllerOptions = {},
): FullscreenController {
  const doc = target.ownerDocument;
  const pdoc = doc as unknown as PrefixedDocument;
  const pel = target as unknown as PrefixedElement;
  const supported = fullscreenSupported(target);
  let disposed = false;
  let last = false;
  let pseudo = false;

  const isActive = (): boolean => pseudo || fsElement(pdoc) === target;

  const sync = (): void => {
    const on = isActive();
    target.classList.toggle('sim-layout--fullscreen', on);
    if (on !== last) {
      last = on;
      o.onChange?.(on);
      doc.dispatchEvent(
        new CustomEvent<FullscreenEventDetail>(FULLSCREEN_EVENT, { detail: { target, on } }),
      );
    }
  };
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);

  const onEsc = (e: KeyboardEvent): void => {
    if (pseudo && e.key === 'Escape') {
      e.preventDefault();
      void exit();
    }
  };

  const enterPseudo = (): void => {
    pseudo = true;
    doc.addEventListener('keydown', onEsc);
  };

  const enter = async (): Promise<void> => {
    if (disposed || isActive()) return;
    if (!supported) enterPseudo();
    else {
      try {
        if (pel.requestFullscreen) await pel.requestFullscreen({ navigationUI: 'hide' });
        else pel.webkitRequestFullscreen?.();
      } catch {
        enterPseudo(); // refused (policy, iframe): enlarge inside the page instead
      }
    }
    sync();
  };

  async function exit(): Promise<void> {
    if (pseudo) {
      pseudo = false;
      doc.removeEventListener('keydown', onEsc);
    } else if (fsElement(pdoc) === target) {
      try {
        if (pdoc.exitFullscreen) await pdoc.exitFullscreen.call(doc);
        else pdoc.webkitExitFullscreen?.call(doc);
      } catch {
        /* already left */
      }
    }
    sync();
  }

  return {
    supported,
    isActive,
    isPseudo: () => pseudo,
    enter,
    exit,
    toggle: () => (isActive() ? exit() : enter()),
    dispose() {
      if (disposed) return;
      if (isActive()) void exit();
      disposed = true;
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('webkitfullscreenchange', sync);
      doc.removeEventListener('keydown', onEsc);
      target.classList.remove('sim-layout--fullscreen');
    },
  };
}

export interface FullscreenButton extends Disposable {
  readonly element: HTMLButtonElement;
  /** Re-read the controller state (aria-pressed, tooltip). */
  refresh(): void;
}

/**
 * "Schermo intero (F)" toolbar button (`.fs-button`, `aria-pressed`). Without the
 * Fullscreen API it still works (pseudo fullscreen, Esc exits) and says so: tooltip and
 * accessible name carry "Schermo intero non disponibile in questo browser".
 */
export function createFullscreenButton(controller: FullscreenController): FullscreenButton {
  const button = createButton({
    labelIT: t.fullscreen.label,
    icon: '⛶',
    variant: 'ghost',
    title: t.fullscreen.title,
    onClick: () => void controller.toggle(),
  });
  const element = button.element;
  element.classList.add('fs-button');
  element.setAttribute('aria-keyshortcuts', 'F');
  const refresh = (): void => {
    const on = controller.isActive();
    element.setAttribute('aria-pressed', String(on));
    element.title = on
      ? t.fullscreen.exitTitle
      : controller.supported
        ? t.fullscreen.title
        : t.fullscreen.unavailableTitle;
  };
  if (!controller.supported) {
    element.append(
      el('span', { class: 'visually-hidden', text: ` (${t.fullscreen.unavailable})` }),
    );
    element.dataset['unavailable'] = '';
  }
  refresh();
  const doc = element.ownerDocument;
  doc.addEventListener(FULLSCREEN_EVENT, refresh);
  return {
    element,
    refresh,
    dispose() {
      doc.removeEventListener(FULLSCREEN_EVENT, refresh);
      button.dispose();
    },
  };
}
