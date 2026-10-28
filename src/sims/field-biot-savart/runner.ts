/**
 * Field computation job runner, shared by the Web Worker (`worker.ts`) and the
 * synchronous fallback used where `Worker` is unavailable (jsdom tests).
 *
 * A job posts, in order: one `profile` message (on-axis B_z, centre field and the
 * arrow grid), one `line` message per traced field line (each line is computed in
 * its own macrotask so a newer job can cancel the rest), then `done`.
 */
import {
  arrowGrid,
  axisProfile,
  coilSetup,
  evaluator,
  flowPhase,
  seeds,
  traceLine,
  type FieldRequest,
} from './model';

export interface ProfileMessage {
  type: 'profile';
  job: number;
  z: Float64Array;
  bz: Float64Array;
  centre: [number, number, number];
  /** 7 floats per arrow (x, y, z, ux, uy, uz, |B|). */
  arrows: Float32Array;
  arrowCount: number;
  lineCount: number;
}

export interface LineMessage {
  type: 'line';
  job: number;
  index: number;
  points: Float32Array;
  magnitude: Float32Array;
  /** Flow coordinate for the animated dashes (see `flowPhase`). */
  phase: Float32Array;
  closed: boolean;
}

export interface DoneMessage {
  type: 'done';
  job: number;
  /** Wall-clock time of the whole job [ms] (diagnostics only). */
  ms: number;
}

export type FieldMessage = ProfileMessage | LineMessage | DoneMessage;

export interface JobRequest {
  job: number;
  request: FieldRequest;
}

export type Post = (msg: FieldMessage, transfer: Transferable[]) => void;
export type Schedule = (cb: () => void) => void;

export interface FieldRunner {
  /** Start a job; any running job is abandoned at its next line. */
  run(job: number, request: FieldRequest): void;
  /** Abandon the running job. */
  cancel(): void;
}

const now = (): number => (typeof performance === 'undefined' ? 0 : performance.now());

export function createFieldRunner(post: Post, schedule: Schedule): FieldRunner {
  let current = 0;
  return {
    cancel() {
      current = -1;
    },
    run(job, request) {
      current = job;
      const t0 = now();
      const setup = coilSetup(request);
      const ev = evaluator(setup);
      const profile = axisProfile(setup, ev);
      const arrows = arrowGrid(request, setup, ev);
      const seedList = seeds(request);
      post(
        {
          type: 'profile',
          job,
          z: profile.z,
          bz: profile.bz,
          centre: profile.centre,
          arrows: arrows.data,
          arrowCount: arrows.count,
          lineCount: seedList.length,
        },
        [profile.z.buffer, profile.bz.buffer, arrows.data.buffer],
      );
      const bRef = Math.hypot(...profile.centre);
      let index = 0;
      const next = (): void => {
        if (current !== job) return;
        const seed = seedList[index];
        if (!seed) {
          post({ type: 'done', job, ms: now() - t0 }, []);
          return;
        }
        const line = traceLine(request, setup, ev, seed);
        const phase = flowPhase(line.points, line.magnitude, bRef);
        post(
          {
            type: 'line',
            job,
            index,
            points: line.points,
            magnitude: line.magnitude,
            phase,
            closed: line.closed,
          },
          [line.points.buffer, line.magnitude.buffer, phase.buffer],
        );
        index++;
        schedule(next);
      };
      schedule(next);
    },
  };
}
