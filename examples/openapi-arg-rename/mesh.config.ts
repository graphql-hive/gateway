import {
  camelCase,
  createNamingConventionTransform,
  createRenameTransform,
  defineConfig,
} from '@graphql-mesh/compose-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const composeConfig = defineConfig({
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('Wiki', {
        source: './openapi.json',
        endpoint: `http://localhost:${4001}`,
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
