import { defineConfig } from '@graphql-hive/gateway';

const hiveUrl = process.env['HIVE_URL']!;
const overWs = process.env['OVER_WS'] === 'true';

export const gatewayConfig = defineConfig({
  reporting: {
    type: 'hive',
    debug: true,
    agent: {
      maxRetries: 1,
      maxSize: 1,
      timeout: 200,
    },
    selfHosting: {
      applicationUrl: hiveUrl,
      graphqlEndpoint: `${hiveUrl}/graphql`,
      usageEndpoint: `${hiveUrl}/usage`,
    },
  },
  logging: 'debug',
  transportEntries: overWs
    ? {
        users: {
          options: {
            subscriptions: {
              kind: 'ws',
              location: '/graphql',
            },
          },
        },
      }
    : {},
});
