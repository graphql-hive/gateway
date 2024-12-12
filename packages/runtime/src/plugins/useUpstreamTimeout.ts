import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { GatewayContext, GatewayPlugin } from '../types';

export interface TimeoutFactoryPayload {
  subgraphName?: string;
  url: string;
  options: RequestInit;
  context: GatewayContext;
}

export type UpstreamTimeoutPluginOptions =
  | number
  | ((payload: TimeoutFactoryPayload) => number | undefined);

export function useUpstreamTimeout<TContext extends Record<string, any>>(
  opts: UpstreamTimeoutPluginOptions,
): GatewayPlugin<TContext> {
  const timeoutFactory = typeof opts === 'function' ? opts : () => opts;
  return {
    onFetch({ executionRequest, url, options, context }) {
      const subgraphName =
        executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest);
      const timeout = timeoutFactory({ subgraphName, url, options, context });
      if (timeout) {
        const timeoutSignal = AbortSignal.timeout(timeout);
        if (options.signal) {
          options.signal = AbortSignal.any([options.signal, timeoutSignal]);
        } else {
          options.signal = timeoutSignal
        }
      }
    },
  };
}
