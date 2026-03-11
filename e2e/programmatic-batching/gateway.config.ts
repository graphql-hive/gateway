import { defineConfig } from '@graphql-hive/gateway';
import { additionalResolvers } from './additionalResolvers';

export const gatewayConfig = defineConfig({
  additionalResolvers,
});
