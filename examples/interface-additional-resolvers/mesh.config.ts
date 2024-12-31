import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('Test', {
        endpoint: `http://localhost:${4001}/graphql`,
      }),
    },
  ],
  additionalTypeDefs: './additionalTypeDefs/*',
});
