import { t } from '../core/i18n/it';
import type { Loop } from '../core/loop';
import type { Disposable } from '../core/types';
import { createButton, type ButtonHandle } from './controls';

/** The part of a {@link Loop} the toolbar drives. */
export type ToolbarLoop = Pick<Loop, 'pause' | 'resume' | 'stepOnce' | 'isPaused'>;

export interface SimToolbarOptions {
  /** Render loop to pause / resume / step. Omit for static sims (only Reset is shown). */
  loop?: ToolbarLoop;
  /** Restore default parameters and state. */
  onReset: () => void;
  /** Called after pause/resume with the new paused state. */
  onPauseChange?: (paused: boolean) => void;
  /** Called after "Passo" stepped the loop. */
  onStep?: () => void;
}

export interface SimToolbar extends Disposable {
  readonly element: HTMLElement;
  /** Re-read `loop.isPaused()` and refresh the Pausa/Avvia button. */
  refresh(): void;
}

/**
 * Reset / Pausa (Riprendi) / Passo buttons. Mount it into `layout.toolbar`
 * (it is inserted before the layout's own "Mostra formule" button).
 * "Passo" pauses the loop first, then advances one physics step.
 */
export function createSimToolbar(container: HTMLElement, o: SimToolbarOptions): SimToolbar {
  const element = document.createElement('div');
  element.className = 'toolbar__group';
  const buttons: ButtonHandle[] = [];

  const reset = createButton({ labelIT: t.controls.reset, icon: '↺', onClick: () => o.onReset() });
  buttons.push(reset);
  element.append(reset.element);

  let pause: ButtonHandle | null = null;
  const refresh = (): void => {
    if (!pause || !o.loop) return;
    const paused = o.loop.isPaused();
    pause.setLabel(paused ? t.controls.resume : t.controls.pause, paused ? '▶' : '❚❚');
  };

  if (o.loop) {
    const loop = o.loop;
    pause = createButton({
      labelIT: t.controls.pause,
      onClick: () => {
        if (loop.isPaused()) loop.resume();
        else loop.pause();
        refresh();
        o.onPauseChange?.(loop.isPaused());
      },
    });
    const step = createButton({
      labelIT: t.controls.stepShort,
      icon: '⏭',
      ariaLabel: t.controls.step,
      title: t.controls.step,
      onClick: () => {
        if (!loop.isPaused()) {
          loop.pause();
          refresh();
          o.onPauseChange?.(true);
        }
        loop.stepOnce();
        o.onStep?.();
      },
    });
    buttons.push(pause, step);
    element.append(pause.element, step.element);
    refresh();
  }

  container.prepend(element);

  return {
    element,
    refresh,
    dispose() {
      buttons.splice(0).forEach((b) => b.dispose());
      element.remove();
    },
  };
}
