import { createTenv, getAvailablePort } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service, composeWithApollo } = createTenv(__dirname);

it('should subscribe and cancel', async () => {
  const products = await service('products');

  const { output: supergraph } = await composeWithApollo({
    services: [products],
  });

  const mainGwPort = await getAvailablePort();
  const mainGwUrl = `http://0.0.0.0:${mainGwPort}`;
  const mainGw = await gateway({
    port: mainGwPort,
    supergraph,
    pipeLogs: 'mainGw.out',
    env: {
      PUBLIC_URL: mainGwUrl,
    },
  });

  const gws = [
    mainGw, // main
    await gateway({
      supergraph,
      pipeLogs: 'replica1.out',
      env: {
        DEBUG: 1,
        PUBLIC_URL: mainGwUrl,
      },
    }), // replica 1
    await gateway({
      supergraph,
      pipeLogs: 'replica2.out',
      env: {
        PUBLIC_URL: mainGwUrl,
      },
    }), // replica 2
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

  // TODO: report this error somehow
  setTimeout(async () => {
    const res = await fetch(`http://0.0.0.0:${products.port}/product-released`);
    if (!res.ok) {
      throw new Error(`Failed to trigger product release: ${res.statusText}`);
    }
  }, 100);

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
