import { setTimeout } from 'node:timers/promises';
import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { createDisposableQueueServer, QueueServer } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { describe, expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

describe.skipIf(
  // bun has issues with the fake timer in the gateway config
  ['bun', 'bun-docker'].includes(gatewayRunner),
)('Hive Tracing Circuit Breaker', () => {
  it('should trip circuit breaker on error threashold reached', async () => {
    const otel = await createDisposableQueueServer();

    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        HIVE_TRACING_ENDPOINT: otel.url,
      },
    });

    await queryTypenameAndProcessSpans(gw);

    // collector available
    await otel.queue(() => new Response());

    // attempt to report query spans 2 times, the circuit breaker would kick in
    // this is because the errorThresholdPercentage is set to 50%, so after 2 failed
    // attempts out of 3 (one success), the circuit will open and prevent further attempts
    // until the reset timeout has passed
    for (let i = 0; i < 2; i++) {
      await queryTypenameAndExhaustDownCollectorRetries(gw, otel);
    }

    await queryTypenameAndProcessSpans(gw);

    await Promise.race([
      setTimeout(100), // expires
      otel.queue(() =>
        expect.fail('should not attempt to send spans when circuit is open'),
      ),
    ]);
  });

  it('should close circuit breaker after reset timeout', async () => {
    const otel = await createDisposableQueueServer();

    const gw = await gateway({
      supergraph: await supergraph(),
      env: {
        HIVE_TRACING_ENDPOINT: otel.url,
      },
    });

    // circuit breaker needs 3 attempts to trip because the volumeThreshold is 3
    for (let i = 0; i < 3; i++) {
      await queryTypenameAndExhaustDownCollectorRetries(gw, otel);
    }

    // circuit is now open, attempts should be blocked immediately without trying to send spans to the collector
    for (let i = 0; i < 3; i++) {
      await queryTypenameAndProcessSpans(gw);
      await Promise.race([
        setTimeout(100), // expires
        otel.queue(() =>
          expect.fail('should not attempt to send spans when circuit is open'),
        ),
      ]);
      await otel.fetch('http://otel').catch(() => {}); // empty queue
    }

    // advance time by 60s to allow the circuit breaker to reset
    await advanceGatewayTimersByTime(gw, 60_000);

    // now attempts should go through and we should see the collector receive the spans
    await queryTypenameAndProcessSpans(gw);
    await otel.queue(() => new Response());
  });
});

// utilities

async function queryTypenameAndProcessSpans(gateway: Gateway) {
  await expect(gateway.execute({ query: '{ __typename }' })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );

  // batch exporter scheduledDelayMillis defaults to 5s
  await advanceGatewayTimersByTime(gateway, 5_000);
}

async function queryTypenameAndExhaustDownCollectorRetries(
  gateway: Gateway,
  collector: QueueServer,
) {
  await queryTypenameAndProcessSpans(gateway);

  // collector down

  // these are attempts from otel's span exporter - this is how their retry mechanism works
  // https://github.com/open-telemetry/opentelemetry-js/blob/1bffafaf6cdcac297fea7363312be75a19b8f527/experimental/packages/otlp-exporter-base/src/retrying-transport.ts

  // attempt 1
  await collector.queue(() => new Response(null, { status: 503 }));

  // attempt 2: immediate
  await collector.queue(() => new Response(null, { status: 503 }));

  // attempt 3: ~1,000ms backoff
  await advanceGatewayTimersByTime(gateway, 1_000);
  await collector.queue(() => new Response(null, { status: 503 }));

  // attempt 4: ~1,500ms backoff
  await advanceGatewayTimersByTime(gateway, 1_500);
  await collector.queue(() => new Response(null, { status: 503 }));

  // attempt 5: ~2,250ms backoff
  await advanceGatewayTimersByTime(gateway, 2_250);
  await collector.queue(() => new Response(null, { status: 503 }));
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
