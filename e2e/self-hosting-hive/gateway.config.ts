import { defineConfig } from '@graphql-hive/gateway';

const hiveUrl = process.env['HIVE_URL']!;

export const gatewayConfig = defineConfig({
  reporting: {
    type: 'hive',
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
});
