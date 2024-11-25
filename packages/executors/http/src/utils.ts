import { createGraphQLError } from '@graphql-tools/utils';

export function createAbortErrorReason() {
  return new Error('Executor was disposed.');
}

export function createGraphQLErrorForAbort(
  signal: AbortSignal,
  extensions?: Record<string, any>,
) {
  return createGraphQLError(
    'The operation was aborted. reason: ' + signal.reason,
    {
      extensions,
    },
  );
}

export function createResultForAbort(
  signal: AbortSignal,
  extensions?: Record<string, any>,
) {
  return {
    errors: [createGraphQLErrorForAbort(signal, extensions)],
  };
}
