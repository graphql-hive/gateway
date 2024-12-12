import { createGraphQLError, mapMaybePromise } from '@graphql-tools/utils';
import { crypto, TextEncoder } from '@whatwg-node/fetch';

export function createAbortErrorReason() {
  return new Error('Executor was disposed.');
}

export function createGraphQLErrorForAbort(
  reason: any,
  extensions?: Record<string, any>,
) {
  return createGraphQLError('The operation was aborted. reason: ' + reason, {
    extensions,
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
  return mapMaybePromise(
    crypto.subtle.digest('SHA-256', utf8),
    (hashBuffer) => {
      let hashHex = '';
      for (const bytes of new Uint8Array(hashBuffer)) {
        hashHex += bytes.toString(16).padStart(2, '0');
      }
      return hashHex;
    },
  );
}

export type SerializedRequest = {
  query?: string;
  variables?: Record<string, any>;
  operationName?: string;
  extensions?: any;
};

// For faster serialization instead of JSON.stringify overhead
export function jsonStringifyBody(body: SerializedRequest) {
  let str = '{';
  let prev = false;
  if (body.query) {
    str += `"query":"${body.query.replaceAll('"', '\\"')}"`;
    prev = true;
  }
  if (body.variables) {
    if (prev) {
      str += ',';
    }
    str += `"variables":${JSON.stringify(body.variables)}`;
    prev = true;
  }
  if (body.operationName) {
    if (prev) {
      str += ',';
    }
    str += `"operationName":"${body.operationName}"`;
    prev = true;
  }
  if (body.extensions) {
    if (prev) {
      str += ',';
    }
    str += `"extensions":${JSON.stringify(body.extensions)}`;
  }
  str += '}';
  return str;
}
