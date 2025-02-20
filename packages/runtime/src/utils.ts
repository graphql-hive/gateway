import type { ExecutionArgs } from '@graphql-tools/executor';
import { Executor, memoize1 } from '@graphql-tools/utils';
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

export function delayInMs(ms: number, signal?: AbortSignal) {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timeoutId);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export const getExecuteFnFromExecutor = memoize1(
  function getExecuteFnFromExecutor(executor: Executor) {
    return function executeFn(args: ExecutionArgs) {
      return executor({
        document: args.document,
        variables: args.variableValues,
        operationName: args.operationName ?? undefined,
        rootValue: args.rootValue,
        context: args.contextValue,
        signal: args.signal,
      });
    };
  },
);
