import { defineConfig } from '@graphql-hive/gateway';

let i = 0;
export const gatewayConfig = defineConfig({
  upstreamRetry: {
    maxRetries: 4,
  },
  upstreamTimeout: 300,
  plugins(ctx) {
    return [
      {
        onFetch() {
          i++;
          ctx.logger.info(`[FETCHING] #${i}`);
        },
      },
    ];
  },
});
