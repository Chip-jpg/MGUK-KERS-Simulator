import { el, listen } from './dom';
import { formatIT } from '../core/format';

/** Momentary pedal: hold with mouse, touch, Space or Enter; release never latches. */
export function createPedalButton(kind: 'throttle' | 'brake', onHeld: (held: boolean) => void) {
  const label = kind === 'throttle' ? 'Acceleratore' : 'Freno';
  const value = el('span', {
    class: 'drive-pedal__value',
    text: '0 %',
    attrs: { 'aria-hidden': 'true' },
  });
  const element = el(
    'button',
    {
      class: `drive-pedal drive-pedal--${kind}`,
      attrs: { type: 'button', 'aria-label': label, 'aria-pressed': 'false' },
    },
    [
      el('strong', { text: label }),
      value,
      el('span', {
        class: 'drive-pedal__hint',
        text: kind === 'throttle' ? 'Tieni premuto · W / ↑' : 'Tieni premuto · S / ↓',
      }),
    ],
  );
  const pointers = new Set<number>();
  let keyboard = false;
  let held = false;
  const sync = (): void => {
    const next = keyboard || pointers.size > 0;
    if (next === held) return;
    held = next;
    element.setAttribute('aria-pressed', String(held));
    onHeld(held);
  };
  const releasePointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    sync();
  };
  const off = [
    listen(element, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      element.focus({ preventScroll: true });
      element.setPointerCapture(e.pointerId);
      pointers.add(e.pointerId);
      sync();
    }),
    listen(element, 'pointerup', releasePointer),
    listen(element, 'pointercancel', releasePointer),
    listen(element, 'lostpointercapture', releasePointer),
    listen(element, 'keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      keyboard = true;
      sync();
    }),
    listen(element, 'keyup', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      keyboard = false;
      sync();
    }),
    listen(element, 'blur', () => {
      keyboard = false;
      sync();
    }),
  ];
  const release = (): void => {
    keyboard = false;
    for (const pointer of pointers) {
      if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
    }
    pointers.clear();
    sync();
  };
  return {
    element,
    release,
    setLevel(level: number) {
      const percent = Math.round(level * 100);
      value.textContent = `${formatIT(percent, 0)} %`;
      element.style.setProperty('--pedal-level', `${percent}%`);
    },
    dispose() {
      release();
      off.forEach((remove) => remove());
      element.remove();
    },
  };
}
