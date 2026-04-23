import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { additionalTypeDefs } from './additionalTypeDefs';

const additionalTypeDefsIn = process.env['ADDITIONAL_TYPE_DEFS_IN'];

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('foo', {
        endpoint: `http://localhost:${4001}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('bar', {
        endpoint: `http://localhost:${4002}/graphql`,
      }),
    },
  ],
  additionalTypeDefs:
    additionalTypeDefsIn === 'both' || additionalTypeDefsIn === 'mesh'
      ? additionalTypeDefs
      : undefined,
});
