import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.rest': {
      headers: [['user-agent', 'hive-gateway/e2e']],
    },
  },
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
