import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('users', {
        endpoint: `https://localhost:${opts.getServicePort('users')}/graphql`,
        source: './services/users/typeDefs.graphql',
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('comments', {
        endpoint: `http://localhost:${opts.getServicePort('comments')}/graphql`,
        source: './services/comments/typeDefs.graphql',
      }),
    },
  ],
});
