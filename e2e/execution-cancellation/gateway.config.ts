import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  executionCancellation: true,
});
