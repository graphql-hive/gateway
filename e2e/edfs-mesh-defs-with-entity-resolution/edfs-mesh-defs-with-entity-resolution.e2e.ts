import { setTimeout } from 'node:timers/promises';
import { createTenv, dockerHostName } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { beforeAll, expect, it } from 'vitest';

const { container, gateway, service, gatewayRunner } = createTenv(__dirname);

const natsEnv = {
  NATS_HOST: '',
  NATS_PORT: 0,
};
beforeAll(async () => {
  const nats = await container({
    name: 'nats',
    image: 'nats:2.11-alpine', // we want alpine for healtcheck
    containerPort: 4222,
    healthcheck: ['CMD-SHELL', 'wget --spider http://localhost:8222/healthz'],
  });
  natsEnv.NATS_HOST = gatewayRunner.includes('docker')
    ? dockerHostName
    : '0.0.0.0';
  natsEnv.NATS_PORT = nats.port;
});

it('should perform entity resolution', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [
        await service('products', {
          env: natsEnv,
        }),
        await service('reviews'),
      ],
    },
    env: natsEnv,
  });

  const client = createClient({
    url: `http://0.0.0.0:${gw.port}/graphql`,
    fetchFn: fetch,
    retryAttempts: 0,
  });

  const sub = client.iterate({
    query: /* GraphQL */ `
      subscription OnNewProduct {
        newProduct {
          id
          name
          price
          review {
            id
            content
          }
        }
      }
    `,
  });

  // wait a moment for the subscription to bite
  await setTimeout(50);

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        mutation AddProduct {
          addProduct(id: "10", name: "Desk", price: 199.99) {
            id
          }
        }
      `,
    }),
  ).resolves.toEqual({
    data: {
      addProduct: {
        id: '10',
      },
    },
  });

  for await (const msg of sub) {
    expect(msg).toEqual({
      data: {
        newProduct: {
          id: '10',
          name: 'Desk',
          price: 199.99,
          review: {
            id: '10',
            content: `Resolved review for the product with the id of 10`,
          },
        },
      },
    });
    break; // we're intererested in only one message
  }
});
