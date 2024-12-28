import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('users', {
        endpoint: `https://localhost:${4001}/graphql`,
        source: './services/users/typeDefs.graphql',
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('comments', {
        endpoint: `http://localhost:${4002}/graphql`,
        source: './services/comments/typeDefs.graphql',
      }),
    },
  ],
});
