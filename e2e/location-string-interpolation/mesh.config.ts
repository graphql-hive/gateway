import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('products', {
        endpoint: `http://localhost:${opts.getServicePort('products')}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('inventory', {
        endpoint: '{env.INVENTORY_ENDPOINT}',
      }),
    },
  ],
});
