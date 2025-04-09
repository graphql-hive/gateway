import { defineConfig, useDeduplicateRequest } from '@graphql-hive/gateway';

let i = 0;
export const gatewayConfig = defineConfig({
  upstreamRetry: {
    maxRetries: 4,
  },
  upstreamTimeout: 300,
  plugins() {
    return [
      ...(process.env['DEDUPLICATE_REQUEST'] ? [useDeduplicateRequest()] : []),
      {
        onFetch({ context }) {
          i++;
          context.log.info(`[FETCHING] #${i}`);
        },
      },
    ];
  },
});
