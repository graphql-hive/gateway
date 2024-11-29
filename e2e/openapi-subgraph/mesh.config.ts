import {
  createEncapsulateTransform,
  createFederationTransform,
  defineConfig,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

const endpoint = `http://localhost:${opts.getServicePort('Test')}`;

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('Test', {
        source: `${endpoint}/openapi.json`,
        endpoint,
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
      sourceHandler: loadOpenAPISubgraph('TestEncapsulated', {
        source: `${endpoint}/openapi.json`,
        endpoint,
      }),
      transforms: [
        createEncapsulateTransform({
          name: 'test',
          applyTo: {
            query: true,
            mutation: false,
            subscription: false,
          },
        }),
      ],
    },
  ],
});
