import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
import { hiveTracingSetup } from '@graphql-hive/plugin-opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import FakeTimers from '@sinonjs/fake-timers';

hiveTracingSetup({
  contextManager: new AsyncLocalStorageContextManager(),
  target: 'some/tar/get',
  accessToken: 'heysupersecret',
  endpoint: process.env['HIVE_TRACING_ENDPOINT']!,
});

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
  plugins: () => [useFakeTimers()],
});

// testing

// this process will run in a separate process from vite so we cant use vite's fake timers
const clock = FakeTimers.install({
  // time should pass as usual, avoid disrupting the gateway
  shouldAdvanceTime: true,
});
function useFakeTimers(): GatewayPlugin {
  return {
    async onRequest({ request, endResponse }) {
      if (request.url.endsWith('/_tick')) {
        const time = await request.json();
        clock.tick(time);
        endResponse(new Response());
      }
    },
  };
}
