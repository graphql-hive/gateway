import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
const exampleSetup = createExampleSetup(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [
        await service('accounts'),
        await exampleSetup.service('inventory'),
        await exampleSetup.service('products'),
        await exampleSetup.service('reviews'),
      ],
    },
  });
  await expect(
    execute({
      query: exampleSetup.query,
    }),
  ).resolves.toEqual(exampleSetup.result);
});
