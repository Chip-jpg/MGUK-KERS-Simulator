import { createButton } from './controls';
import { el } from './dom';

export function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Fullscreen and presentation are independent; neither remounts the simulator. */
export function createFullscreenController(root: HTMLElement, toolbar: HTMLElement) {
  root.tabIndex = -1;
  const status = el('span', { class: 'fullscreen-status', attrs: { role: 'status' } });
  const toggle = async (): Promise<void> => {
    try {
      if (document.fullscreenElement === root) await document.exitFullscreen();
      else if (root.requestFullscreen) await root.requestFullscreen();
      else status.textContent = 'Schermo intero non disponibile in questo browser.';
    } catch {
      status.textContent = 'Schermo intero non disponibile: usa i comandi del browser.';
    }
  };
  const button = createButton({
    labelIT: 'Schermo intero',
    icon: '⛶',
    title: 'Schermo intero (F)',
    onClick: () => void toggle(),
  });
  button.element.dataset['fullscreen'] = '';
  const sync = (): void => {
    const active = document.fullscreenElement === root;
    if (active) root.focus({ preventScroll: true });
    button.element.setAttribute('aria-pressed', String(active));
    button.setLabel(active ? 'Esci da schermo intero' : 'Schermo intero', '⛶');
  };
  const presentation = createButton({
    labelIT: 'Presentazione',
    title: 'Presentazione (P)',
    icon: '▣',
    onClick: () => {
      const on = root.classList.toggle('sim-presentation');
      presentation.element.setAttribute('aria-pressed', String(on));
      root.dispatchEvent(new Event('kers-presentation-change'));
    },
  });
  presentation.element.setAttribute('aria-pressed', 'false');
  const keydown = (e: KeyboardEvent): void => {
    if (isEditing(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      void toggle();
    }
    if (e.key.toLowerCase() === 'p') {
      e.preventDefault();
      presentation.element.click();
    }
  };
  toolbar.append(button.element, presentation.element, status);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('keydown', keydown);
  sync();
  return {
    dispose() {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', keydown);
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
      button.dispose();
      presentation.dispose();
      status.remove();
    },
  };
}
