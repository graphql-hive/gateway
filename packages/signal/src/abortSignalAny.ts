// https://github.com/unjs/std-env/blob/ab15595debec9e9115a9c1d31bc7597a8e71dbfd/src/runtimes.ts#L14-L21
const isNode = globalThis.process?.release?.name === 'node';

const anySignalRegistry = isNode
  ? new FinalizationRegistry<() => void>((cb) => cb())
  : null;

const controllerInSignalSy = Symbol('CONTROLLER_IN_SIGNAL');

/**
 * Memory safe polyfill of `AbortSignal.any`. In Node environments, the native
 * `AbortSignal.any` seems to be leaky and can lead to subtle memory leaks over
 * a larger period of time.
 *
 * This polyfill is a custom implementation that makes sure AbortSignals get properly
 * GC-ed as well as aborted.
 */
export function abortSignalAny(signals: AbortSignal[]) {
  if (!isNode) {
    // AbortSignal.any seems to be leaky only in Node env
    // TODO: should we polyfill other envs, will they always have AbortSignal.any?
    return AbortSignal.any(signals);
  }

  for (const signal of signals) {
    if (signal.aborted) {
      // if any of the signals has already been aborted, return it immediately no need to continue at all
      return signal;
    }
  }

  // we use weak refs for both the root controller and the passed signals
  // because we want to make sure that signals are aborted and disposed of
  // in both cases when GC-ed and actually aborted

  const ctrl = new AbortController();
  const ctrlRef = new WeakRef(ctrl);

  const eventListenerPairs: [WeakRef<AbortSignal>, () => void][] = [];
  let retainedSignalsCount = signals.length;

  for (const signal of signals) {
    const signalRef = new WeakRef(signal);
    function abort() {
      ctrlRef.deref()?.abort(signalRef.deref()?.reason);
    }
    signal.addEventListener('abort', abort);
    eventListenerPairs.push([signalRef, abort]);
    anySignalRegistry!.register(
      signal,
      () =>
        // dispose when all of the signals have been GCed
        !--retainedSignalsCount && dispose(),
      signal,
    );
  }

  function dispose() {
    for (const [signalRef, abort] of eventListenerPairs) {
      const signal = signalRef.deref();
      if (signal) {
        signal.removeEventListener('abort', abort);
        anySignalRegistry!.unregister(signal);
      }
      const ctrl = ctrlRef.deref();
      if (ctrl) {
        anySignalRegistry!.unregister(ctrl.signal);
        // @ts-expect-error
        delete ctrl.signal[controllerInSignalSy];
      }
    }
  }

  // cleanup when aborted
  ctrl.signal.addEventListener('abort', dispose);
  // cleanup when GCed
  anySignalRegistry!.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the cotroller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
