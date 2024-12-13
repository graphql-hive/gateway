import {
  abortSignalAny,
  isAbortSignalFromAny,
} from '@graphql-hive/gateway-abort-signal-any';
import { GraphQLResolveInfo } from '@graphql-tools/utils';
import type { GatewayPlugin } from '../types';

export function useUpstreamCancel(): GatewayPlugin {
  return {
    onFetch({ context, options, executionRequest, info }) {
      const signals: AbortSignal[] = [];
      if (context?.request?.signal) {
        signals.push(context.request.signal);
      }
      const execRequestSignal =
        executionRequest?.signal || executionRequest?.info?.signal;
      if (execRequestSignal) {
        signals.push(execRequestSignal);
      }
      const signalInInfo = (info as GraphQLResolveInfo)?.signal;
      if (signalInInfo) {
        signals.push(signalInInfo);
      }
      if (isAbortSignalFromAny(options.signal)) {
        options.signal.addSignals(signals);
      } else {
        if (options.signal) {
          signals.push(options.signal);
        }
        options.signal = abortSignalAny(signals);
      }
    },
    onSubgraphExecute({ executionRequest }) {
      const signals: AbortSignal[] = [];
      if (executionRequest.info?.signal) {
        signals.push(executionRequest.info.signal);
      }
      if (executionRequest.context?.request?.signal) {
        signals.push(executionRequest.context.request.signal);
      }
      if (isAbortSignalFromAny(executionRequest.signal)) {
        executionRequest.signal.addSignals(signals);
      } else {
        if (executionRequest.signal) {
          signals.push(executionRequest.signal);
        }
        executionRequest.signal = abortSignalAny(signals);
      }
    },
  };
}
