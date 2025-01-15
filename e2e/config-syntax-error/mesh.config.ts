import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('hello', {
        endpoint: `http://localhost:${opts.getServicePort('hello')}/graphql`,
      }),
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type Query {
      bye: String!
    }
  `,
});
