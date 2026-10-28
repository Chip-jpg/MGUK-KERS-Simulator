/**
 * The generic slider prints the unit unchanged on its scale ("1 spire"); Italian
 * needs the singular for one turn ("1 spira", QA-016). Rewrites only the scale labels.
 */
export function singularTurnsScale(slider: HTMLElement): void {
  for (const span of slider.querySelectorAll<HTMLElement>('.slider__scale span')) {
    const text = span.textContent ?? '';
    if (/^1\s+spire$/u.test(text)) span.textContent = text.replace(/spire$/u, 'spira');
  }
}
