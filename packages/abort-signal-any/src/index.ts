export type AbortSignalFromAny = AbortSignal & {
  signals: Set<AbortSignal>;
};

export function isAbortSignalFromAny(
  signal: AbortSignal,
): signal is AbortSignalFromAny {
  return 'signals' in signal;
}

export function abortSignalAny(givenSignals: Iterable<AbortSignal>) {
  const signals = new Set<AbortSignal>();
  let singleSignal: AbortSignal | undefined;
  for (const signal of givenSignals) {
    if (isAbortSignalFromAny(signal)) {
      for (const childSignal of signal.signals) {
        singleSignal = childSignal;
        signals.add(childSignal);
      }
    } else {
      singleSignal = signal;
      signals.add(signal);
    }
  }
  if (signals.size < 2) {
    return singleSignal;
  }
  const ctrl = new AbortController();
  function onAbort(this: AbortSignal, ev: Event) {
    const signal = (ev.target as AbortSignal) || this;
    ctrl.abort(signal.reason);
    for (const signal of signals) {
      signal.removeEventListener('abort', onAbort);
    }
  }
  for (const signal of signals) {
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal as AbortSignalFromAny;
}
