import { defineConfig, HTTPTransportOptions } from '@graphql-hive/gateway';

let i = 0;
export const gatewayConfig = defineConfig({
  upstreamRetry: {
    maxRetries: 4,
  },
  upstreamTimeout: 300,
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: !!process.env['DEDUPLICATE_REQUEST'],
      } as HTTPTransportOptions,
    },
  },
  plugins() {
    return [
      {
        onFetch({ context }) {
          i++;
          context.log.info(`[FETCHING] #${i}`);
        },
      },
    ];
  },
});
