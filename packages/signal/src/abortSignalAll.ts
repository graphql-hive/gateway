import { controllerInSignalSy, signalRegistry } from './utils';

export function abortSignalAll(
  signals: AbortSignal[],
): AbortSignal | undefined {
  if (signals.length === 0) {
    // if no signals are passed, return undefined because the abortcontroller
    // wouldnt ever be aborted (should be when GCd, but it's only a waste of memory)
    // furthermore, the native AbortSignal.all will also never abort if receiving no signals
    return undefined;
  }
  if (signals.length === 1) {
    // no need to waste resources by wrapping a single signal, simply return it
    return signals[0];
  }
  if (signals.every((signal) => signal.aborted)) {
    // if all signals are already aborted, return one of them immediately
    return signals[0];
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
    function onAbort() {
      for (const [sRef] of eventListenerPairs) {
        const s = sRef.deref();
        if (s && !s.aborted) {
          return;
        }
      }
      ctrlRef.deref()?.abort(signalRef.deref()?.reason);
    }
    signal.addEventListener('abort', onAbort);
    eventListenerPairs.push([signalRef, onAbort]);
    signalRegistry!.register(
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
        signalRegistry!.unregister(signal);
      }
    }
    const ctrl = ctrlRef.deref();
    if (ctrl) {
      ctrl.signal.removeEventListener('abort', dispose);
      signalRegistry!.unregister(ctrl.signal);
      // @ts-expect-error
      delete ctrl.signal[controllerInSignalSy];
    }
  }

  // cleanup when aborted
  ctrl.signal.addEventListener('abort', dispose);
  // cleanup when GCed
  signalRegistry.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the cotroller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
