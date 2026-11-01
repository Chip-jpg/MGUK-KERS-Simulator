import type { Disposable, SimModule } from '../../core/types';
import { mountDrive } from '../shared/drive';
import { createSegmented } from '../../ui/controls';
import { el } from '../../ui/dom';
import braking from '../kers-braking';
const mounted = new WeakMap<HTMLElement, Disposable>();
const sim: SimModule = {
  id: 'kers-drive',
  titleIT: 'MGU-K: accelerazione e frenata',
  summaryIT:
    'La stessa auto accelera usando energia della batteria e frena recuperandola: MGU-K reversibile, freni a disco e telemetria in tempo reale.',
  theoryId: '10-kers-mguk',
  mount(host, ctx) {
    mounted.get(host)?.dispose();
    const content = el('div');
    let active: Disposable | null = null;
    const initial =
      new URLSearchParams(window.location.search).get('comparison') === 'braking'
        ? 'comparison'
        : 'drive';
    const render = (mode: 'drive' | 'comparison'): void => {
      active?.dispose();
      active = mode === 'drive' ? mountDrive(content, ctx, false) : braking.mount(content, ctx);
    };
    const tabs = createSegmented<'drive' | 'comparison'>({
      labelIT: 'Modello longitudinale',
      value: initial,
      options: [
        { value: 'drive', labelIT: 'Accelerazione e frenata' },
        { value: 'comparison', labelIT: 'Confronto: decelerazione costante' },
      ],
      onChange: render,
    });
    tabs.element.classList.add('kers-model-switch');
    host.replaceChildren(tabs.element, content);
    render(initial);
    const handle = {
      dispose() {
        active?.dispose();
        active = null;
        tabs.dispose();
        host.replaceChildren();
        if (mounted.get(host) === handle) mounted.delete(host);
      },
    };
    mounted.set(host, handle);
    return handle;
  },
};
export default sim;
