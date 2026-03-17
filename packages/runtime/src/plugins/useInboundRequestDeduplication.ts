import { getOperationAST, parse } from 'graphql';
import type { GatewayPlugin } from '../types';

type HeaderPolicy = 'all' | 'none' | { include: string[] };

export function useInboundRequestDeduplication(
  headerPolicy: HeaderPolicy = 'all',
): GatewayPlugin {
  const inflightRequests = new Map<string, Promise<any>>();
  let schemaVersion = 0;
  return {
    onSchemaChange() {
      schemaVersion++;
      inflightRequests.clear();
    },
    onParams({ request, params, paramsHandler, setParamsHandler }) {
      const dedupeKey = getDedupeKey(request, params, headerPolicy, schemaVersion);
      if (dedupeKey == null) {
        return;
      }
      setParamsHandler((payload) => {
        let inflightRequest$ = inflightRequests.get(dedupeKey);
        if (inflightRequest$ == null) {
          const deferred = createDeferred<any>();
          inflightRequest$ = deferred.promise;
          inflightRequests.set(dedupeKey, inflightRequest$);
          Promise.resolve(paramsHandler(payload))
            .then(deferred.resolve)
            .catch(deferred.reject)
            .finally(() => {
              inflightRequests.delete(dedupeKey);
            });
        }
        return inflightRequest$;
      });
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function getDedupeKey(
  request: Request,
  params: {
    query?: string;
    operationName?: string | null;
    variables?: unknown;
    extensions?: unknown;
  },
  headerPolicy: HeaderPolicy,
  schemaVersion: number,
) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return;
  }
  if (!params.query) {
    return;
  }
  try {
    const operation = getOperationAST(parse(params.query), params.operationName);
    if (operation?.operation !== 'query') {
      return;
    }
  } catch {
    return;
  }
  const url = new URL(request.url);
  let key = `${schemaVersion}|${request.method}|${url.pathname}`;
  if (headerPolicy !== 'none') {
    let headerEntries: [string, string][] = [];
    if (headerPolicy === 'all') {
      headerEntries = [...request.headers.entries()];
    } else {
      const normalizedIncludeList = new Set(
        headerPolicy.include.map((headerName) => headerName.toLowerCase()),
      );
      for (const [headerName, headerValue] of request.headers.entries()) {
        if (normalizedIncludeList.has(headerName.toLowerCase())) {
          headerEntries.push([headerName, headerValue]);
        }
      }
    }
    headerEntries.sort(([left], [right]) => {
      const normalizedLeft = left.toLowerCase();
      const normalizedRight = right.toLowerCase();
      if (normalizedLeft < normalizedRight) {
        return -1;
      }
      if (normalizedLeft > normalizedRight) {
        return 1;
      }
      return 0;
    });
    key += `|${JSON.stringify(headerEntries)}`;
  }
  key += `|${params.operationName || ''}`;
  key += `|${params.query}`;
  key += `|${JSON.stringify(params.variables ?? null)}`;
  key += `|${JSON.stringify(params.extensions ?? null)}`;
  return key;
}
