import { defineConfig } from '@graphql-hive/gateway';
import { boolEnv, Opts } from '@internal/testing';

const uplinkHost = String(process.env['E2E_GATEWAY_RUNNER']).includes('docker')
  ? boolEnv('CI')
    ? '172.17.0.1'
    : 'host.docker.internal'
  : '0.0.0.0';

const opts = Opts(process.argv);

const upLink = `http://${uplinkHost}:${opts.getServicePort('graphos')}`;

export const gatewayConfig = defineConfig({
  supergraph: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    upLink: `${upLink}/graphql`,
  },
  reporting: {
    type: 'graphos',
    apiKey: 'my-api-key',
    graphRef: 'my-graph-ref@my-variant',
    endpoint: `${upLink}/usage`,
  },
});
