import { ExecutionRequest } from '@graphql-tools/utils';
import { abortSignalAny, isAbortSignalFromAny } from 'abort-signal-any';
import { GatewayPlugin } from '../types';

export interface TimeoutFactoryPayload {
  subgraphName?: string;
  executionRequest?: ExecutionRequest;
}

export type UpstreamTimeoutPluginOptions =
  | number
  | ((payload: TimeoutFactoryPayload) => number | undefined);

export function useUpstreamTimeout<TContext extends Record<string, any>>(
  opts: UpstreamTimeoutPluginOptions,
): GatewayPlugin<TContext> {
  const timeoutFactory = typeof opts === 'function' ? opts : () => opts;
  return {
    onSubgraphExecute({ subgraphName, executionRequest }) {
      const timeout = timeoutFactory({ subgraphName, executionRequest });
      if (timeout) {
        const timeoutSignal = AbortSignal.timeout(timeout);
        if (isAbortSignalFromAny(executionRequest.signal)) {
          executionRequest.signal.addSignals([timeoutSignal]);
        } else {
          const signals = [timeoutSignal];
          if (executionRequest.signal) {
            signals.push(executionRequest.signal);
          }
          executionRequest.signal = abortSignalAny(signals);
        }
      }
      return undefined;
    },
  };
}
