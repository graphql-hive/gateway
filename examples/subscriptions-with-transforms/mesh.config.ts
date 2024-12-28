import {
  createPrefixTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('my-subgraph', {
        endpoint: `http://localhost:${4001}/graphql`,
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
