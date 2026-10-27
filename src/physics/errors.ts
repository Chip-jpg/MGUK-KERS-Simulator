/**
 * Thrown by physics stubs that have not been implemented yet (scaffold, task A0).
 * Task A1 replaces every stub with a real implementation.
 */
export class NotImplementedError extends Error {
  constructor(public readonly fnName: string) {
    super(`Not implemented: ${fnName}`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Helper used by stubs: throws {@link NotImplementedError}. Accepts (and ignores)
 * the stub's arguments so parameter names can stay exactly as in the contract
 * without tripping `noUnusedParameters`.
 */
export function notImplemented(fnName: string, ..._args: unknown[]): never {
  throw new NotImplementedError(fnName);
}
