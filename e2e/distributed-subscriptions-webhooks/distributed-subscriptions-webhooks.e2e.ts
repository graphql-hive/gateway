import { setTimeout } from 'node:timers/promises';
import {
  createTenv,
  dockerHostName,
  getAvailablePort,
  handleDockerHostNameInURLOrAtPath,
} from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
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

it('should receive subscription event on distributed gateway', async () => {
  const mainGwPort = await getAvailablePort();
  const mainGwUrl = `http://0.0.0.0:${mainGwPort}`;

  const products = await service('products', {
    env: {
      MAIN_GW_URL: mainGwUrl,
    },
  });

  const { output: supergraph } = await composeWithMesh({
    output: 'graphql',
    services: [products],
  });

  if (gatewayRunner.includes('docker')) {
    await handleDockerHostNameInURLOrAtPath(supergraph, []);
  }

  const mainGw = await gateway({
    port: mainGwPort,
    supergraph,
    env: redisEnv,
  });

  const gws = [
    mainGw, // main
    await gateway({ supergraph, env: redisEnv }), // replica 1
    await gateway({ supergraph, env: redisEnv }), // replica 2
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
    // either the webhook fails
    (async () => {
      await setTimeout(1_000);
      const res = await fetch(
        `http://0.0.0.0:${products.port}/product-released`,
      );
      if (!res.ok) {
        clients.map((client) => client.dispose());
        throw new Error(`Failed to trigger product release: ${res.statusText}`);
      }
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
            "name": "iPhone 10 Pro",
            "price": 110.99,
          },
        },
      },
    ]
  `);
});

it('should distribute subscription event even if main gateway is not subscribed', async () => {
  const mainGwPort = await getAvailablePort();
  const mainGwUrl = `http://0.0.0.0:${mainGwPort}`;

  const products = await service('products', {
    env: {
      MAIN_GW_URL: mainGwUrl,
    },
  });

  const { output: supergraph } = await composeWithMesh({
    output: 'graphql',
    services: [products],
  });

  if (gatewayRunner.includes('docker')) {
    await handleDockerHostNameInURLOrAtPath(supergraph, []);
  }

  await gateway({
    port: mainGwPort,
    supergraph,
    env: redisEnv,
  });

  const gws = [
    // mainGw, // main, we dont want to subscribe to the main gw
    await gateway({ supergraph, env: redisEnv }), // replica 1
    await gateway({ supergraph, env: redisEnv }), // replica 2
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
    // either the webhook fails
    (async () => {
      await setTimeout(1_000);
      const res = await fetch(
        `http://0.0.0.0:${products.port}/product-released`,
      );
      if (!res.ok) {
        clients.map((client) => client.dispose());
        throw new Error(`Failed to trigger product release: ${res.statusText}`);
      }
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
    ]
  `);
});
