import { defineConfig } from '@graphql-hive/gateway';
import { print } from 'graphql';
import type { Resolvers, UsersByIdResponse } from './types/resolvers';

export const additionalResolvers: Resolvers = {
  Query: {
    user(root, args, context, info) {
      return context.API.Mutation.usersByIds({
        root,
        context,
        info,
        // Key for the following batched request
        key: args.id,
        // Arguments for the following batched request
        argsFromKeys: (ids) => ({ input: { ids } }),
        // Function to extract the result from the batched response
        valuesFromResults: (data?: UsersByIdResponse) => data?.results,
        // Function to generate the selectionSet for the batched request
        selectionSet: (userSelectionSet) => /* GraphQL */ `
          {
            results ${print(userSelectionSet)} # Will print something like { id name }
          }
        `,
      });
    },
  },
};

export const gatewayConfig = defineConfig({
  additionalResolvers,
});
