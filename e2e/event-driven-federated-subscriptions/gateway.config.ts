import { defineConfig } from '@graphql-hive/gateway';
import { RedisPubSub } from '@graphql-hive/pubsub/redis';
import Redis from 'ioredis';

/**
 * When a Redis connection enters "subscriber mode" (after calling SUBSCRIBE), it can only execute
 * subscriber commands (SUBSCRIBE, UNSUBSCRIBE, etc.). Meaning, it cannot execute other commands like PUBLISH.
 * To avoid this, we use two separate Redis clients: one for publishing and one for subscribing.
 */
const pub = new Redis({
  host: process.env['REDIS_HOST'],
  port: parseInt(process.env['REDIS_PORT']!),
});
const sub = new Redis({
  host: process.env['REDIS_HOST'],
  port: parseInt(process.env['REDIS_PORT']!),
});

export const gatewayConfig = defineConfig({
  maskedErrors: false,
  pubsub: new RedisPubSub(
    { pub, sub },
    {
      // we make sure to use the same prefix for all gateways to share the same channels and pubsub
      // meaning, all gateways using this channel prefix will receive and publish to the same topics
      channelPrefix: 'my-shared-gateways',
    },
  ),
});
