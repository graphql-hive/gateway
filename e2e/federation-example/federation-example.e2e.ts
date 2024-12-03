import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);
it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: await supergraph(),
  });
  await expect(
    execute({
      query,
    }),
  ).resolves.toEqual(result);
});
