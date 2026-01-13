import { createTenv } from '@internal/e2e';
import { createClient } from 'graphql-ws';
import { expect, it } from 'vitest';
import WebSocket from 'ws';

const { gateway, service } = createTenv(__dirname);

it('should support WebSocket subscriptions when using gateway programmatically', async () => {
  expect.assertions(2);
  const srv = await service('api');
  const { port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [srv],
    },
  });

  const client = createClient({
    url: `ws://0.0.0.0:${port}/graphql`,
    webSocketImpl: WebSocket,
    retryAttempts: 0,
    connectionParams: {
      authToken: 'test-token',
      clientId: 'test-client',
    },
  });

  // Test messageAdded subscription
  let messageCount = 0;
  const messageSubscription = client.iterate({
    query: `
      subscription {
        messageAdded
      }
    `,
  });

  for await (const msg of messageSubscription) {
    expect(msg).toMatchInlineSnapshot(`
      {
        "data": {
          "messageAdded": "Message 1",
        },
      }
    `);
    messageCount++;
    if (messageCount >= 1) break;
  }

  // Test countdown subscription
  const countdownSubscription = client.iterate({
    query: `
      subscription {
        countdown(from: 3)
      }
    `,
  });

  let countdownValues: number[] = [];
  for await (const msg of countdownSubscription) {
    if (msg.data && typeof msg.data['countdown'] === 'number') {
      countdownValues.push(msg.data['countdown']);
    }
  }

  expect(countdownValues).toEqual([3, 2, 1, 0]);

  client.dispose();
});
