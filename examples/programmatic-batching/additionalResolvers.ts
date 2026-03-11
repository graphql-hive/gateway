import { print } from 'graphql';
import type { Maybe, Resolvers, UsersByIdResponse } from './types/resolvers';

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
        valuesFromResults: (data?: Maybe<UsersByIdResponse>) =>
          data?.results || null,
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
