import type { Logger } from '@graphql-hive/logger';
import { HivePubSub } from '@graphql-hive/pubsub';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GatewayPlugin } from '../types';

export interface GatewayWebhooksPluginOptions {
  log: Logger;
  pubsub?: HivePubSub;
}

export function useWebhooks({
  log,
  pubsub,
}: GatewayWebhooksPluginOptions): GatewayPlugin {
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
      const eventNames = pubsub.getEventNames();
      if ((eventNames as string[]).length === 0) {
        return;
      }
      const requestMethod = request.method.toLowerCase();
      const pathname = url.pathname;
      const expectedEventName = `webhook:${requestMethod}:${pathname}`;
      for (const eventName of eventNames) {
        if (eventName === expectedEventName) {
          log.debug('Received webhook request for %s', pathname);
          return handleMaybePromise(
            () => request.text(),
            function handleWebhookPayload(webhookPayload) {
              log.debug(
                'Emitted webhook request for %s: %s',
                pathname,
                webhookPayload,
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
