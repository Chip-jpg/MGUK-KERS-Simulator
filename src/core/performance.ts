export type FpsLimit = 'auto' | '60' | '30';
const KEY = 'kers-fps-limit';
let limit: FpsLimit = 'auto';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === '30' || saved === '60') limit = saved;
} catch {
  /* Restricted storage: automatic remains usable. */
}
export function getFpsLimit(): FpsLimit {
  return limit;
}
export function setFpsLimit(value: FpsLimit): void {
  limit = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* Storage is optional. */
  }
}
const samples = new Float64Array(600);
let count = 0,
  head = 0;
export function recordFrame(ms: number): void {
  if (!(ms > 0) || !Number.isFinite(ms)) return;
  samples[head] = ms;
  head = (head + 1) % samples.length;
  count = Math.min(count + 1, samples.length);
}
export function resetFrameStats(): void {
  count = head = 0;
}
export function frameStats(): { fps: number; low1: number; ms: number; samples: number } {
  const values = Array.from(samples.subarray(0, count)).sort((a, b) => b - a);
  const mean = values.reduce((a, b) => a + b, 0) / (count || 1);
  const n = Math.max(1, Math.ceil(count * 0.01));
  const slow = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  return {
    fps: mean > 0 ? 1000 / mean : 0,
    low1: slow > 0 ? 1000 / slow : 0,
    ms: mean,
    samples: count,
  };
}
