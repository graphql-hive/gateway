import { CircuitBreakerConfiguration } from '@graphql-hive/gateway-runtime';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { createDisposableServer } from '@internal/testing';
import { createServerAdapter } from '@whatwg-node/server';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query } = createExampleSetup(__dirname);

it('should huh?', async () => {
  const otel = await createDisposableServer(
    createServerAdapter(async (req) => {
      // const body = await req.text();
      console.log({
        method: req.method,
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        body: '[redacted]',
      });
      return new Response();
    }),
  );

  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      HIVE_TRACING_ENDPOINT: otel.url,
      ...circuitBreakerConfigEnv({
        errorThresholdPercentage: 50,
        volumeThreshold: 5,
        resetTimeout: 30_000,
      }),
    },
  });

  await expect(execute({ query })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );
});

function circuitBreakerConfigEnv(config: CircuitBreakerConfiguration) {
  return { CIRCUIT_BREAKER_CONFIG: JSON.stringify(config) };
}
