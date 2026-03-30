import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.http': {
      options: {
        deduplicateInflightRequests: true, // Toggle this option to observe different behaviors in the test
      },
    },
  },
});
