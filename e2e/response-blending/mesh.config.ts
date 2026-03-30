import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

const metricsServiceEndpoint = `http://localhost:${opts.getServicePort('metrics')}/graphql`;
const thingServiceEndpoint = `http://localhost:${opts.getServicePort('thing')}/graphql`;

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('thing', {
        endpoint: thingServiceEndpoint,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('metrics', {
        endpoint: metricsServiceEndpoint,
      }),
    },
  ],
});
