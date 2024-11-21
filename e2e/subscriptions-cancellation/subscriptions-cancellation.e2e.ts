import { setTimeout } from 'node:timers/promises';
import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should subscribe and cancel', async () => {
  expect.assertions(7);
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
  expect(gwOut.match(/__ITERABLE_GW__/g)?.length).toBe(1);
  expect(gwOut.match(/__NEXT_GW__/g)?.length).toBe(1);
  expect(gwOut.match(/__END_GW__/g)?.length).toBe(1);

  const srvOut = srv.getStd('out');

  expect(srvOut.match(/__ITERABLE_SRV__/g)?.length).toBe(1);
  expect(srvOut.match(/__NEXT_SRV__/g)?.length).toBe(1);
  expect(srvOut.match(/__END_SRV__/g)?.length).toBe(1);
});
