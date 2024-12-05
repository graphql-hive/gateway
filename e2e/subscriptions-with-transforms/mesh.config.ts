import {
  createPrefixTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('my-subgraph', {
        endpoint: `http://localhost:${opts.getServicePort('my-subgraph')}/graphql`,
        source: './services/my-subgraph/schema.graphql',
      }),
      transforms: [
        createPrefixTransform({
          value: 'test_',
          includeRootOperations: true,
        }),
      ],
    },
  ],
});
