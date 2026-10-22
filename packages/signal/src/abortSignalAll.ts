import { controllerInSignalSy, signalRegistry } from './utils';

function isGenericAbortError(reason: unknown): boolean {
  return reason != null && !!reason?.toString?.()?.includes('AbortError');
}

function abortReasonFromSignals(signals: AbortSignal[]): unknown {
  const errors = signals
    .map((signal) => signal.reason)
    .filter((reason) => reason != null && !isGenericAbortError(reason));
  if (errors.length < 2) {
    return errors[0];
  }
  return new AggregateError(errors);
}

/**
 * Combines multiple `AbortSignal`s into one that aborts only when **all** of
 * the input signals have aborted (the inverse of `abortSignalAny` /
 * `AbortSignal.any`).
 *
 * Unlike `AbortSignal.any`, there is no native `AbortSignal.all`; this is a
 * first-class utility, with the same WeakRef / FinalizationRegistry cleanup
 * patterns as `abortSignalAny`.
 */
export function abortSignalAll(
  signals: AbortSignal[],
): AbortSignal | undefined {
  if (signals.length === 0) {
    // if no signals are passed, return undefined because the abortcontroller
    // wouldnt ever be aborted (should be when GCd, but it's only a waste of memory)
    return undefined;
  }
  if (signals.length === 1) {
    // no need to waste resources by wrapping a single signal, simply return it
    return signals[0];
  }
  if (signals.every((signal) => signal.aborted)) {
    const reason = abortReasonFromSignals(signals);
    if (reason === undefined) {
      // if all signals are already aborted with generic AbortErrors, return one of them
      return signals[0];
    }
    return AbortSignal.abort(reason);
  }

  // we use weak refs for both the root controller and the passed signals
  // because we want to make sure that signals are aborted and disposed of
  // in both cases when GC-ed and actually aborted

  const ctrl = new AbortController();
  const ctrlRef = new WeakRef(ctrl);

  const eventListenerPairs: [WeakRef<AbortSignal>, () => void][] = [];
  const errors = new Set<unknown>();

  // Already-aborted signals never fire another 'abort' listener; count them
  // up front so a mixed pre-aborted / live set still reaches zero correctly.
  // Only live signals are registered for GC, so retainedSignalsCount matches
  // that set (pre-aborted ones have no listeners to clean up).
  let remainingSignalsToAbort = 0;
  let retainedSignalsCount = 0;
  for (const signal of signals) {
    if (signal.aborted) {
      const reason = signal.reason;
      if (reason != null && !isGenericAbortError(reason)) {
        errors.add(reason);
      }
    } else {
      remainingSignalsToAbort++;
      retainedSignalsCount++;
    }
  }

  function maybeAbortCombined() {
    if (remainingSignalsToAbort !== 0) {
      return;
    }
    let error: unknown;
    if (errors.size < 2) {
      error = errors.values().next().value;
    } else {
      error = new AggregateError(errors);
    }
    ctrlRef.deref()?.abort(error);
  }

  for (const signal of signals) {
    if (signal.aborted) {
      continue;
    }
    const signalRef = new WeakRef(signal);
    function onAbort() {
      remainingSignalsToAbort--;
      const reason = signalRef.deref()?.reason;
      if (reason != null && !isGenericAbortError(reason)) {
        errors.add(reason);
      }
      maybeAbortCombined();
    }
    signal.addEventListener('abort', onAbort);
    eventListenerPairs.push([signalRef, onAbort]);
    signalRegistry?.register(
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
        signalRegistry?.unregister(signal);
      }
    }
    const ctrl = ctrlRef.deref();
    if (ctrl) {
      ctrl.signal.removeEventListener('abort', dispose);
      signalRegistry?.unregister(ctrl.signal);
      // @ts-expect-error
      delete ctrl.signal[controllerInSignalSy];
    }
  }

  // cleanup when aborted
  ctrl.signal.addEventListener('abort', dispose);
  // cleanup when GCed (no-op if FinalizationRegistry is unavailable)
  signalRegistry?.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the cotroller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
