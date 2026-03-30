import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

const restPort = opts.getServicePort('rest');

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('rest', {
        source: `http://localhost:${restPort}/openapi.json`,
        endpoint: `http://localhost:${restPort}`,
      }),
    },
  ],
});
