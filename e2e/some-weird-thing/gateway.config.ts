import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  maskedErrors: false,
  upstreamTimeout: 300, // the timeout of the upstream request, also see mesh.config.ts `timeout`
  requestDeadline: 500, // the absolute total deadline of the request
  prometheus: {
    metrics: true,
  },
  plugins: () => [
    {
      async onExecute() {
        // longer than request deadline
        await new Promise((resolve) => setTimeout(resolve, 900));
      },
    } satisfies GatewayPlugin,
  ],
});
