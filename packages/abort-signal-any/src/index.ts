export type AbortSignalFromAny = AbortSignal & {
  signals: Set<AbortSignal>;
  addSignals(signals: Iterable<AbortSignal>): void;
};

export function isAbortSignalFromAny(
  signal?: AbortSignal | null,
): signal is AbortSignalFromAny {
  return signal != null && 'signals' in signal && 'addSignals' in signal;
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
  if (signals.size === 0) {
    return undefined;
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
  Object.defineProperties(ctrl.signal, {
    signals: { value: signals },
    addSignals: {
      value(newSignals: Iterable<AbortSignal>) {
        for (const signal of newSignals) {
          if (isAbortSignalFromAny(signal)) {
            for (const childSignal of signal.signals) {
              if (!signals.has(childSignal)) {
                signals.add(childSignal);
                childSignal.addEventListener('abort', onAbort, { once: true });
              }
            }
          } else {
            if (!signals.has(signal)) {
              signals.add(signal);
              signal.addEventListener('abort', onAbort, { once: true });
            }
          }
        }
      },
    },
  });
  return ctrl.signal as AbortSignalFromAny;
}
