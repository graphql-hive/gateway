import type { CodegenConfig } from '@graphql-codegen/cli';

const supergraphPath = process.env['SUPERGRAPH_PATH'] || 'supergraph.graphql';

export default {
  generates: {
    'services/sdk/generated.ts': {
      schema: supergraphPath,
      documents: 'services/sdk/operations.graphql',
      plugins: ['typescript-operations', 'typescript-generic-sdk'],
    },
  },
} satisfies CodegenConfig;
