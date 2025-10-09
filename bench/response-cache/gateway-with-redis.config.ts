import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  cache: {
    type: 'redis',
    url: process.env['REDIS_URL'], // The URL of the Redis server
    lazyConnect: false,
  },
  responseCaching: {
    ttl: 0,
    ttlPerType: {
      'Query.me': 2000,
    },
    session: () => null,
  },
  maskedErrors: false,
});
