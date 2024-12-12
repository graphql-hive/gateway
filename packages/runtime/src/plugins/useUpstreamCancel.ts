import type { GatewayPlugin } from '../types';
import { abortSignalAny } from '../utils';

export function useUpstreamCancel(): GatewayPlugin {
  return {
    onFetch({ context, options }) {
      if (context?.request) {
        if (options.signal) {
          options.signal = abortSignalAny([
            options.signal,
            context.request.signal,
          ]);
        } else {
          options.signal = context.request.signal;
        }
      }
    },
  };
}
