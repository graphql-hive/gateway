import { defineConfig } from '@graphql-hive/gateway';
import { customResolvers } from './custom-resolvers';

export const gatewayConfig = defineConfig({
  additionalResolvers: [customResolvers],
});
