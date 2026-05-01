import { defineConfig, loadGraphQLHTTPSubgraph } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const apiPort = opts.getServicePort('api');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('api', {
        endpoint: `http://localhost:${apiPort}/graphql`,
      }),
    },
  ],
});
