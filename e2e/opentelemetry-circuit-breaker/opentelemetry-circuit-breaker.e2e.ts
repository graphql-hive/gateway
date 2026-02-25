import { setTimeout } from 'node:timers/promises';
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

  await queryTypenameAndAdvaceTimersToProcessSpans(gw);

  // collector available
  await otel.queue(() => new Response());

  // attempt to report query spans 3 times, the circuit breaker would kick in
  for (let i = 0; i < 5; i++) {
    await queryTypenameAndAdvaceTimersToProcessSpans(gw);

    // collector down
    // attempt 1
    await otel.queue(() => new Response(null, { status: 503 }));

    // attempt 2: immediate
    await otel.queue(() => new Response(null, { status: 503 }));

    // attempt 3: ~1,000ms backoff
    await advanceGatewayTimersByTime(gw, 1_000);
    await otel.queue(() => new Response(null, { status: 503 }));

    // attempt 4: ~1,500ms backoff
    await advanceGatewayTimersByTime(gw, 1_500);
    await otel.queue(() => new Response(null, { status: 503 }));

    // attempt 5: ~2,250ms backoff
    await advanceGatewayTimersByTime(gw, 2_250);
    await otel.queue(() => new Response(null, { status: 503 }));
  }

  await queryTypenameAndAdvaceTimersToProcessSpans(gw);

  await Promise.race([
    setTimeout(100), // expires
    otel.queue(() =>
      expect.fail('should not attempt to send spans when circuit is open'),
    ),
  ]);
});

// utilities

async function queryTypenameAndAdvaceTimersToProcessSpans(gateway: Gateway) {
  await expect(gateway.execute({ query: '{ __typename }' })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );

  // batch exporter scheduledDelayMillis defaults to 5s
  await advanceGatewayTimersByTime(gateway, 5_000);
}

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
