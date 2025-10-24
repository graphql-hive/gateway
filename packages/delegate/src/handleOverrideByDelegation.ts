import { GraphQLResolveInfo, memoize3 } from '@graphql-tools/utils';

export const handleOverrideByDelegation = memoize3(
  function handleOverrideByDelegation(
    _info: GraphQLResolveInfo,
    context: any,
    handle: (context: any) => boolean,
  ): boolean {
    return handle(context);
  },
);
