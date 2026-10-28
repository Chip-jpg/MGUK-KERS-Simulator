/**
 * Web Worker of `field-biot-savart`: Biot-Savart sums and RK4 field-line tracing
 * run here, so the main thread only uploads finished buffers to the GPU.
 */
import { createFieldRunner, type JobRequest } from './runner';

/** The bits of DedicatedWorkerGlobalScope used here (the project compiles with the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;

const runner = createFieldRunner(
  (msg, transfer) => scope.postMessage(msg, transfer),
  (cb) => void setTimeout(cb, 0),
);

scope.addEventListener('message', (e) => {
  const d = e.data as JobRequest | { cancel: true };
  if ('cancel' in d) runner.cancel();
  else runner.run(d.job, d.request);
});
