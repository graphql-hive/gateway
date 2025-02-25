import { createGraphQLError } from '@graphql-tools/utils';
import { crypto, TextEncoder } from '@whatwg-node/fetch';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GraphQLError } from 'graphql';

export function createAbortErrorReason() {
  return new Error('Executor was disposed.');
}

export function createGraphQLErrorForAbort(
  reason: any,
  extensions?: Record<string, any>,
) {
  if (reason instanceof GraphQLError) {
    return reason;
  }
  if (reason?.name === 'TimeoutError') {
    return createGraphQLError(reason.message, {
      extensions: {
        http: {
          status: 504,
          ...(extensions?.['http'] || {}),
        },
        code: 'TIMEOUT_ERROR',
        ...(extensions || {}),
      },
      originalError: reason,
    });
  }
  return createGraphQLError(reason.message, {
    extensions,
    originalError: reason,
  });
}

export function createResultForAbort(
  reason: any,
  extensions?: Record<string, any>,
) {
  return {
    errors: [createGraphQLErrorForAbort(reason, extensions)],
  };
}

export function hashSHA256(str: string) {
  const textEncoder = new TextEncoder();
  const utf8 = textEncoder.encode(str);
  return handleMaybePromise(
    () => crypto.subtle.digest('SHA-256', utf8),
    (hashBuffer) => {
      let hashHex = '';
      for (const bytes of new Uint8Array(hashBuffer)) {
        hashHex += bytes.toString(16).padStart(2, '0');
      }
      return hashHex;
    },
  );
}
