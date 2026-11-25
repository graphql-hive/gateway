import { defineConfig } from '@graphql-hive/gateway';

// `entity-reuse` and `no-dedup` together
export const gatewayConfig = defineConfig({
  entityReuse: true,
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: false,
      },
    },
  },
});
