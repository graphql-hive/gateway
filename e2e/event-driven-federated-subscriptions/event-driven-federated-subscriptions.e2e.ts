import { setTimeout } from 'node:timers/promises';
import {
  createTenv,
  dockerHostName,
  handleDockerHostNameInURLOrAtPath,
} from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import Redis from 'ioredis';
import { beforeAll, expect, it } from 'vitest';

const { container, gateway, service, composeWithMesh, gatewayRunner } =
  createTenv(__dirname);

const redisEnv = {
  REDIS_HOST: '',
  REDIS_PORT: 0,
};
beforeAll(async () => {
  const redis = await container({
    name: 'redis',
    image: 'redis:8',
    containerPort: 6379,
    healthcheck: ['CMD-SHELL', 'redis-cli ping'],
    env: {
      LANG: '', // fixes "Failed to configure LOCALE for invalid locale name."
    },
  });
  redisEnv.REDIS_HOST = gatewayRunner.includes('docker')
    ? dockerHostName
    : '0.0.0.0';
  redisEnv.REDIS_PORT = redis.port;
});

it('should receive subscription published event on all distributed gateways', async () => {
  const { output: supergraph } = await composeWithMesh({
    output: 'graphql',
    services: [await service('products')],
  });

  if (gatewayRunner.includes('docker')) {
    await handleDockerHostNameInURLOrAtPath(supergraph, []);
  }

  const gws = [
    await gateway({ supergraph, env: redisEnv }),
    await gateway({ supergraph, env: redisEnv }),
    await gateway({ supergraph, env: redisEnv }),
  ];

  const clients = gws.map((gw) =>
    createClient({
      url: `http://0.0.0.0:${gw.port}/graphql`,
      fetchFn: fetch,
      retryAttempts: 0,
    }),
  );

  const subs = clients.map((client) =>
    client.iterate({
      query: /* GraphQL */ `
        subscription {
          newProduct {
            name
            price
          }
        }
      `,
    }),
  );

  const msgs: any[] = [];

  await Promise.all([
    // either the publishing fails
    (async () => {
      await setTimeout(1_000);
      const pub = new Redis({
        host: redisEnv.REDIS_HOST,
        port: redisEnv.REDIS_PORT,
        lazyConnect: true,
      });
      pub.once('error', () => {});
      await pub.connect();
      using _ = {
        [Symbol.dispose]() {
          pub.disconnect();
        },
      };
      await pub.publish(
        'my-shared-gateways:new_product',
        JSON.stringify({
          id: '60',
        }),
      );
    })(),
    // or the subscription events go through
    ...subs.map((sub) =>
      (async () => {
        for await (const msg of sub) {
          msgs.push(msg);
          break; // we're intererested in only one message
        }
      })(),
    ),
  ]);

  expect(msgs).toMatchInlineSnapshot(`
    [
      {
        "data": {
          "newProduct": {
            "name": "Roomba X60",
            "price": 100,
          },
        },
      },
      {
        "data": {
          "newProduct": {
            "name": "Roomba X60",
            "price": 100,
          },
        },
      },
      {
        "data": {
          "newProduct": {
            "name": "Roomba X60",
            "price": 100,
          },
        },
      },
    ]
  `);
});
