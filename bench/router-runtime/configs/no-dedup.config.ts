import { defineConfig } from '@graphql-hive/gateway';

// every request sends its own subgraph requests, so parsing and merging their responses is paid
// per request, like with traffic that rarely repeats an operation at the same time
export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: false,
      },
    },
  },
});
