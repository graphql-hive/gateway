// Some runtimes doesn't implement FinalizationRegistry. For those, we don't handle GC of signals
// and only rely on signal abortion. It is ok because most of the time they are short live runtime,
// and it's any just an optimization. It will not break the resolution, only miss or delay abortion.
const allSignalRegistry = globalThis.FinalizationRegistry
  ? new FinalizationRegistry<() => void>((cb) => cb())
  : null;

const controllerInSignalSy = Symbol('CONTROLLER_IN_SIGNAL');

/**
 * Memory safe AbortSignal merger.
 * The resulting signal is aborted once all signals have aborted or GCed.
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
    allSignalRegistry?.unregister(signal);
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
    allSignalRegistry?.register(
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
      allSignalRegistry?.unregister(ctrl.signal);
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
  allSignalRegistry?.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the controller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
