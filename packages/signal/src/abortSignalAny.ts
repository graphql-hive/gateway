import { controllerInSignalSy, isNode, signalRegistry } from './utils';

/**
 * The signals every signal made by {@link abortSignalAny} follows, weakly so it doesn't keep
 * them alive.
 */
const followedSignals = new WeakMap<AbortSignal, WeakRef<AbortSignal>[]>();

/** What removes the listeners of a signal made by {@link abortSignalAny} from its signals. */
const disposers = new WeakMap<AbortSignal, () => void>();

/**
 * Stops a signal made by {@link abortSignalAny} from following its signals, so it never aborts
 * after. Call it once the work the signal was for is done: until then, or until it's garbage
 * collected, each of its signals keeps a listener for it, and a long-lived signal combined into
 * every request would gather one per request. Does nothing for any other signal.
 */
export function disposeAbortSignal(signal: AbortSignal | undefined): void {
  if (signal) {
    disposers.get(signal)?.();
  }
}

/**
 * The signals without duplicates and without the ones another of them already follows, which
 * would abort it anyway. Like the same signal passed twice, or a signal and one combined from it.
 */
function withoutFollowedSignals(signals: AbortSignal[]): AbortSignal[] {
  const followed = new Set<AbortSignal>();
  const follow = (signal: AbortSignal) => {
    for (const ref of followedSignals.get(signal) ?? []) {
      const source = ref.deref();
      if (source && !followed.has(source)) {
        followed.add(source);
        follow(source);
      }
    }
  };
  for (const signal of signals) {
    follow(signal);
  }
  const kept: AbortSignal[] = [];
  for (const signal of signals) {
    if (!followed.has(signal) && !kept.includes(signal)) {
      kept.push(signal);
    }
  }
  return kept;
}

/**
 * Memory safe ponyfill of `AbortSignal.any`. In Node environments, the native
 * `AbortSignal.any` seems to be leaky and can lead to subtle memory leaks over
 * a larger period of time.
 *
 * This ponyfill is a custom implementation that makes sure AbortSignals get properly
 * GC-ed as well as aborted.
 */
export function abortSignalAny(
  signals: AbortSignal[],
): AbortSignal | undefined {
  if (signals.length > 1) {
    signals = withoutFollowedSignals(signals);
  }
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

  if (!isNode) {
    // AbortSignal.any seems to be leaky only in Node env
    // TODO: should we ponyfill other envs, will they always have AbortSignal.any?
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
    signalRegistry!.register(
      signal,
      () =>
        // dispose when all of the signals have been GCed
        !--retainedSignalsCount && dispose(),
      signal,
    );
  }
  followedSignals.set(
    ctrl.signal,
    eventListenerPairs.map(([signalRef]) => signalRef),
  );

  let disposed = false;
  function dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    const signal = ctrlRef.deref()?.signal;
    if (signal) {
      // it doesn't follow them anymore
      followedSignals.delete(signal);
      disposers.delete(signal);
    }
    for (const [signalRef, abort] of eventListenerPairs) {
      const signal = signalRef.deref();
      if (signal) {
        signal.removeEventListener('abort', abort);
        signalRegistry!.unregister(signal);
      }
      const ctrl = ctrlRef.deref();
      if (ctrl) {
        signalRegistry!.unregister(ctrl.signal);
        // @ts-expect-error
        delete ctrl.signal[controllerInSignalSy];
      }
    }
  }

  // cleanup when the user is done with it, see `disposeAbortSignal`
  disposers.set(ctrl.signal, dispose);
  // cleanup when aborted
  ctrl.signal.addEventListener('abort', dispose);
  // cleanup when GCed (Node always provides FinalizationRegistry)
  signalRegistry!.register(ctrl.signal, dispose, ctrl.signal);

  // keeping a strong reference of the cotroller binding it to the lifecycle of its signal
  // @ts-expect-error
  ctrl.signal[controllerInSignalSy] = ctrl;

  return ctrl.signal;
}
