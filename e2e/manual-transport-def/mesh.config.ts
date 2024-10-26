import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('greetings', {
        source: `http://localhost:${opts.getServicePort('greetings')}/openapi.json`,
        endpoint: `http://localhost:${opts.getServicePort('greetings')}`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('helloer', {
        endpoint: `http://localhost:${opts.getServicePort('helloer')}/graphql`,
      }),
    },
  ],
});
