import { defineConfig } from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('OpenAPICallbackExample', {
        source: './services/api/openapi.yml',
        endpoint: `http://localhost:${opts.getServicePort('api')}`,
      }),
    },
  ],
});
