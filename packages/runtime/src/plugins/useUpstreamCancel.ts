import { GraphQLResolveInfo } from '@graphql-tools/utils';
import type { GatewayPlugin } from '../types';
import { abortSignalAny } from 'abort-signal-any';

export function useUpstreamCancel(): GatewayPlugin {
  return {
    onFetch({ context, options, executionRequest, info }) {
      const signals: AbortSignal[] = [];
      if (context?.request?.signal) {
        signals.push(context.request.signal);
      }
      const execRequestSignal = executionRequest?.signal || executionRequest?.info?.signal;
      if (execRequestSignal) {
        signals.push(execRequestSignal);
      }
      const signalInInfo = (info as GraphQLResolveInfo)?.signal;
      if (signalInInfo) {
        signals.push(signalInInfo);
      }
      if (options.signal) {
        signals.push(options.signal);
      }
      options.signal = abortSignalAny(signals);
    },
  };
}
