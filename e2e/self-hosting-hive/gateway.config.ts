import { defineConfig } from '@graphql-hive/gateway';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const selfHostingPort = opts.getServicePort('selfHostingHive');

export const gatewayConfig = defineConfig({
  reporting: {
    type: 'hive',
    agent: {
      maxRetries: 1,
      maxSize: 1,
      timeout: 200,
    },
    selfHosting: {
      applicationUrl: `http://localhost:${selfHostingPort}`,
      graphqlEndpoint: `http://localhost:${selfHostingPort}/graphql`,
      usageEndpoint: `http://localhost:${selfHostingPort}/usage`,
    },
  },
});
