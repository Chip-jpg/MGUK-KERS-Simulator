/**
 * Module Web Worker that traces field lines off the main thread (used by
 * `fieldLines.ts` when a synchronous trace took longer than ~4 ms).
 * Message in: `{ id, job: TraceJob }`; out: `{ id, lines: TracedLine[] }` with the
 * typed arrays transferred (no copy).
 */
import { runTraceJob, type TraceJob } from './trace';

interface WorkerScope {
  onmessage: ((e: MessageEvent<{ id: number; job: TraceJob }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e) => {
  const { id, job } = e.data;
  const lines = runTraceJob(job);
  const transfer: Transferable[] = [];
  for (const l of lines) transfer.push(l.points.buffer, l.mags.buffer, l.arc.buffer);
  ctx.postMessage({ id, lines }, transfer);
};
