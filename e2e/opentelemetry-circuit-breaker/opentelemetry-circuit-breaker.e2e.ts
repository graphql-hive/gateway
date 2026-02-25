import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { createDisposableQueueServer } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should huh?', async () => {
  const otel = await createDisposableQueueServer();

  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      HIVE_TRACING_ENDPOINT: otel.url,
    },
  });

  await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );

  // batch exporter scheduledDelayMillis defaults to 5s
  await advanceGatewayTimersByTime(gw, 5_000);

  await otel.queue(() => new Response());
});

async function advanceGatewayTimersByTime(gateway: Gateway, timeInMs: number) {
  const res = await fetch(`http://localhost:${gateway.port}/_tick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(timeInMs),
  });
  if (!res.ok) {
    throw new Error(`Failed to advance gateway timers: ${res.statusText}`);
  }
}
