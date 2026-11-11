import { lineLoss, transmissionSweep } from '../../physics/transformer';
import { formatIT } from '../../core/format';
import { createPlot, type Plot } from '../../ui/plot';
import { createSegmented } from '../../ui/controls';
import { el } from '../../ui/dom';
import type { TransmissionInputs, TransmissionResult } from './model';

/** Extended inspection views; existing formula panel and comparison bars stay. */
export function createTransmissionPlots(container: HTMLElement) {
  const element = el('section', {
    class: 'transmission-plots',
    attrs: { 'aria-label': 'Analisi delle perdite di linea' },
  });
  const annotation = el('p', { class: 'transmission-annotation' });
  const reference = el('p', {
    text: 'Riferimenti didattici della catena: centrale 10 kV → trasporto 220–380 kV → sottostazioni 20–132 kV → utenze 380 V / 220 V nella presentazione (valori storici; oggi i nominali sono 400 V / 230 V), sotto il limite sinistro di 1 kV. Trasformatore ideale; nella realtà ci sono perdite nel nucleo.',
  });
  const main = el('div', { class: 'transmission-plots__grid' });
  const secondary = el('div', { class: 'transmission-plots__grid' });
  const markers = [10, 20, 132, 220, 380].map((value) => ({ value, labelIT: `${value} kV` }));
  const common = {
    syncKey: 'transmission-voltage',
    xLabelIT: 'Tensione',
    xUnit: 'kV',
    xLog: true,
    xRange: [1, 400] as [number, number],
    xMarkers: markers,
    height: 240,
    capacity: 256,
  };
  const loss = createPlot(main, {
    ...common,
    titleIT: 'Perdite Joule al variare della tensione',
    yLabelIT: 'kW',
    series: [
      { labelIT: 'R·I²', unit: 'kW', quantity: 'energy', digits: 2 },
      { labelIT: 'Punto di lavoro', unit: 'kW', quantity: 'accent', width: 9, points: true },
    ],
  });
  const fraction = createPlot(main, {
    ...common,
    titleIT: 'Frazione della potenza persa',
    yLabelIT: '%',
    series: [
      { labelIT: 'Perdite / P', unit: '%', quantity: 'energy', dash: [6, 4], digits: 2 },
      { labelIT: 'Punto di lavoro', unit: '%', quantity: 'accent', width: 9, points: true },
    ],
  });
  const current = createPlot(main, {
    ...common,
    titleIT: 'Corrente I = P/V',
    yLabelIT: 'A',
    series: [
      { labelIT: 'I', unit: 'A', quantity: 'i', dash: [3, 3], digits: 1 },
      { labelIT: 'Punto di lavoro', unit: 'A', quantity: 'accent', width: 9, points: true },
    ],
  });
  const rPlot = createPlot(secondary, {
    titleIT: 'Perdite al variare della resistenza',
    xLabelIT: 'R',
    xUnit: 'Ω',
    yLabelIT: 'kW',
    height: 240,
    series: [{ labelIT: 'Perdite', unit: 'kW', quantity: 'energy', digits: 2 }],
  });
  const pPlot = createPlot(secondary, {
    titleIT: 'Perdite al variare della potenza trasmessa',
    xLabelIT: 'P',
    xUnit: 'MW',
    yLabelIT: 'kW',
    height: 240,
    series: [{ labelIT: 'Perdite', unit: 'kW', quantity: 'energy', dash: [6, 4], digits: 2 }],
  });
  pPlot.element.hidden = true;
  const tabs = createSegmented<'R' | 'P'>({
    labelIT: 'Vista secondaria',
    value: 'R',
    options: [
      { value: 'R', labelIT: 'Resistenza R' },
      { value: 'P', labelIT: 'Potenza P' },
    ],
    onChange: (value) => {
      rPlot.element.hidden = value !== 'R';
      pPlot.element.hidden = value !== 'P';
    },
  });
  element.append(annotation, reference, main, tabs.element, secondary);
  container.append(element);
  const plots: Plot[] = [loss, fraction, current, rPlot, pPlot];
  return {
    update(p: TransmissionInputs, result: TransmissionResult) {
      const rows = transmissionSweep(p.P, p.Rline, result.V2);
      const x = rows.map((r) => r.V / 1000);
      const values = [
        rows.map((r) => r.loss / 1000),
        rows.map((r) => r.fraction * 100),
        rows.map((r) => r.I),
      ];
      for (const [i, chart] of [loss, fraction, current].entries()) {
        const ys = values[i]!;
        chart.setData(
          x,
          ys,
          rows.map((r, j) => (r.V === result.V2 ? ys[j]! : NaN)),
        );
      }
      const R = Array.from({ length: 101 }, (_, i) => i / 2);
      const P = Array.from({ length: 101 }, (_, i) => i);
      rPlot.setData(
        R,
        R.map((r) => lineLoss(p.P, result.V2, r).loss / 1000),
      );
      pPlot.setData(
        P,
        P.map((mw) => lineLoss(mw * 1e6, result.V2, p.Rline).loss / 1000),
      );
      const low = lineLoss(p.P, result.V2, p.Rline);
      const high = lineLoss(p.P, result.V2 * 10, p.Rline);
      annotation.textContent =
        `Punto di lavoro: ${formatIT(result.V2 / 1000, 2)} kV; I = ${formatIT(low.I, 2)} A; perdite = ${formatIT(low.loss / 1000, 2)} kW (${formatIT(low.fraction * 100, 2)} %). ` +
        `10× tensione (${formatIT((result.V2 * 10) / 1000, 2)} kV) ⇒ ${formatIT(high.loss / 1000, 2)} kW: ` +
        (high.loss > 0
          ? `${formatIT(low.loss / high.loss, 0)}× meno perdite.`
          : 'perdite nulle; rapporto non definito.') +
        (result.V2 < 1000 || result.V2 > 400000
          ? ' Punto di lavoro fuori dal dominio 1–400 kV.'
          : '') +
        (low.fraction > 1 ? ' Perdita > 100 %: il modello della linea è fuori validità.' : '');
      element.dataset['operatingLoss'] = String(low.loss);
      element.dataset['operatingCurrent'] = String(low.I);
      element.dataset['operatingFraction'] = String(low.fraction);
    },
    dispose() {
      plots.forEach((p) => p.dispose());
      tabs.dispose();
      element.remove();
    },
  };
}
