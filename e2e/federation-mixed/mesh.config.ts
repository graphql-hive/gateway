import {
  createFederationTransform,
  createTypeReplaceTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';
import { GraphQLID, GraphQLNonNull } from 'graphql';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('accounts', {
        source: `http://localhost:${opts.getServicePort('accounts')}/openapi.json`,
        endpoint: `http://localhost:${opts.getServicePort('accounts')}`,
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
        endpoint: `http://localhost:${opts.getServicePort('products')}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('inventory', {
        endpoint: '{env.INVENTORY_ENDPOINT}',
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('reviews', {
        endpoint: `http://localhost:${opts.getServicePort('reviews')}/graphql`,
      }),
    },
  ],
});
