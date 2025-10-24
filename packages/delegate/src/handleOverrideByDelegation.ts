import { GraphQLResolveInfo, memoize3 } from '@graphql-tools/utils';
import { OverrideHandler } from './types';

export const handleOverrideByDelegation = memoize3(
  function handleOverrideByDelegation(
    info: GraphQLResolveInfo,
    context: any,
    overrideHandler: OverrideHandler,
  ): boolean {
    return overrideHandler(context, info);
  },
);
