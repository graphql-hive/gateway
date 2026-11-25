import { defineConfig } from '@graphql-hive/gateway';
import { fetch } from '@whatwg-node/fetch';

// like `no-dedup`, with `@whatwg-node/fetch` for subgraph requests, the gateway's fetch before
// undici's
export const gatewayConfig = defineConfig({
  fetchAPI: { fetch },
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: false,
      },
    },
  },
});
