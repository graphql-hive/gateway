import { defineConfig } from '@graphql-mesh/compose-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('Wiki', {
        source: './openapi.json',
        endpoint: 'https://api.chucknorris.io',
      }),
    },
  ],
});
