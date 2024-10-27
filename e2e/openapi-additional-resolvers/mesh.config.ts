import { defineConfig } from '@graphql-mesh/compose-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('Wiki', {
        source:
          'https://api.apis.guru/v2/specs/wikimedia.org/1.0.0/swagger.yaml',
        endpoint: 'https://wikimedia.org/api/rest_v1',
      }),
    },
  ],
  additionalTypeDefs: /* GraphQL */ `
    extend type pageview_project {
      banana: String
      apple: String!
    }
  `,
});
