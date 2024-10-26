// @ts-expect-error
import { healthCheckEndpoint } from '@e2e/tsconfig-paths/hck';
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  healthCheckEndpoint,
});
