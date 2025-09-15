import { createExampleSetup, createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

it('should have the log available in context outside of graphql execution', async () => {
  const { execute, port, getStd } = await gateway({
    supergraph: await supergraph(),
  });

  // graphiql
  let res = await fetch(`http://localhost:${port}/graphql`, {
    headers: {
      accept: 'text/html',
    },
  });
  await expect(res.text()).resolves.toContain('<title>Hive Gateway</title>');

  // readiness
  res = await fetch(`http://localhost:${port}/readiness`);
  expect(res.ok).toBeTruthy();

  // healthcheck
  res = await fetch(`http://localhost:${port}/healthcheck`);
  expect(res.ok).toBeTruthy();

  // graphql execution just in case
  await expect(
    execute({
      query,
    }),
  ).resolves.toEqual(result);

  const gwOut = getStd('both');

  if (gatewayRunner.includes('docker')) {
    expect(
      gwOut.match(/__CONTEXT_LOG_IS_AVAILABLE__/g)?.length,
    ).toBeGreaterThan(
      // (availability check by tenv + docker healthchecks) + graphiql + readiness + healthcheck + graphql execution
      5,
    );
  } else {
    expect(gwOut.match(/__CONTEXT_LOG_IS_AVAILABLE__/g)?.length).toBe(
      // (availability check by tenv) + graphiql + readiness + healthcheck + graphql execution
      5,
    );
  }
});
