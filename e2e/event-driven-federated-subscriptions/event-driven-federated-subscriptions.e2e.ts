import { setTimeout } from 'node:timers/promises';
import {
  createTenv,
  dockerHostName,
  handleDockerHostNameInURLOrAtPath,
} from '@internal/e2e';
import { connect as natsConnect } from '@nats-io/transport-node';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { beforeAll, expect, it } from 'vitest';

const { container, gateway, service, composeWithMesh, gatewayRunner } =
  createTenv(__dirname);

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

const fields = [`newProductSubgraph`, `newProductExtension`];

it.each(fields)(
  'should receive subscription published event on all distributed gateways w/ "%s" field',
  async (field) => {
    const { output: supergraph } = await composeWithMesh({
      output: 'graphql',
      services: [await service('products')],
    });

    if (gatewayRunner.includes('docker')) {
      await handleDockerHostNameInURLOrAtPath(supergraph, []);
    }

    const gws = [
      await gateway({ supergraph, env: natsEnv }),
      await gateway({ supergraph, env: natsEnv }),
      await gateway({ supergraph, env: natsEnv }),
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
            ${field} {
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
        const nats = await natsConnect({
          servers: [`${natsEnv.NATS_HOST}:${natsEnv.NATS_PORT}`],
        });
        await using _ = {
          async [Symbol.asyncDispose]() {
            await nats.flush();
            await nats.close();
          },
        };
        nats.publish(
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

    expect(msgs).toMatchObject([
      {
        data: {
          [field]: {
            name: 'Roomba X60',
            price: 100,
          },
        },
      },
      {
        data: {
          [field]: {
            name: 'Roomba X60',
            price: 100,
          },
        },
      },
      {
        data: {
          [field]: {
            name: 'Roomba X60',
            price: 100,
          },
        },
      },
    ]);
  },
);
