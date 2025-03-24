export function abortSignalAny(signals: Iterable<AbortSignal>): AbortSignal {
  for (const signal of signals) {
    if (signal.aborted) {
      // if any of the signals is aborted, return it aborting right away
      return signal;
    }
  }

  const ctrl = new AbortController();
  function handleAbort(event: Event) {
    ctrl.abort((event.target as AbortSignal).reason);
    cleanup();
  }
  function cleanup() {
    for (const signal of signals) {
      signal.removeEventListener('abort', handleAbort);
    }
  }
  for (const signal of signals) {
    signal.addEventListener('abort', handleAbort, { once: true });
  }
  return ctrl.signal;
}
