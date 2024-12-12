import type { SelectionSetNode } from 'graphql';

export function checkIfDataSatisfiesSelectionSet(
  selectionSet: SelectionSetNode,
  data: any,
): boolean {
  if (Array.isArray(data)) {
    return data.every((item) =>
      checkIfDataSatisfiesSelectionSet(selectionSet, item),
    );
  }
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const field = selection;
      const responseKey = field.alias?.value || field.name.value;
      if (data[responseKey] != null) {
        if (field.selectionSet) {
          if (
            !checkIfDataSatisfiesSelectionSet(
              field.selectionSet,
              data[field.name.value],
            )
          ) {
            return false;
          }
        }
      } else {
        return false;
      }
    } else if (selection.kind === 'InlineFragment') {
      const inlineFragment = selection;
      if (
        !checkIfDataSatisfiesSelectionSet(inlineFragment.selectionSet, data)
      ) {
        return false;
      }
    }
  }
  return true;
}

export const defaultQueryText = /* GraphQL */ `
  # Welcome to GraphiQL
  # GraphiQL is an in-browser tool for writing, validating,
  # and testing GraphQL queries.
  #
  # Type queries into this side of the screen, and you will
  # see intelligent typeaheads aware of the current GraphQL
  # type schema and live syntax and validation errors
  # highlighted within the text.
  #
  # GraphQL queries typically start with a "{" character.
  # Lines that start with a # are ignored.
  #
  # An example GraphQL query might look like:
  #
  #     {
  #       field(arg: "value") {
  #         subField
  #       }
  #     }
  #
`;

export type AbortSignalFromAny = AbortSignal & {
  addSignals: (signals: AbortSignal[]) => void;
};

export function isAbortSignalFromAny(
  signal: AbortSignal,
): signal is AbortSignalFromAny {
  return 'addSignals' in signal;
}

export function abortSignalAny(signals: AbortSignal[]) {
  let anySignal: AbortSignalFromAny | undefined;
  const nonAnySignals: AbortSignal[] = [];
  for (const signal of signals) {
    if (signal.aborted) {
      return signal;
    }
    if (isAbortSignalFromAny(signal) && !anySignal) {
      anySignal = signal;
    } else {
      nonAnySignals.push(signal);
    }
  }
  if (anySignal) {
    anySignal.addSignals(nonAnySignals);
    return anySignal;
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
  Object.defineProperty(ctrl.signal, 'addSignals', {
    value(signals: AbortSignal[]) {
      for (const signal of signals) {
        signal.addEventListener('abort', onAbort, { once: true });
        signals.push(signal);
      }
    },
  });
  return ctrl.signal as AbortSignalFromAny;
}
