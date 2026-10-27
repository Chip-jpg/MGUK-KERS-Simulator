/**
 * Error thrown by not-yet-implemented physics functions. Introduced by the A0
 * scaffold for the §4.2 stubs; all §4.2 functions are implemented since A1, the
 * class stays exported for future extension modules (Phase 4).
 */
export class NotImplementedError extends Error {
  constructor(public readonly fnName: string) {
    super(`Not implemented: ${fnName}`);
    this.name = 'NotImplementedError';
  }
}
