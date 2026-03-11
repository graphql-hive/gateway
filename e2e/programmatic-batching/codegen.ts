import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './supergraph.graphql',
  generates: {
    './types/incontext-sdk.ts': {
      plugins: ['@graphql-mesh/incontext-sdk-codegen'],
    },
    './types/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        noSchemaStitching: false,
        contextType: './incontext-sdk#MeshInContextSDK',
      },
    },
  },
};

export default config;
