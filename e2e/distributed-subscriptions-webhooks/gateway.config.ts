import { defineConfig } from '@graphql-hive/gateway';
import Redis from 'ioredis';
import { RedisPubSub } from './redis-pubsub';

const pub = new Redis();
const sub = new Redis();
await new Promise((resolve) => pub.once('connect', resolve));
await new Promise((resolve) => sub.once('connect', resolve));

export const gatewayConfig = defineConfig({
  webhooks: true,
  pubsub: new RedisPubSub({ pub, sub }),
});
