/**
 * Shared app contracts (frozen in task A0, see docs/ARCHITECTURE.md §4.3).
 * The three interfaces below are the verbatim §4.3 contract; do not change them
 * without an orchestrator-approved change request.
 */

// --- §4.3 verbatim -----------------------------------------------------------
export interface SimModule {
  id: string; titleIT: string; summaryIT: string;
  slideRefs: number[]; theoryId: string;       // links to content/theory/<theoryId>.md
  mount(host: HTMLElement, ctx: AppContext): Disposable;   // must be idempotent & leak-free
}
export interface AppContext { theme: 'dark'|'light'; reducedMotion: boolean; formatIT(n:number, digits?:number, unit?:string): string; }
export interface Disposable { dispose(): void }   // stops RAF, removes listeners, disposes Three/uPlot resources
// --- end §4.3 verbatim -------------------------------------------------------

/**
 * Description of one tunable simulator parameter (§4.3: "one typed `params`
 * object with `{min,max,step,default,unit,labelIT}` per field").
 * Values are in SI units; `unit` is the display symbol (e.g. 'T', 'm²', 'rad/s').
 */
export interface ParamSpec {
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  labelIT: string;
}

/**
 * Typed parameter schema for a simulator whose numeric state is `T`.
 *
 * @example
 *   interface FaradayParams { B: number; S: number; N: number; omega: number }
 *   export const params: ParamsSchema<FaradayParams> = {
 *     B: { min: 0, max: 2, step: 0.01, default: 0.5, unit: 'T', labelIT: 'Campo magnetico B' },
 *     ...
 *   };
 */
export type ParamsSchema<T> = Record<keyof T, ParamSpec>;

/** Theme identifier, shared with {@link AppContext.theme}. */
export type Theme = AppContext['theme'];
