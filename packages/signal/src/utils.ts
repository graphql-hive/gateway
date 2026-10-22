// https://github.com/unjs/std-env/blob/ab15595debec9e9115a9c1d31bc7597a8e71dbfd/src/runtimes.ts
export const isNode =
  !globalThis.Bun && globalThis.process?.release?.name === 'node';
export const controllerInSignalSy = Symbol('CONTROLLER_IN_SIGNAL');

/**
 * FinalizationRegistry is used for GC-driven cleanup of abort listeners.
 * It must not be constructed at module load when the runtime lacks it
 * (e.g. Cloudflare Workers with an older compatibility_date); otherwise
 * importing `@graphql-hive/signal` throws before any call site runs.
 *
 * Node always has it; non-Node callers of `abortSignalAny` short-circuit to
 * native `AbortSignal.any` and never touch the registry.
 */
export const signalRegistry: FinalizationRegistry<() => void> | null =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<() => void>((cb) => cb())
    : null;
