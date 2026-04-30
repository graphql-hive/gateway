import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  renderLegacyGraphiQL: process.env['RENDER_LEGACY_GRAPHIQL_CONFIG'] === '1',
});
