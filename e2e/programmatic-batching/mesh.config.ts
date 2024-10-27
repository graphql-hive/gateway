import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('API', {
        source: `http://localhost:${opts.getServicePort('api')}/openapi.json`,
        endpoint: `http://localhost:${opts.getServicePort('api')}`,
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
