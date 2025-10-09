import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  responseCaching: {
    invalidateViaMutation: false,
    ttl: 0,
    ttlPerType: {
      'Query.me': 2000,
    },
    session: () => null,
  },
  maskedErrors: false,
});
