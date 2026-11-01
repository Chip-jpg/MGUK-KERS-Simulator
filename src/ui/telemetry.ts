import { createPlot } from './plot';
import { el } from './dom';

export interface CarTelemetry {
  t: number;
  v: number;
  a: number;
  pKers: number;
  pBrakes: number;
  soc: number;
}
/** Each quantity gets its own units, all charts have the same rolling 12 s axis. */
export function createCarTelemetryPlots(container: HTMLElement) {
  const element = el('section', {
    class: 'car-telemetry',
    attrs: { 'aria-label': 'Telemetria in tempo reale' },
  });
  container.append(element);
  const defs = [
    { titleIT: 'Velocità v(t)', labelIT: 'v', unit: 'km/h', quantity: 'accent' as const },
    {
      titleIT: 'Accelerazione a(t) — positiva in accelerazione',
      labelIT: 'a',
      unit: 'm/s²',
      quantity: 'f' as const,
    },
    {
      titleIT: 'MGU-K: + erogazione / − recupero',
      labelIT: 'MGU-K',
      unit: 'kW',
      quantity: 'energy' as const,
    },
    { titleIT: 'Potenza ai freni a disco', labelIT: 'Freni', unit: 'kW', quantity: 'i' as const },
    { titleIT: 'Carica della batteria', labelIT: 'SoC', unit: '%', quantity: 'energy' as const },
  ];
  const plots = defs.map((d, i) =>
    createPlot(element, {
      ...d,
      series: [{ ...d, dash: i % 2 ? [6, 4] : [], digits: 2 }],
      syncKey: 'car-telemetry',
      xLabelIT: 't',
      xUnit: 's',
      yLabelIT: d.unit,
      xWindow: 12,
      height: 180,
      ...(i === 4 ? { yRange: [0, 100] as [number, number] } : {}),
    }),
  );
  // g is a linked view, not a differently scaled curve on an SI-only axis.
  const g = createPlot(element, {
    titleIT: 'Accelerazione in multipli di g',
    series: [{ labelIT: 'a/g', unit: 'g', quantity: 'f', dash: [3, 3], digits: 2 }],
    syncKey: 'car-telemetry',
    xLabelIT: 't',
    xUnit: 's',
    yLabelIT: 'g',
    xWindow: 12,
    height: 180,
  });
  let last = -Infinity;
  return {
    element,
    push(q: CarTelemetry) {
      if (q.t < last) {
        plots.forEach((p) => p.clear());
        g.clear();
        last = -Infinity;
      }
      if (q.t - last < 1 / 30 - 1e-8) return;
      last = q.t;
      const values = [q.v * 3.6, q.a, q.pKers / 1000, q.pBrakes / 1000, q.soc * 100];
      plots.forEach((p, i) => p.push(q.t, values[i]!));
      g.push(q.t, q.a / 9.80665);
    },
    clear() {
      plots.forEach((p) => p.clear());
      g.clear();
      last = -Infinity;
    },
    dispose() {
      plots.forEach((p) => p.dispose());
      g.dispose();
      element.remove();
    },
  };
}
