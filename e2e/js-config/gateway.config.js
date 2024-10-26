import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  additionalResolvers: {
    Query: {
      hello() {
        return 'world';
      },
    },
  },
});
