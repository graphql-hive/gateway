import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  rateLimiting: [
    {
      type: 'Query',
      field: 'users',
      max: 5,
      ttl: 1_000,
      identifier: 'anonymous',
    },
  ],
});
