import type { Logger } from '@graphql-hive/logger';
import type { PubSub } from '@graphql-hive/pubsub';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GatewayPlugin } from '../types';

export interface GatewayWebhooksPluginOptions {
  log: Logger;
  pubsub?: PubSub;
}

export function useWebhooks({
  log: rootLog,
  pubsub,
}: GatewayWebhooksPluginOptions): GatewayPlugin {
  const log = rootLog.child('[useWebhooks] ');
  if (!pubsub) {
    throw new Error(`You must provide a pubsub instance to webhooks feature!
    Example:
      import { PubSub } from '@graphql-hive/gateway'
      export const gatewayConfig = defineConfig({
        pubsub: new PubSub(),
        webhooks: true,
      })
    See documentation: https://the-guild.dev/docs/mesh/pubsub`);
  }
  return {
    onRequest({ request, url, endResponse, fetchAPI }) {
      const topics = pubsub.subscribedTopics();
      if (Array(topics).length === 0) return;
      const requestMethod = request.method.toLowerCase();
      const pathname = url.pathname;
      const expectedEventName = `webhook:${requestMethod}:${pathname}`;
      for (const eventName of topics) {
        if (eventName === expectedEventName) {
          log.debug({ pathname }, 'Received webhook request');
          return handleMaybePromise(
            () => request.text(),
            function handleWebhookPayload(webhookPayload) {
              log.debug(
                { pathname, payload: webhookPayload },
                'Emitted webhook request',
              );
              webhookPayload =
                request.headers.get('content-type') === 'application/json'
                  ? JSON.parse(webhookPayload)
                  : webhookPayload;
              return handleMaybePromise(
                () => pubsub.publish(eventName, webhookPayload),
                () => {
                  endResponse(
                    new fetchAPI.Response(null, {
                      status: 204,
                      statusText: 'OK',
                    }),
                  );
                },
              );
            },
          );
        }
      }
    },
  };
}
