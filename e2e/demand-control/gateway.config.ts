import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  demandControl: {
    includeExtensionMetadata: true,
    maxCost: 35,
  },
});
