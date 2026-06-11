import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';

const reqRes = new WeakMap<Request, number>();

export const gatewayConfig = defineConfig({
  requestDeadline: 100,
  plugins: () => [
    {
      onRequest({ request }) {
        if (request.url.endsWith('/graphql')) {
          // track only graphql requests
          reqRes.set(request, Date.now());
        }
      },
      onResponse({ response, request }) {
        const start = reqRes.get(request);
        if (start) {
          console.log(
            '[onResponse]' +
              JSON.stringify({
                statusCode: response.status,
                durationInMs: Date.now() - start,
              }),
          );
        }
      },
    } satisfies GatewayPlugin,
  ],
});
