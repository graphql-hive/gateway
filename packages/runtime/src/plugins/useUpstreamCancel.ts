import { abortSignalAny } from '@graphql-hive/gateway-abort-signal-any';
import { GraphQLResolveInfo } from '@graphql-tools/utils';
import type { GatewayPlugin } from '../types';

export function useUpstreamCancel(): GatewayPlugin {
  return {
    onFetch({ context, options, setOptions, executionRequest, info }) {
      const signals = new Set<AbortSignal>();
      // Add signal from the downstream connection
      if (context?.request?.signal) {
        signals.add(context.request.signal);
      }
      // Add upstream execution signal
      if (executionRequest?.signal) {
        signals.add(executionRequest.signal);
      }
      // Add downstream execution signal (might be changed)
      if (executionRequest?.info?.signal) {
        signals.add(executionRequest.info.signal);
      }
      // Add downstream execution signal from the downstream execution resolve info
      const signalInInfo = (info as GraphQLResolveInfo)?.signal;
      if (signalInInfo) {
        signals.add(signalInInfo);
      }
      // Add existing signal
      if (options.signal) {
        signals.add(options.signal);
      }
      // If nothing has changed, don't set the signal
      if (options.signal && signals.size === 1 && signals.has(options.signal)) {
        return;
      }
      // If there are multiple signals, create a new signal that listens to all of them
      if (signals.size > 0) {
        setOptions({
          ...options,
          signal: abortSignalAny(signals),
        });
      }
    },
    onSubgraphExecute({ executionRequest, setExecutionRequest }) {
      const signals = new Set<AbortSignal>();
      // Add signal from the downstream connection
      if (executionRequest.context?.request?.signal) {
        signals.add(executionRequest.context.request.signal);
      }
      // Add upstream signal
      if (executionRequest.info?.signal) {
        signals.add(executionRequest.info.signal);
      }
      // Add existing signal
      if (executionRequest.signal) {
        signals.add(executionRequest.signal);
      }
      // If nothing has changed, don't set the signal
      if (
        executionRequest.signal &&
        signals.size === 1 &&
        signals.has(executionRequest.signal)
      ) {
        return;
      }
      // If there are multiple signals, create a new signal that listens to all of them
      if (signals.size > 0) {
        setExecutionRequest({
          ...executionRequest,
          signal: abortSignalAny(signals),
        });
      }
    },
  };
}
