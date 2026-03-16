import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './supergraph.graphql',
  config: {
    maybeValue: 'T | undefined',
    // Mesh uses Schema Stitching
    noSchemaStitching: false,
  },
  generates: {
    './types/incontext-sdk.ts': {
      plugins: ['@graphql-mesh/incontext-sdk-codegen'],
    },
    './types/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: './incontext-sdk#MeshInContextSDK',
      },
    },
  },
};

export default config;
