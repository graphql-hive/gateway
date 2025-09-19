import { createTenv } from '@internal/e2e';
import { createClient } from 'graphql-ws';
import { expect, it } from 'vitest';
import WebSocket from 'ws';

const { gateway, service } = createTenv(__dirname);

it('should subscribe over WS and propagate interpolated context', async () => {
  const srv = await service('stream');
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [srv],
    },
  });

  const client = createClient({
    url: `ws://0.0.0.0:${gw.port}/graphql`,
    webSocketImpl: WebSocket,
    retryAttempts: 0,
  });

  for await (const msg of client.iterate({
    query: 'subscription{emitsOnceAndStalls}',
  })) {
    expect(msg).toMatchInlineSnapshot(`
      {
        "data": {
          "emitsOnceAndStalls": "👋",
        },
      }
    `);
    break; // disconnect as soon as we get the first message
  }
  client.dispose(); // dispose of client to be double sure
});
