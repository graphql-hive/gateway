import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    process.env['USE_B']
      ? {
          sourceHandler: loadGraphQLHTTPSubgraph('b', {
            endpoint: `http://localhost:${opts.getServicePort('b')}/graphql`,
          }),
        }
      : {
          sourceHandler: loadGraphQLHTTPSubgraph('a', {
            endpoint: `http://localhost:${opts.getServicePort('a')}/graphql`,
          }),
        },
  ],
});
