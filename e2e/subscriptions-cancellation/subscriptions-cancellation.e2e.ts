import { setTimeout } from 'node:timers/promises';
import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should subscribe and cancel', async () => {
  const srv = await service('stream');
  const gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [srv],
    },
  });

  const client = createClient({
    url: `http://0.0.0.0:${gw.port}/graphql`,
    fetchFn: fetch,
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

  await setTimeout(1_000); // allow some calmdown time (TODO: avoid magic numbers, any other approach to this?)

  const gwOut = gw.getStd('out');
  expect(gwOut).toContain('ITERABLE');
  expect(gwOut).toContain('NEXT');
  expect(gwOut).toContain('END');

  const srvOut = srv.getStd('out');
  expect(srvOut).toContain('ITERABLE');
  expect(srvOut).toContain('NEXT');
  expect(srvOut).toContain('END');
});
