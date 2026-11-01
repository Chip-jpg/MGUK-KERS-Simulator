/** Always finite, strictly increasing range; units follow the supplied amplitude. */
export function amplitudeRange(amplitude: number, margin = 0.15): [number, number] {
  const a = Number.isFinite(amplitude) ? Math.abs(amplitude) : 0;
  const limit = Math.max(1e-6, Math.min(1e150, a * (1 + Math.max(0, margin))));
  return [-limit, limit];
}

export function finiteRange(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (max <= min) {
    const pad = Math.max(1e-6, Math.abs(min) * 0.15);
    return [min - pad, min + pad];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

/** Explicit 1/2/5 labelled ticks, including ranges around a constant zero signal. */
export function rangeTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [-1, 0, 1];
  const raw = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / magnitude;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let n = Math.ceil(min / step); n <= Math.floor(max / step) && ticks.length < 10; n++)
    ticks.push(n * step);
  return ticks.length >= 2 ? ticks : [min, (min + max) / 2, max];
}
