import type { GatewayContext, GatewayPlugin } from '../types';

export type {
  GenerateRequestIdFn,
  GenerateRequestIdPayload,
  RequestIdOptions,
} from 'graphql-yoga';
export {
  defaultGenerateRequestId,
  defaultRequestIdHeader,
} from 'graphql-yoga';

import { defaultRequestIdHeader, type RequestIdOptions } from 'graphql-yoga';

/**
 * Forwards the request id Yoga already attached to `context.log` onto upstream
 * fetch calls. Minting, response echo, and `log.child({ requestId })` are owned
 * by Yoga 6's built-in `requestId` option - do not reimplement them here.
 */
export function useRequestId<TContext extends Record<string, any>>(
  opts?: Pick<RequestIdOptions<TContext>, 'headerName'>,
): GatewayPlugin<TContext> {
  const headerName = opts?.headerName || defaultRequestIdHeader;
  return {
    onFetch({ context, options, setOptions }) {
      const attrs = context.log?.attrs;
      const requestId =
        attrs && !Array.isArray(attrs) ? attrs['requestId'] : undefined;
      if (typeof requestId !== 'string' || !requestId) {
        return;
      }
      if ('request' in context) {
        setOptions({
          ...(options || {}),
          headers: {
            ...(options.headers || {}),
            [headerName]: requestId,
          },
        });
      }
    },
  };
}

// Keep GatewayContext import used for documentation / future typing.
export type { GatewayContext };
