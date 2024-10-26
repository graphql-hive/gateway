import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  additionalResolvers: {
    pageview_project: {
      banana() {
        return '🍌';
      },
      apple() {
        return '🍎';
      },
    },
  },
});
