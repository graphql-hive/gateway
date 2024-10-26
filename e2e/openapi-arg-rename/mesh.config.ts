import {
  camelCase,
  createNamingConventionTransform,
  createRenameTransform,
  defineConfig,
} from '@graphql-mesh/compose-cli';
import { Opts } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('Wiki', {
        source: './openapi.json',
        endpoint: `http://localhost:${opts.getServicePort('Wiki')}`,
      }),
      transforms: [
        createNamingConventionTransform({
          fieldNames: camelCase,
        }),
        createRenameTransform({
          argRenamer: ({ argName, fieldName }) => {
            if (fieldName === 'postBad' && argName === 'input') {
              return 'requestBody';
            }

            return argName;
          },
        }),
      ],
    },
  ],
});
