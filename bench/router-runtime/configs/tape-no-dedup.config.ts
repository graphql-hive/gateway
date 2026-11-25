import { defineConfig } from '@graphql-hive/gateway';

// `tape` and `no-dedup` together
process.env['HIVE_ROUTER_RUNTIME_RESPONSE_TAPE'] = '1';

export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: false,
      },
    },
  },
});
