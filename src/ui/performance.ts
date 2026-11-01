import { frameStats, resetFrameStats } from '../core/performance';
import { formatIT } from '../core/format';
import { el } from './dom';
import { isEditing } from './fullscreen';
import { registerDebugHook } from '../core/debug';

export function createPerformanceControls(toolbar: HTMLElement) {
  resetFrameStats();
  const unregister = registerDebugHook('performance', frameStats);
  const output = el('output', {
    class: 'fps-counter',
    attrs: { hidden: true, 'aria-label': 'Prestazioni' },
  });
  const toggle = el('button', {
    class: 'btn btn--ghost',
    text: 'FPS',
    attrs: { type: 'button', 'aria-pressed': 'false', title: 'Mostra FPS (`)' },
  });
  const click = (): void => {
    output.hidden = !output.hidden;
    toggle.setAttribute('aria-pressed', String(!output.hidden));
  };
  toggle.addEventListener('click', click);
  const key = (e: KeyboardEvent): void => {
    if (e.key === '`' && !isEditing(e.target) && !e.repeat) click();
  };
  document.addEventListener('keydown', key);
  const interval = window.setInterval(() => {
    if (output.hidden) return;
    const s = frameStats();
    output.textContent = `${formatIT(s.fps, 1)} FPS · ${formatIT(s.ms, 1)} ms · 1 % min: ${formatIT(s.low1, 1)}`;
  }, 500);
  const element = el('div', { class: 'performance-controls' }, [toggle, output]);
  toolbar.append(element);
  return {
    dispose() {
      unregister();
      clearInterval(interval);
      document.removeEventListener('keydown', key);
      toggle.removeEventListener('click', click);
      element.remove();
    },
  };
}
