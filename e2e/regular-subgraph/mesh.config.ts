import {
  createFederationTransform,
  createPrefixTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

const regularPort = opts.getServicePort('regular');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('regular', {
        endpoint: `http://localhost:${regularPort}/graphql`,
      }),
      transforms: [
        createPrefixTransform({
          value: 'Regular',
        }),
      ],
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('notRegular', {
        endpoint: `http://localhost:${regularPort}/graphql`,
      }),
      transforms: [
        createPrefixTransform({
          value: 'NotRegular_',
          includeRootOperations: true,
        }),
        createFederationTransform({
          NotRegular_Greeting: {
            key: {
              fields: 'from',
            },
          },
        }),
      ],
    },
  ],
});
