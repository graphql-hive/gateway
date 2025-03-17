import type { Logger, MeshPubSub } from '@graphql-mesh/types';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import type { Plugin } from 'graphql-yoga';

// TODO: Use Yoga PubSub later
export interface GatewayWebhooksPluginOptions {
  pubsub?: MeshPubSub;
  logger: Logger;
}
export function useWebhooks({
  pubsub,
  logger,
}: GatewayWebhooksPluginOptions): Plugin {
  if (!pubsub) {
    throw new Error(`You must provide a pubsub instance to webhooks feature!
    Example:
      export const gatewayConfig = defineConfig({
        pubsub: new PubSub(),
        webhooks: true,
      })
    See documentation: https://the-guild.dev/docs/mesh/pubsub`);
  }
  return {
    onRequest({ request, url, endResponse, fetchAPI }) {
      const eventNames = pubsub.getEventNames();
      if ((eventNames as string[]).length === 0) {
        return;
      }
      const requestMethod = request.method.toLowerCase();
      const pathname = url.pathname;
      const expectedEventName = `webhook:${requestMethod}:${pathname}`;
      for (const eventName of eventNames) {
        if (eventName === expectedEventName) {
          logger?.debug(() => `Received webhook request for ${pathname}`);
          return handleMaybePromise(
            () => request.text(),
            function handleWebhookPayload(webhookPayload) {
              logger?.debug(
                () =>
                  `Emitted webhook request for ${pathname}: ${webhookPayload}`,
              );
              webhookPayload =
                request.headers.get('content-type') === 'application/json'
                  ? JSON.parse(webhookPayload)
                  : webhookPayload;
              pubsub.publish(eventName, webhookPayload);
              return endResponse(
                new fetchAPI.Response(null, {
                  status: 204,
                  statusText: 'OK',
                }),
              );
            },
          );
        }
      }
    },
  };
}
