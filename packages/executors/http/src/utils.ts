import { createGraphQLError } from '@graphql-tools/utils';

export function createAbortErrorReason() {
  return new Error('Executor was disposed.');
}

export function createGraphQLErrorForAbort(
  reason: any,
  extensions?: Record<string, any>,
) {
  return createGraphQLError(
    'The operation was aborted. reason: ' + reason,
    {
      extensions,
    },
  );
}

export function createResultForAbort(
  reason: any,
  extensions?: Record<string, any>,
) {
  return {
    errors: [createGraphQLErrorForAbort(reason, extensions)],
  };
}
