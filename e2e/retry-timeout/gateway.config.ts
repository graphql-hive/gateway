import { defineConfig, useDeduplicateRequest } from '@graphql-hive/gateway';

let i = 0;
export const gatewayConfig = defineConfig({
  upstreamRetry: {
    maxRetries: 4,
  },
  upstreamTimeout: 300,
  plugins(ctx) {
    return [
      ...(process.env['DEDUPLICATE_REQUEST'] ? [useDeduplicateRequest()] : []),
      {
        onFetch() {
          i++;
          ctx.logger.info(`[FETCHING] #${i}`);
        },
      },
    ];
  },
});
