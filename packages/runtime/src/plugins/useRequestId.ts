import { requestIdByRequest } from '@graphql-mesh/utils';
import type { GatewayPlugin } from '../types';

export function useRequestId<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  return {
    onRequest({ request, fetchAPI }) {
      const requestId =
        request.headers.get('x-request-id') || fetchAPI.crypto.randomUUID();
      requestIdByRequest.set(request, requestId);
    },
    onContextBuilding({ context }) {
      if (context?.request) {
        const requestId = requestIdByRequest.get(context.request);
        if (requestId && context.logger) {
          // @ts-expect-error - Logger is somehow read-only
          context.logger = context.logger.child(requestId);
        }
      }
    },
    onFetch({ context, options, setOptions }) {
      if (context?.request) {
        const requestId = requestIdByRequest.get(context.request);
        if (requestId) {
          setOptions({
            ...(options || {}),
            headers: {
              ...(options.headers || {}),
              'x-request-id': requestId,
            },
          });
        }
      }
    },
    onResponse({ request, response }) {
      const requestId = requestIdByRequest.get(request);
      if (requestId) {
        response.headers.set('x-request-id', requestId);
      }
    },
  };
}
