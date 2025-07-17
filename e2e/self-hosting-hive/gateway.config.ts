import { defineConfig } from '@graphql-hive/gateway';
import { isCI, Opts } from '@internal/testing';

const opts = Opts(process.argv);
const selfHostingHost = String(process.env['E2E_GATEWAY_RUNNER']).includes(
  'docker',
)
  ? isCI()
    ? '172.17.0.1'
    : 'host.docker.internal'
  : 'localhost';
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
      applicationUrl: `http://${selfHostingHost}:${selfHostingPort}`,
      graphqlEndpoint: `http://${selfHostingHost}:${selfHostingPort}/graphql`,
      usageEndpoint: `http://${selfHostingHost}:${selfHostingPort}/usage`,
    },
  },
});
