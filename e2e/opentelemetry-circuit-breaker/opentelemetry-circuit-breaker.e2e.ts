import { setTimeout } from 'node:timers/promises';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { createDisposableServer } from '@internal/testing';
import { createServerAdapter } from '@whatwg-node/server';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should huh?', async () => {
  let count = 0;
  const otel = await createDisposableServer(
    createServerAdapter(async (req) => {
      console.log({
        count: ++count,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        // body: await req.text(),
      });
      if (count >= 5) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response();
    }),
  );

  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      HIVE_TRACING_ENDPOINT: otel.url,
    },
  });

  await expect(execute({ query: '{ __typename }' })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );

  await setTimeout(30_000);
});
