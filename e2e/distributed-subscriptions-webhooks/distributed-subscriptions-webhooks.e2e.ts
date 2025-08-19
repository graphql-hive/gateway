import { Container, createTenv, getAvailablePort } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { beforeAll, expect, it } from 'vitest';

const { container, gateway, service, composeWithMesh } = createTenv(__dirname);

let redis!: Container;
beforeAll(async () => {
  redis = await container({
    name: 'redis',
    image: 'redis:8',
    containerPort: 6379,
    healthcheck: ['CMD-SHELL', 'redis-cli ping'],
    env: {
      LANG: '', // fixes "Failed to configure LOCALE for invalid locale name."
    },
  });
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

  const mainGw = await gateway({
    port: mainGwPort,
    supergraph,
    env: { REDIS_PORT: redis.port },
  });

  const gws = [
    mainGw, // main
    await gateway({ supergraph, env: { REDIS_PORT: redis.port } }), // replica 1
    await gateway({ supergraph, env: { REDIS_PORT: redis.port } }), // replica 2
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

  // TODO: properly wait for subscriptions to establish

  setTimeout(async () => {
    const res = await fetch(`http://0.0.0.0:${products.port}/product-released`);
    if (!res.ok) {
      // TODO: fail test on this error
      throw new Error(`Failed to trigger product release: ${res.statusText}`);
    }
  }, 1_000);

  for (const sub of subs) {
    for await (const msg of sub) {
      msgs.push(msg);
      break; // we're intererested in only one message
    }
  }

  expect(msgs).toMatchInlineSnapshot(`
    [
      {
        "data": {
          "newProduct": {
            "name": "iPhone 10 Pro",
            "price": 110.99,
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
