import { requestIdByRequest } from '@graphql-mesh/utils';
import { FetchAPI } from '@whatwg-node/server';
import type { GatewayContext, GatewayPlugin } from '../types';

export interface GenerateRequestIdPayload<TContext> {
  request: Request;
  fetchAPI: FetchAPI;
  context: TContext & GatewayContext;
}

export interface RequestIdOptions<TContext> {
  /**
   * Function to generate a request ID
   *
   * Ignored when `headerName` is available in the request headers
   */
  generateRequestId?: GenerateRequestIdFn<TContext>;
  /**
   * Header name to use for request ID
   *
   * Default: `x-request-id`
   */
  headerName?: string;
}

export type GenerateRequestIdFn<TContext> = (
  payload: GenerateRequestIdPayload<TContext>,
) => string;
export const defaultGenerateRequestId: GenerateRequestIdFn<any> = ({
  fetchAPI = globalThis,
}) => fetchAPI.crypto.randomUUID();
export const defaultRequestIdHeader: string = 'x-request-id';

export function useRequestId<TContext extends Record<string, any>>(
  opts?: RequestIdOptions<TContext>,
): GatewayPlugin<TContext> {
  const headerName = opts?.headerName || defaultRequestIdHeader;
  const generateRequestId = opts?.generateRequestId || defaultGenerateRequestId;
  return {
    onRequest({ request, fetchAPI, serverContext }) {
      const requestId =
        request.headers.get(headerName) ||
        generateRequestId({
          request,
          fetchAPI,
          // @ts-expect-error - Server context is not typed
          context: serverContext,
        });
      requestIdByRequest.set(request, requestId);
    },
    onContextBuilding({ context }) {
      if (context?.request) {
        const requestId = requestIdByRequest.get(context.request);
        if (requestId && context.logger) {
          // @ts-expect-error - Logger is somehow read-only
          context.logger = context.logger.child({ requestId });
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
              [headerName]: requestId,
            },
          });
        }
      }
    },
    onResponse({ request, response }) {
      const requestId = requestIdByRequest.get(request);
      if (requestId) {
        response.headers.set(headerName, requestId);
      }
    },
  };
}
