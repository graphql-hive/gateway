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
        onFetch({ options }) {
          i++;
          ctx.logger.info(`Fetching with ${options.body} for the ${i} time`);
        },
      },
    ];
  },
});
