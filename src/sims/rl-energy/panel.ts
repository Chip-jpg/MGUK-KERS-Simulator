import { el, formatIT } from '../../ui';
import type { EnergyBalance } from './model';

const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Scientific notation, Italian style: 1.2e-13 → "1,2·10⁻¹³". */
export function fmtSci(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return formatIT(Number.NaN);
  if (x === 0) return formatIT(0, 0);
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 4) return formatIT(x, Math.max(0, digits + 1 - e));
  const m = x / 10 ** e;
  const exp = String(e)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');
  return `${formatIT(m, digits)}·10${exp}`;
}

/** Energy with an adaptive number of digits (J). */
export function fmtJ(x: number): string {
  const a = Math.abs(x);
  const d = a === 0 ? 2 : a < 0.01 ? 5 : a < 1 ? 3 : a < 100 ? 2 : 1;
  return formatIT(x, d, 'J');
}

/** Tolerance shown for the generator = Joule + field check (relative). */
export const BALANCE_TOLERANCE = 1e-6;

export interface EnergyBars {
  readonly element: HTMLElement;
  /** `scale` = energy [J] that fills a whole bar. */
  update(b: EnergyBalance, scale: number): void;
  dispose(): void;
}

/** Bars: generator energy (purple) vs stacked Joule heat (red) + field energy (blue). */
export function createEnergyBars(container: HTMLElement): EnergyBars {
  const genFill = el('span', { class: 'rl-bar__fill rl-bar__fill--gen' });
  const jFill = el('span', { class: 'rl-bar__fill rl-bar__fill--joule' });
  const fFill = el('span', { class: 'rl-bar__fill rl-bar__fill--field' });
  const genVal = el('span', { class: 'rl-bar__value', attrs: { 'data-testid': 'e-gen' } });
  const jVal = el('span', { class: 'rl-legend__value', attrs: { 'data-testid': 'e-joule' } });
  const fVal = el('span', { class: 'rl-legend__value', attrs: { 'data-testid': 'e-field' } });
  const sumVal = el('span', { class: 'rl-bar__value', attrs: { 'data-testid': 'e-sum' } });
  const balance = el('p', {
    class: 'rl-balance',
    attrs: { role: 'status', 'data-testid': 'balance' },
  });
  const element = el('figure', { class: 'plot rl-energy' }, [
    el('figcaption', {
      class: 'plot__title',
      text: 'Bilancio energetico: generatore = Joule + campo',
    }),
    el('div', { class: 'rl-bar' }, [
      el('span', { class: 'rl-bar__label', text: 'Generatore ∫E·i dt' }),
      el('span', { class: 'rl-bar__track' }, [genFill]),
      genVal,
    ]),
    el('div', { class: 'rl-bar' }, [
      el('span', { class: 'rl-bar__label', text: 'Joule + campo' }),
      el('span', { class: 'rl-bar__track' }, [jFill, fFill]),
      sumVal,
    ]),
    el('p', { class: 'rl-legend' }, [
      el('span', { class: 'rl-swatch rl-swatch--joule', attrs: { 'aria-hidden': 'true' } }),
      ' Calore Joule ∫R·i² dt = ',
      jVal,
      ' · ',
      el('span', { class: 'rl-swatch rl-swatch--field', attrs: { 'aria-hidden': 'true' } }),
      ' Energia del campo ½·L·i² = ',
      fVal,
    ]),
    balance,
  ]);
  container.append(element);

  const pct = (x: number, s: number): string =>
    `${(s > 0 ? Math.max(0, Math.min(100, (x / s) * 100)) : 0).toFixed(2)}%`;

  return {
    element,
    update(b, scale) {
      genFill.style.width = pct(b.gen, scale);
      jFill.style.width = pct(b.joule, scale);
      fFill.style.width = pct(b.field, scale);
      genVal.textContent = fmtJ(b.gen);
      jVal.textContent = fmtJ(b.joule);
      fVal.textContent = fmtJ(b.field);
      sumVal.textContent = fmtJ(b.joule + b.field);
      const ok = b.relError <= BALANCE_TOLERANCE;
      balance.className = `rl-balance${ok ? ' rl-balance--ok' : ''}`;
      balance.textContent =
        b.gen === 0
          ? 'Interruttore aperto: nessuno scambio di energia.'
          : `${ok ? '✓' : '✗'} Scarto relativo tra energia del generatore e (calore Joule + energia magnetica): ${fmtSci(b.relError)} (tolleranza ${fmtSci(BALANCE_TOLERANCE, 0)})`;
    },
    dispose() {
      element.remove();
    },
  };
}
