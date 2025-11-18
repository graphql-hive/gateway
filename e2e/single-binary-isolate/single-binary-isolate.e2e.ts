import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const {
  supergraph: createSupergraph,
  query,
  result,
} = createExampleSetup(__dirname);

it.runIf(gatewayRunner === 'bin')('should execute in isolation', async () => {
  const supergraph = await createSupergraph();
  const { execute } = await gateway({
    supergraph,
    env: {
      // TODO: run other e2es with this env var
      HIVE_IMPORTER_ONLY_PACKED_DEPS: 1,
    },
  });
  await expect(
    execute({
      query,
    }),
  ).resolves.toEqual(result);
});
