import {
  createPrefixTransform,
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

const greetingsPort = opts.getServicePort('greetings');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('greetings', {
        endpoint: `http://localhost:${greetingsPort}/graphql`,
      }),
      transforms: [
        createPrefixTransform({
          value: process.env['TRANSFORM_PREFIX'] || 'Greetings_',
          includeRootOperations: true,
        }),
      ],
    },
  ],
});
