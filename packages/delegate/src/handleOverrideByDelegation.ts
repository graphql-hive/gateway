import { memoize3 } from '@graphql-tools/utils';
import { GraphQLResolveInfo } from 'graphql';
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
