import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins: () => [
    {
      onResponse({ serverContext }) {
        if (serverContext.log) {
          console.log('__CONTEXT_LOG_IS_AVAILABLE__');
        }
      },
    } as GatewayPlugin,
  ],
});
