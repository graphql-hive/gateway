import type { Logger, MeshPubSub } from '@graphql-mesh/types';
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
    onRequest({ request, url, endResponse, fetchAPI }): void | Promise<void> {
      for (const eventName of pubsub.getEventNames()) {
        if (
          eventName ===
          `webhook:${request.method.toLowerCase()}:${url.pathname}`
        ) {
          logger?.debug(() => [`Received webhook request for ${url.pathname}`]);
          return request.text().then((body) => {
            logger?.debug(() => [
              `Emitted webhook request for ${url.pathname}`,
              body,
            ]);
            pubsub.publish(
              eventName,
              request.headers.get('content-type') === 'application/json'
                ? JSON.parse(body)
                : body,
            );
            endResponse(
              new fetchAPI.Response(null, {
                status: 204,
                statusText: 'OK',
              }),
            );
          });
        }
      }
    },
  };
}
