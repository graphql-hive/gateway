import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const SERVICE_PORT = opts.getServicePort('Graph');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('Graph', {
        endpoint: `http://localhost:${SERVICE_PORT}/graphql`,
        source: './services/Graph.graphql',
        operationHeaders: {
          Authorization: "{context.headers['authorization']}",
        },
      }),
    },
  ],
});
