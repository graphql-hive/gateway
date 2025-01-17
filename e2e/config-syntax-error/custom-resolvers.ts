// @ts-nocheck -- syntax error intentionally

import { GatewayContext } from '@graphql-hive/gateway';
import { IResolvers } from '@graphql-tools/utils';

export const customResolvers: IResolvers<unknown, GatewayContext> = {
  Query: {
    bye() hello {
      return 'world';
    },
  },
};
