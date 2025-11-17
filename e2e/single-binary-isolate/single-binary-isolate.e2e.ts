import { createExampleSetup, createTenv } from '@internal/e2e';
import { isolate } from '@internal/testing';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const {
  supergraph: createSupergraph,
  query,
  result,
} = createExampleSetup(__dirname);

it.runIf(gatewayRunner === 'bin')('should execute in isolation', async () => {
  const supergraph = await createSupergraph();
  await using _restore = await isolate({ log: true });
  const { execute } = await gateway({ supergraph });
  await expect(
    execute({
      query,
    }),
  ).resolves.toEqual(result);
});
