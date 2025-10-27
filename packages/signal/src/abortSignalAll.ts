// https://github.com/unjs/std-env/blob/ab15595debec9e9115a9c1d31bc7597a8e71dbfd/src/runtimes.ts

const allSignalRegistry = new FinalizationRegistry<() => void>((cb) => cb());

const controllerInSignalSy = Symbol('CONTROLLER_IN_SIGNAL');

/**
 * Memory safe ponyfill of `AbortSignal.any`. In Node environments, the native
 * `AbortSignal.any` seems to be leaky and can lead to subtle memory leaks over
 * a larger period of time.
 *
 * This ponyfill is a custom implementation that makes sure AbortSignals get properly
 * GC-ed as well as aborted.
 */
export function abortSignalAll(
  signals: AbortSignal[],
): AbortSignal | undefined {
  if (signals.length === 0) {
    // if no signals are passed, return undefined because the abortcontroller
    // wouldnt ever be aborted (should be when GCd, but it's only a waste of memory)
    // furthermore, the native AbortSignal.any will also never abort if receiving no signals
    return undefined;
  }

  if (signals.length === 1) {
    // no need to waste resources by wrapping a single signal, simply return it
    return signals[0];
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

  function removeSignal(signal: AbortSignal, abortListener: () => void) {
    signal.removeEventListener('abort', abortListener);
    allSignalRegistry!.unregister(signal);
    --retainedSignalsCount;
  }

  for (const signal of signals) {
    const signalRef = new WeakRef(signal);
    function onAbort() {
      const signal = signalRef.deref();
      if (signal) {
        removeSignal(signal, onAbort);
        // abort when all of the signals have been GCed or aborted
        if (retainedSignalsCount === 0) {
          ctrlRef.deref()?.abort(signal.reason);
        }
      }
    }
    signal.addEventListener('abort', onAbort);
    eventListenerPairs.push([signalRef, onAbort]);
    allSignalRegistry!.register(
      signal,
      () => {
        removeSignal(signal, onAbort);
        // dispose when all of the signals have been GCed
        if (retainedSignalsCount === 0) {
          dispose();
        }
      },
      signal,
    );
  }

  function dispose() {
    const ctrl = ctrlRef.deref();
    if (ctrl) {
      allSignalRegistry!.unregister(ctrl.signal);
      // @ts-expect-error
      delete ctrl.signal[controllerInSignalSy];
    }

    for (const [signalRef, onAbort] of eventListenerPairs) {
      const signal = signalRef.deref();
      if (signal) {
        removeSignal(signal, onAbort);
      }
    }
  }

  // cleanup when aborted
  ctrl.signal.addEventListener('abort', dispose);
  // cleanup when GCed
  allSignalRegistry!.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the controller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
