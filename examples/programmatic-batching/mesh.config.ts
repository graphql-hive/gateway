import { defineConfig } from '@graphql-mesh/compose-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('API', {
        source: `http://localhost:${4001}/openapi.json`,
        endpoint: `http://localhost:${4001}`,
        ignoreErrorResponses: true,
      }),
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type Query {
      user(id: Float!): User
    }
  `,
});
