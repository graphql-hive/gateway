import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('users', {
        source: `http://localhost:${opts.getServicePort('users')}/openapi.json`,
        endpoint: `http://localhost:${opts.getServicePort('users')}`,
      }),
    },
  ],
});
