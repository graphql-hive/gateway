import { defineConfig as defineGatewayConfig } from '@graphql-hive/gateway';
import {
  defineConfig as defineComposeConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineComposeConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('greetings', {
        endpoint: `http://localhost:${opts.getServicePort('greetings')}/graphql`,
      }),
    },
  ],
});

let fetchCnt = 0;
export const gatewayConfig = defineGatewayConfig({
  transportEntries: {
    greetings: {
      options: {
        apq: true,
      },
    },
  },
  plugins: () => [
    {
      onFetch({ options }) {
        fetchCnt++;
        process.stdout.write(`fetch ${fetchCnt} ${options.body}\n`);
      },
    },
  ],
});
