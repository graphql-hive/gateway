export function abortSignalAny(iterable: Iterable<AbortSignal>) {
  const signals = Array.from(iterable);

  const aborted = signals.find((s) => s.aborted);
  if (aborted) {
    // some signal is already aborted, immediately abort
    return aborted;
  }

  // if the native "any" is available, use it
  if ('any' in AbortSignal) {
    return AbortSignal.any(signals);
  }

  // otherwise ready a controller and listen for abort signals
  const ctrl = new AbortController();
  function abort(this: AbortSignal) {
    ctrl.abort(this.reason);
    // do cleanup
    for (const signal of signals) {
      signal.removeEventListener('abort', abort);
    }
  }
  for (const signal of signals) {
    signal.addEventListener('abort', abort);
  }
  return ctrl.signal;
}
