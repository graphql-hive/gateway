import { defineConfig } from '@graphql-hive/gateway';
import { print } from 'graphql';

export const gatewayConfig = defineConfig({
  additionalResolvers: {
    Query: {
      user(root: any, args: any, context: any, info: any) {
        return context.API.Mutation.usersByIds({
          root,
          context,
          info,
          // Key for the following batched request
          key: args.id,
          // Arguments for the following batched request
          argsFromKeys: (ids: any) => ({ input: { ids } }),
          // Function to extract the result from the batched response
          valuesFromResults: (data: any) => data?.results,
          // Function to generate the selectionSet for the batched request
          selectionSet: (userSelectionSet: any) => /* GraphQL */ `
          {
            results ${print(userSelectionSet)} # Will print something like { id name }
          }
        `,
        });
      },
    },
  },
});
