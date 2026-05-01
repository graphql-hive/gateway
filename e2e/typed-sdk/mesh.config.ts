import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('subgraph', {
        endpoint: 'http://localhost:4001/graphql',
        source: './services/subgraph/schema.graphql',
      }),
    },
  ],
});
