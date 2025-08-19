import { defineConfig } from '@graphql-hive/gateway';
import { RedisPubSub } from '@graphql-hive/pubsub/redis';
import Redis from 'ioredis';

/**
 * When a Redis connection enters "subscriber mode" (after calling SUBSCRIBE), it can only execute
 * subscriber commands (SUBSCRIBE, UNSUBSCRIBE, etc.). Meaning, it cannot execute other commands like PUBLISH.
 * To avoid this, we use two separate Redis clients: one for publishing and one for subscribing.
 */
const pub = new Redis({ port: parseInt(process.env['REDIS_PORT']!) });
const sub = new Redis({ port: parseInt(process.env['REDIS_PORT']!) });

export const gatewayConfig = defineConfig({
  webhooks: true,
  pubsub: new RedisPubSub({ pub, sub }),
});
