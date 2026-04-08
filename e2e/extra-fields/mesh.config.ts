import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { additionalTypeDefs } from './additionalTypeDefs';

const opts = Opts(process.argv);

const additionalTypeDefsIn = process.env['ADDITIONAL_TYPE_DEFS_IN'];

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadGraphQLHTTPSubgraph('foo', {
        endpoint: `http://localhost:${opts.getServicePort('foo')}/graphql`,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('bar', {
        endpoint: `http://localhost:${opts.getServicePort('bar')}/graphql`,
      }),
    },
  ],
  additionalTypeDefs:
    additionalTypeDefsIn === 'both' || additionalTypeDefsIn === 'mesh'
      ? additionalTypeDefs
      : undefined,
});
