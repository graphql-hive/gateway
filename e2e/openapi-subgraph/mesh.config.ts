import {
  createEncapsulateTransform,
  createFederationTransform,
  createPrefixTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

const OAS_ENDPOINT = `http://localhost:${opts.getServicePort('OAS')}`;
const GQL_ENDPOINT = `http://localhost:${opts.getServicePort('GQL')}/graphql`;

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('OAS', {
        source: `${OAS_ENDPOINT}/openapi.json`,
        endpoint: OAS_ENDPOINT,
      }),
      transforms: [
        createFederationTransform({
          User: {
            key: [
              {
                fields: 'id',
                resolveReference: {
                  fieldName: 'user',
                  keyArg: 'id',
                  keyField: 'id',
                },
              },
            ],
          },
        }),
      ],
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('GQL', {
        endpoint: GQL_ENDPOINT,
      }),
      transforms: [
        createEncapsulateTransform({
          name: 'gql',
          applyTo: {
            query: true,
            mutation: false,
            subscription: false,
          },
        }),
        createPrefixTransform({
          value: 'GQL_',
          // TODO: Query will be fixed later
          ignore: ['gqlQuery', 'Query'],
          includeRootOperations: false,
          includeTypes: true,
        }),
        createFederationTransform({
          GQL_Book: {
            key: [
              {
                fields: 'id',
              },
            ],
          },
        })
      ],
    },
  ],
});
