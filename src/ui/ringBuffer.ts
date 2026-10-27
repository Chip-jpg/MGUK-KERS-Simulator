/**
 * Fixed-capacity buffer of samples `(x, y1, …, yN)` for live plots: O(1) push,
 * oldest samples are overwritten once full. `toArrays()` returns columns in
 * chronological order, in the `[xs, ys1, …]` layout uPlot expects.
 */
export class RingBuffer {
  private readonly cols: Float64Array[];
  private head = 0;
  private size = 0;

  constructor(
    readonly capacity: number,
    readonly series: number,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be ≥ 1');
    if (!Number.isInteger(series) || series < 1) throw new RangeError('series must be ≥ 1');
    this.cols = Array.from({ length: series + 1 }, () => new Float64Array(capacity));
  }

  get length(): number {
    return this.size;
  }

  /** Append one sample; `ys.length` must equal `series` (missing → NaN). */
  push(x: number, ys: readonly number[]): void {
    const i = (this.head + this.size) % this.capacity;
    (this.cols[0] as Float64Array)[i] = x;
    for (let s = 0; s < this.series; s++)
      (this.cols[s + 1] as Float64Array)[i] = ys[s] ?? Number.NaN;
    if (this.size < this.capacity) this.size++;
    else this.head = (this.head + 1) % this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  /** Chronological copy: `[xs, ys1, …, ysN]` (plain arrays, NaN → null for gaps). */
  toArrays(): [number[], ...(number | null)[][]] {
    const out = this.cols.map(() => new Array<number | null>(this.size));
    for (let k = 0; k < this.size; k++) {
      const i = (this.head + k) % this.capacity;
      for (let c = 0; c < this.cols.length; c++) {
        const v = (this.cols[c] as Float64Array)[i] as number;
        (out[c] as (number | null)[])[k] = Number.isNaN(v) ? null : v;
      }
    }
    return out as [number[], ...(number | null)[][]];
  }

  /** Last sample's x, or undefined when empty. */
  lastX(): number | undefined {
    if (this.size === 0) return undefined;
    return (this.cols[0] as Float64Array)[(this.head + this.size - 1) % this.capacity];
  }
}
