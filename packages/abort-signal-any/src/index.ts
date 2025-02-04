export function abortSignalAny(iterable: Iterable<AbortSignal>) {
  const signals = Array.from(iterable);

  const aborted = signals.find((s) => s.aborted);
  if (aborted) {
    // some signal is already aborted, immediately abort
    return aborted;
  }

  // TODO: we cant use the native abortsignal.any because it doesnt work with signals coming from whatwg-node (ServerAdapterRequestAbortSignal)
  // if ('any' in AbortSignal) {
  //   return AbortSignal.any(signals);
  // }

  // otherwise ready a controller and listen for abort signals
  const ctrl = new AbortController();
  function abort(event: Event) {
    ctrl.abort((event.target as AbortSignal).reason);
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
