import { registerAbortSignalListener } from "@graphql-tools/utils";

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
  function onAbort(this: AbortSignal, ev?: Event) {
    const signal = this || ev?.target as AbortSignal;
    ctrl.abort(signal?.reason);
  }
  for (const signal of signals) {
    registerAbortSignalListener(signal, onAbort);
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
                registerAbortSignalListener(childSignal, onAbort);
              }
            }
          } else {
            if (!signals.has(signal)) {
              signals.add(signal);
              registerAbortSignalListener(signal, onAbort);
            }
          }
        }
      },
    },
  });
  return ctrl.signal as AbortSignalFromAny;
}
