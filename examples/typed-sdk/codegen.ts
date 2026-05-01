import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
  schema: './supergraph.graphql',
  documents: 'sdk/operations.graphql',
  generates: {
    'sdk/generated.ts': {
      plugins: ['typescript-operations', 'typescript-generic-sdk'],
    },
  },
} satisfies CodegenConfig;
