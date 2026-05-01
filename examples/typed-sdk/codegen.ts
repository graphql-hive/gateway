import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
  schema: './supergraph.graphql',
  documents: 'services/sdk/operations.graphql',
  generates: {
    'services/sdk/generated.ts': {
      plugins: ['typescript-operations', 'typescript-generic-sdk'],
    },
  },
} satisfies CodegenConfig;
