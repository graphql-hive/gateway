import {
  defineConfig,
  loadGraphQLHTTPSubgraph,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

const oaiEndpoint = `http://localhost:${opts.getServicePort('oai-flakey')}`;
const gqlEndpoint = `http://localhost:${opts.getServicePort('gql-flakey')}/graphql`;

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('oai-flakey', {
        source: `${oaiEndpoint}/openapi.json`,
        endpoint: oaiEndpoint,
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('gql-flakey', {
        endpoint: gqlEndpoint,
      }),
    },
  ],
});
