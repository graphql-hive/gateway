import type { GatewayPlugin } from '../types';

export function useUpstreamCancel(): GatewayPlugin {
  return {
    onFetch({ context, options }) {
      if (context?.request) {
        if (options.signal) {
          const ctrl = new AbortController();
          context.request.signal.addEventListener('abort', () => {
            ctrl.abort();
          });
          options.signal.addEventListener('abort', () => {
            ctrl.abort();
          });
          options.signal = ctrl.signal;
        } else {
          options.signal = context.request.signal;
        }
      }
    },
  };
}
