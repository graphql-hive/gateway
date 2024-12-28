import {
  createFederationTransform,
  createTypeReplaceTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';
import { GraphQLID, GraphQLNonNull } from 'graphql';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('accounts', {
        source: `http://localhost:${4001}/openapi.json`,
        endpoint: `http://localhost:${4001}`,
      }),
      transforms: [
        createTypeReplaceTransform((typeName, fieldName) =>
          typeName === 'User' && fieldName === 'id'
            ? new GraphQLNonNull(GraphQLID)
            : undefined,
        ),
        createFederationTransform({
          User: {
            key: {
              fields: 'id',
              resolveReference: {
                keyArg: 'id',
                fieldName: 'user',
              },
            },
          },
        }),
      ],
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('products', {
        endpoint: `http://localhost:${4003}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('inventory', {
        endpoint: `http://localhost:${4002}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('reviews', {
        endpoint: `http://localhost:${4004}/graphql`,
      }),
    },
  ],
});
