import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  gracefulShutdownTimeout: parseInt(process.env['GRACEFUL_SHUTDOWN_TIMEOUT']!),
});
